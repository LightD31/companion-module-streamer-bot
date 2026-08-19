import { InstanceStatus } from '@companion-module/base'
import { Logger, StreamerbotClient, type StreamerbotResponseTypes } from '@streamerbot/client'
import type ModuleInstance from './main.js'
import { errorMessage, firstOf, toVariableValue } from './util.js'
import { eventVariableId, eventVariableValues, globalVariableId } from './variables.js'

/** Shape of every event pushed by Streamer.bot; only the Twitch source is typed by the client. */
export interface StreamerbotEventMessage {
	timeStamp: string
	event: { source: string; type: string }
	data: unknown
}

/** Longest flash window offered by the "recent event" feedback. */
export const MAX_FLASH_DURATION = 10000

const FLASH_TICK_INTERVAL = 200
const CONNECT_TIMEOUT = 5000
const RECONNECT_BASE_DELAY = 2000
const RECONNECT_MAX_DELAY = 30000
/** Bad credentials will not fix themselves quickly, so back off harder before retrying. */
const AUTH_FAILURE_DELAY = 30000

const GLOBAL_EVENT_TYPES = new Set([
	'GlobalVariableUpdated',
	'GlobalVariableCreated',
	'GlobalVariableDeleted',
	'UserGlobalVariableUpdated',
])

/**
 * Owns the Streamer.bot WebSocket client and keeps the module's state in sync with it.
 *
 * Reconnection is supervised here rather than by `@streamerbot/client`: Node's built-in WebSocket
 * never fires a `close` event when the initial TCP connection is refused, so the client's own
 * auto-reconnect loop never starts when Streamer.bot is not running yet. Since Companion is
 * routinely launched before Streamer.bot, that is the common case rather than an edge case.
 *
 * Every attempt builds a fresh client. Callbacks and event listeners are guarded against the
 * client they belong to, so a socket abandoned mid-handshake can never write into the module
 * state after a newer attempt has taken over.
 */
export class StreamerbotConnection {
	readonly #self: ModuleInstance
	#client: StreamerbotClient | undefined
	#flashTimer: NodeJS.Timeout | undefined
	#globalsTimer: NodeJS.Timeout | undefined
	#reconnectTimer: NodeJS.Timeout | undefined
	#attempts = 0
	#authFailed = false
	#stopped = false
	#destroyed = false

	constructor(self: ModuleInstance) {
		this.#self = self
	}

	/** Throwing accessor for action callbacks, which should fail loudly when offline. */
	requireClient(): StreamerbotClient {
		if (!this.#client || !this.#self.state.connected) {
			throw new Error('Not connected to Streamer.bot')
		}
		return this.#client
	}

	/** Start (or restart) the connection, applying the current config. */
	async connect(): Promise<void> {
		await this.#teardown()
		if (this.#destroyed) return

		const self = this.#self
		if (!self.config.host) {
			self.updateStatus(InstanceStatus.BadConfig, 'No address configured')
			return
		}

		this.#stopped = false
		this.#attempts = 0
		self.updateStatus(InstanceStatus.Connecting)
		this.#attempt()
		this.#startGlobalsPolling()
	}

	/** Stop the connection and any pending reconnection. */
	async disconnect(): Promise<void> {
		this.#stopped = true
		await this.#teardown()

		this.#self.updateStatus(InstanceStatus.Disconnected)
		this.#self.state.reset()
		this.#self.syncStateVariables()
		this.#self.checkFeedbacks('connection_state', 'stream_live', 'action_enabled')
	}

	async destroy(): Promise<void> {
		this.#destroyed = true
		await this.disconnect()
	}

	/** Reload the data that backs the action dropdowns and the instance variables. */
	async refreshData(): Promise<void> {
		const client = this.#client
		if (!client) return
		const self = this.#self
		const state = self.state

		await Promise.allSettled([
			(async () => {
				const response = await client.getActions()
				if (response.status === 'ok') state.actions = response.actions
			})(),
			(async () => {
				const response = await client.getCodeTriggers()
				if (response.status === 'ok') state.codeTriggers = response.triggers
			})(),
			(async () => {
				// Requires Streamer.bot 0.2.5+; older instances simply answer with an error.
				const response = await client.getCommands()
				if (response.status === 'ok') state.commands = response.commands
			})(),
			(async () => {
				const response = await client.getBroadcaster()
				if (response.status === 'ok') this.#applyBroadcaster(response.platforms)
			})(),
			(async () => {
				// The catalog is what lets the event-counter variables be declared before the first
				// matching event, so they can be picked in the trigger editor straight away.
				const response = await client.getEvents()
				if (response.status !== 'ok') return

				const catalog: Record<string, string[]> = {}
				for (const [source, types] of Object.entries(response.events as Record<string, readonly string[]>)) {
					catalog[source] = [...types]
				}
				state.eventCatalog = catalog
			})(),
			this.refreshGlobals(),
		])

		if (this.#client !== client) return

		self.refreshDefinitions()
		self.syncStateVariables()
		self.checkAllFeedbacks()
	}

	/** Reload mirrored global variables from Streamer.bot. */
	async refreshGlobals(): Promise<void> {
		const client = this.#client
		const self = this.#self
		if (!client || !self.config.syncGlobals) return

		try {
			const response = await client.getGlobals(true)
			if (response.status !== 'ok' || this.#client !== client) return

			self.state.globals.clear()
			for (const [name, variable] of Object.entries(response.variables ?? {})) {
				if (!self.shouldMirrorGlobal(name)) continue
				self.state.globals.set(name, variable?.value ?? null)
			}
			self.refreshDefinitions()
			self.syncStateVariables()
			self.checkFeedbacks('global_variable', 'global_variable_value')
		} catch (error) {
			self.log('debug', `Failed to read global variables: ${errorMessage(error)}`)
		}
	}

	/** Escape hatch for the "raw request" action, so new Streamer.bot requests work without a module update. */
	async rawRequest(request: Record<string, unknown>): Promise<StreamerbotResponseTypes> {
		const client = this.requireClient()
		return client.request(request as Parameters<StreamerbotClient['request']>[0])
	}

	#attempt(): void {
		const self = this.#self
		const config = self.config
		const password = self.secrets?.password ?? ''
		this.#attempts += 1

		const client: StreamerbotClient = new StreamerbotClient({
			scheme: config.scheme,
			host: config.host,
			port: config.port,
			endpoint: config.endpoint || '/',
			password: password || undefined,
			immediate: false,
			// Reconnection is supervised by this class; see the note on the class.
			autoReconnect: false,
			retries: 0,
			logger: new Logger({
				level: 'warn',
				customLogger: (level, ...args) => {
					const text = args.map((arg) => (typeof arg === 'string' ? arg : errorMessage(arg))).join(' ')
					self.log(level === 'warn' || level === 'error' ? level : 'debug', `[client] ${text}`)
				},
			}),
			onConnect: (info) => {
				if (this.#client !== client) return
				this.#attempts = 0
				self.state.connected = true
				self.state.authenticated = client.authenticated
				self.state.info = info
				self.updateStatus(InstanceStatus.Ok)
				self.log('info', `Connected to ${info.name} v${info.version} (${info.os})`)
				self.syncStateVariables()
				self.checkFeedbacks('connection_state')
				void this.refreshData()
			},
			onDisconnect: () => {
				if (this.#client !== client) return
				const wasConnected = self.state.connected
				self.state.connected = false
				self.state.authenticated = false
				if (wasConnected) self.log('info', 'Disconnected from Streamer.bot')
				self.syncStateVariables()
				self.checkFeedbacks('connection_state')
				this.#scheduleReconnect(wasConnected ? 'Connection lost' : undefined)
			},
			onError: (error) => {
				if (this.#client !== client) return
				const message = errorMessage(error)
				self.log('debug', `WebSocket error: ${message}`)

				// The client collapses every failed request into a generic "Request failed", discarding the
				// server's reason. During the handshake, with a password configured, that is a rejected
				// Authenticate request; a wrong password is by far the likeliest cause.
				const looksLikeAuthFailure =
					/auth/i.test(message) || (!!password && !self.state.connected && /request failed/i.test(message))

				if (looksLikeAuthFailure) {
					this.#authFailed = true
					self.updateStatus(InstanceStatus.AuthenticationFailure, 'Authentication failed, check the WebSocket password')
					void this.#retire(client)
					this.#scheduleReconnect()
					return
				}

				if (!self.state.connected) {
					// A refused connection surfaces here as an error and never as a close event, so the
					// pending connect() would otherwise sit until its timeout before we could retry.
					self.updateStatus(InstanceStatus.ConnectionFailure, message)
					void this.#retire(client)
					this.#scheduleReconnect()
				}
			},
		})

		this.#client = client
		this.#registerListeners(client)

		client.connect(CONNECT_TIMEOUT).catch((error) => {
			// A fast-failed attempt has already been retired and rescheduled by onError.
			if (this.#client !== client) return
			const message = errorMessage(error)
			// The first failure is worth a visible log line; repeats would just spam the log.
			self.log(this.#attempts === 1 ? 'warn' : 'debug', `Could not connect to Streamer.bot: ${message}`)
			if (!this.#authFailed) self.updateStatus(InstanceStatus.ConnectionFailure, message)
			this.#scheduleReconnect()
		})
	}

	#scheduleReconnect(reason?: string): void {
		if (this.#stopped || this.#destroyed || this.#reconnectTimer) return

		const self = this.#self
		if (!self.config.autoReconnect) {
			self.updateStatus(InstanceStatus.Disconnected, reason)
			return
		}

		const delay = this.#authFailed
			? AUTH_FAILURE_DELAY
			: Math.min(RECONNECT_BASE_DELAY * this.#attempts, RECONNECT_MAX_DELAY)

		if (!this.#authFailed) {
			self.updateStatus(InstanceStatus.Connecting, reason ?? `Retrying in ${Math.round(delay / 1000)}s`)
		}

		this.#reconnectTimer = setTimeout(() => {
			this.#reconnectTimer = undefined
			if (this.#stopped || this.#destroyed) return
			void this.#retire(this.#client)
			this.#authFailed = false
			this.#attempt()
		}, delay)
	}

	/** Detach and close a client we are done with, without blocking the caller. */
	async #retire(client: StreamerbotClient | undefined): Promise<void> {
		if (!client) return
		if (this.#client === client) this.#client = undefined
		try {
			// A socket that never finished its handshake stays in CONNECTING forever unless closed.
			await client.disconnect()
		} catch {
			// disconnect() times out when the socket never opened; nothing to recover from.
		}
	}

	async #teardown(): Promise<void> {
		this.#stopTimers()
		const client = this.#client
		this.#client = undefined
		this.#authFailed = false
		await this.#retire(client)
	}

	#registerListeners(client: StreamerbotClient): void {
		const self = this.#self
		const handler = (payload: StreamerbotEventMessage) => {
			if (this.#client !== client) return
			this.#handleEvent(payload)
		}

		// `on()` records the listener now and subscribes once the handshake completes.
		const listen = (pattern: string) => {
			void (client.on as (event: string, listener: (payload: StreamerbotEventMessage) => void) => Promise<void>)(
				pattern,
				handler,
			)
		}

		if (self.config.subscribeAll) {
			listen('*')
			return
		}

		const sources = self.subscribedEventSources()
		if (sources.length === 0) {
			self.log('warn', 'No event sources selected; no variables or feedbacks will update from Streamer.bot')
			return
		}

		for (const source of sources) listen(`${source}.*`)
	}

	#handleEvent(payload: StreamerbotEventMessage): void {
		const self = this.#self
		const source = payload?.event?.source ?? ''
		const type = payload?.event?.type ?? ''
		if (!source || !type) return

		const eventKey = self.state.noteEvent(source, type, payload.timeStamp ?? new Date().toISOString())

		if (self.config.logEvents) {
			self.log('debug', `Event ${source}.${type}: ${toVariableValue(payload.data)}`)
		}

		const values = eventVariableValues(source, type, payload.data, self.state)

		if (self.config.exposeEventVariables) {
			const count = self.state.eventCounts.get(eventKey) ?? 0
			// An event type outside the catalog, or from a source no longer subscribed, has no
			// definition yet; declare it before publishing a value for it.
			if (count === 1) self.refreshDefinitions()
			values[eventVariableId(source, type)] = count
		}

		const globalsChanged =
			source === 'Misc' && GLOBAL_EVENT_TYPES.has(type) && this.#applyGlobalEvent(type, payload.data)
		if (globalsChanged) {
			self.refreshDefinitions()
			for (const [name, value] of self.state.globals) {
				values[globalVariableId(name)] = toVariableValue(value)
			}
			values.global_count = self.state.globals.size
		}

		self.setVariableValues(values)

		self.checkFeedbacks('event_flash')
		if (type.startsWith('Stream') || type.startsWith('Broadcast')) {
			self.checkFeedbacks('stream_live')
		}
		if (globalsChanged) self.checkFeedbacks('global_variable', 'global_variable_value')

		this.#startFlashTicker()
	}

	/** @returns whether the mirrored globals actually changed. */
	#applyGlobalEvent(type: string, data: unknown): boolean {
		const self = this.#self
		if (!self.config.syncGlobals) return false

		const name = firstOf(data, ['name', 'variableName', 'variable.name'])
		if (typeof name !== 'string' || !name) return false
		if (!self.shouldMirrorGlobal(name)) return false

		if (type === 'GlobalVariableDeleted') {
			return self.state.globals.delete(name)
		}

		const raw = firstOf(data, ['newValue', 'value', 'variable.value'])
		const value = raw === undefined ? null : (raw as string | number | boolean | null)
		self.state.globals.set(name, value)
		return true
	}

	#applyBroadcaster(platforms: Record<string, unknown> | undefined): void {
		const state = this.#self.state
		for (const [platform, info] of Object.entries(platforms ?? {})) {
			if (!(platform in state.platforms)) continue
			const target = state.platforms[platform as keyof typeof state.platforms]
			target.broadcaster = String(
				toVariableValue(
					firstOf(info, ['broadcastUserName', 'broadcasterUserName', 'broadcastUser', 'broadcasterLogin']),
				),
			)
			target.broadcasterId = String(toVariableValue(firstOf(info, ['broadcastUserId', 'broadcasterUserId'])))
			target.bot = String(toVariableValue(firstOf(info, ['botUserName', 'botUser', 'botLogin'])))
		}
	}

	/**
	 * The "recent event" feedback is time-based, so it has to be re-evaluated while a flash window is
	 * open. One shared ticker covers every placed instance and stops once no event is recent enough.
	 */
	#startFlashTicker(): void {
		if (this.#flashTimer) return

		this.#flashTimer = setInterval(() => {
			const newest = Math.max(0, ...this.#self.state.lastEventAt.values())
			if (Date.now() - newest > MAX_FLASH_DURATION) {
				this.#stopFlashTicker()
			}
			this.#self.checkFeedbacks('event_flash')
		}, FLASH_TICK_INTERVAL)
	}

	#stopFlashTicker(): void {
		if (this.#flashTimer) {
			clearInterval(this.#flashTimer)
			this.#flashTimer = undefined
		}
	}

	#startGlobalsPolling(): void {
		const { syncGlobals, globalsPollInterval } = this.#self.config
		if (!syncGlobals || !globalsPollInterval || globalsPollInterval <= 0) return

		this.#globalsTimer = setInterval(() => {
			if (this.#self.state.connected) void this.refreshGlobals()
		}, globalsPollInterval * 1000)
	}

	#stopTimers(): void {
		this.#stopFlashTicker()
		if (this.#globalsTimer) {
			clearInterval(this.#globalsTimer)
			this.#globalsTimer = undefined
		}
		if (this.#reconnectTimer) {
			clearTimeout(this.#reconnectTimer)
			this.#reconnectTimer = undefined
		}
	}
}

import type { DropdownChoice, JsonValue } from '@companion-module/base'
import type { StreamerbotPlatform } from '@streamerbot/client'
import { EVENT_SOURCE_CHOICES, PLATFORM_CHOICES } from './events.js'
import type ModuleInstance from './main.js'
import { errorMessage, parseArgs } from './util.js'

export type ActionsSchema = {
	do_action: { options: { action: string; args: string; customEventResponse: boolean }; result: JsonValue }
	do_action_by_name: { options: { name: string; args: string; customEventResponse: boolean }; result: JsonValue }
	execute_code_trigger: { options: { trigger: string; args: string; customEventResponse: boolean }; result: JsonValue }
	send_message: {
		options: { platform: string; message: string; bot: boolean; internal: boolean; replyId: string }
	}
	get_global: { options: { name: string; persisted: boolean }; result: JsonValue }
	get_user_global: {
		options: { platform: string; userId: string; name: string; persisted: boolean }
		result: JsonValue
	}
	refresh_globals: { options: Record<string, never> }
	refresh_data: { options: Record<string, never> }
	get_credits: { options: Record<string, never>; result: JsonValue }
	test_credits: { options: Record<string, never> }
	clear_credits: { options: Record<string, never> }
	connection: { options: { mode: string } }
	subscriptions: { options: { mode: string; sources: string[] } }
	raw_request: { options: { request: string }; result: JsonValue }
}

const ARGS_FIELD = {
	id: 'args' as const,
	type: 'textinput' as const,
	label: 'Arguments (JSON object)',
	default: '',
	multiline: true,
	useVariables: true,
	tooltip: 'Passed to Streamer.bot as action arguments, e.g. {"user": "$(streamer-bot:last_chat_user)"}',
}

const CUSTOM_RESPONSE_FIELD = {
	id: 'customEventResponse' as const,
	type: 'checkbox' as const,
	label: 'Wait for a Custom event response',
	default: false,
	tooltip: 'The action must emit a Custom event carrying the request id for this to resolve',
}

function actionChoices(self: ModuleInstance): DropdownChoice[] {
	return [...self.state.actions]
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((action) => ({
			id: action.id,
			label: action.group ? `${action.group} / ${action.name}` : action.name,
		}))
}

function codeTriggerChoices(self: ModuleInstance): DropdownChoice[] {
	return [...self.state.codeTriggers]
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((trigger) => ({
			id: trigger.name,
			label: trigger.category ? `${trigger.category} / ${trigger.name}` : trigger.name,
		}))
}

/** Turn a Streamer.bot response into an action result, failing loudly on error responses. */
function unwrap(response: unknown, what: string): JsonValue {
	const status = (response as { status?: string } | undefined)?.status
	if (status && status !== 'ok') {
		const error = (response as { error?: string }).error ?? status
		throw new Error(`${what} failed: ${error}`)
	}
	return (response ?? null) as JsonValue
}

export function UpdateActions(self: ModuleInstance): void {
	const knownActions = actionChoices(self)
	const knownTriggers = codeTriggerChoices(self)

	self.setActionDefinitions({
		do_action: {
			name: 'Run action',
			description: 'Run a Streamer.bot action by id',
			hasResult: true,
			options: [
				{
					id: 'action',
					type: 'dropdown',
					label: 'Action',
					default: knownActions[0]?.id ?? '',
					choices: knownActions,
					allowCustom: true,
					tooltip: 'Pick an action, or enter an action id directly',
					minChoicesForSearch: 0,
				},
				ARGS_FIELD,
				CUSTOM_RESPONSE_FIELD,
			],
			callback: async (event) => {
				const client = self.connection.requireClient()
				const args = parseArgs(event.options.args)
				const response = await client.doAction(event.options.action, args, {
					customEventResponse: event.options.customEventResponse,
				})
				return unwrap(response, 'DoAction')
			},
		},

		do_action_by_name: {
			name: 'Run action (by name)',
			description: 'Run a Streamer.bot action by name, useful when the action id is not stable',
			hasResult: true,
			options: [
				{
					id: 'name',
					type: 'textinput',
					label: 'Action name',
					default: '',
					useVariables: true,
				},
				ARGS_FIELD,
				CUSTOM_RESPONSE_FIELD,
			],
			callback: async (event) => {
				const client = self.connection.requireClient()
				const args = parseArgs(event.options.args)
				const response = await client.doAction({ name: event.options.name }, args, {
					customEventResponse: event.options.customEventResponse,
				})
				return unwrap(response, 'DoAction')
			},
		},

		execute_code_trigger: {
			name: 'Execute code trigger',
			description: 'Fire a custom code trigger registered by a C# action',
			hasResult: true,
			options: [
				{
					id: 'trigger',
					type: 'dropdown',
					label: 'Trigger',
					default: knownTriggers[0]?.id ?? '',
					choices: knownTriggers,
					allowCustom: true,
					minChoicesForSearch: 0,
				},
				ARGS_FIELD,
				CUSTOM_RESPONSE_FIELD,
			],
			callback: async (event) => {
				const client = self.connection.requireClient()
				const args = parseArgs(event.options.args)
				const response = await client.executeCodeTrigger(event.options.trigger, args, {
					customEventResponse: event.options.customEventResponse,
				})
				return unwrap(response, 'ExecuteCodeTrigger')
			},
		},

		send_message: {
			name: 'Send chat message',
			description: 'Requires authentication to be enabled on the Streamer.bot WebSocket Server',
			options: [
				{
					id: 'platform',
					type: 'dropdown',
					label: 'Platform',
					default: 'twitch',
					choices: PLATFORM_CHOICES,
				},
				{
					id: 'message',
					type: 'textinput',
					label: 'Message',
					default: '',
					useVariables: true,
					multiline: true,
				},
				{
					id: 'bot',
					type: 'checkbox',
					label: 'Send from the bot account',
					default: false,
				},
				{
					id: 'internal',
					type: 'checkbox',
					label: 'Trigger Streamer.bot events for this message',
					default: true,
				},
				{
					id: 'replyId',
					type: 'textinput',
					label: 'Reply to message id (Twitch/Kick, optional)',
					default: '',
					useVariables: true,
				},
			],
			callback: async (event) => {
				const client = self.connection.requireClient()
				if (!client.authenticated) {
					throw new Error(
						'Sending chat messages requires an authenticated WebSocket. Enable authentication in Streamer.bot and set the password in this connection.',
					)
				}
				const response = await client.sendMessage(
					event.options.platform as StreamerbotPlatform,
					event.options.message,
					{
						bot: event.options.bot,
						internal: event.options.internal,
						replyId: event.options.replyId || undefined,
					},
				)
				unwrap(response, 'SendMessage')
			},
		},

		get_global: {
			name: 'Read global variable',
			description: 'Read a Streamer.bot global variable and return its value as the action result',
			hasResult: true,
			options: [
				{
					id: 'name',
					type: 'textinput',
					label: 'Variable name',
					default: '',
					useVariables: true,
				},
				{
					id: 'persisted',
					type: 'checkbox',
					label: 'Persisted',
					default: true,
				},
			],
			callback: async (event) => {
				const client = self.connection.requireClient()
				const response = await client.getGlobal(event.options.name, event.options.persisted)
				unwrap(response, 'GetGlobal')
				const variable = (response as { variable?: { value?: JsonValue } }).variable
				return variable?.value ?? null
			},
		},

		get_user_global: {
			name: 'Read user global variable',
			hasResult: true,
			options: [
				{
					id: 'platform',
					type: 'dropdown',
					label: 'Platform',
					default: 'twitch',
					choices: PLATFORM_CHOICES,
				},
				{
					id: 'userId',
					type: 'textinput',
					label: 'User id',
					default: '',
					useVariables: true,
				},
				{
					id: 'name',
					type: 'textinput',
					label: 'Variable name (blank for all)',
					default: '',
					useVariables: true,
				},
				{
					id: 'persisted',
					type: 'checkbox',
					label: 'Persisted',
					default: true,
				},
			],
			callback: async (event) => {
				const client = self.connection.requireClient()
				const response = await client.getUserGlobal(
					event.options.platform as StreamerbotPlatform,
					event.options.userId,
					event.options.name || null,
					event.options.persisted,
				)
				unwrap(response, 'GetUserGlobal')
				const single = (response as { variable?: { value?: JsonValue } }).variable
				if (single) return single.value ?? null
				return (response as { variables?: JsonValue }).variables ?? null
			},
		},

		refresh_globals: {
			name: 'Refresh mirrored global variables',
			options: [],
			callback: async () => {
				await self.connection.refreshGlobals()
			},
		},

		refresh_data: {
			name: 'Refresh actions, triggers and broadcaster info',
			options: [],
			callback: async () => {
				await self.connection.refreshData()
			},
		},

		get_credits: {
			name: 'Get credits',
			hasResult: true,
			options: [],
			callback: async () => {
				const client = self.connection.requireClient()
				return unwrap(await client.getCredits(), 'GetCredits')
			},
		},

		test_credits: {
			name: 'Test credits (populate with fake data)',
			options: [],
			callback: async () => {
				const client = self.connection.requireClient()
				unwrap(await client.testCredits(), 'TestCredits')
			},
		},

		clear_credits: {
			name: 'Clear credits',
			options: [],
			callback: async () => {
				const client = self.connection.requireClient()
				unwrap(await client.clearCredits(), 'ClearCredits')
			},
		},

		connection: {
			name: 'Connection control',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Action',
					default: 'reconnect',
					choices: [
						{ id: 'connect', label: 'Connect' },
						{ id: 'disconnect', label: 'Disconnect' },
						{ id: 'reconnect', label: 'Reconnect' },
					],
				},
			],
			callback: async (event) => {
				switch (event.options.mode) {
					case 'connect':
						if (!self.state.connected) await self.connection.connect()
						break
					case 'disconnect':
						await self.connection.disconnect()
						break
					default:
						await self.connection.connect()
						break
				}
			},
		},

		subscriptions: {
			name: 'Change event subscriptions',
			description: 'Subscribe or unsubscribe at runtime; the connection config is not modified',
			options: [
				{
					id: 'mode',
					type: 'dropdown',
					label: 'Action',
					default: 'subscribe',
					choices: [
						{ id: 'subscribe', label: 'Subscribe' },
						{ id: 'unsubscribe', label: 'Unsubscribe' },
					],
				},
				{
					id: 'sources',
					type: 'multidropdown',
					label: 'Event sources',
					default: [],
					choices: EVENT_SOURCE_CHOICES,
				},
			],
			callback: async (event) => {
				const client = self.connection.requireClient()
				const sources = event.options.sources ?? []
				if (sources.length === 0) return

				const all = await client.getEvents()
				if (all.status !== 'ok') throw new Error('Could not read the event list from Streamer.bot')

				const subscription: Record<string, string[]> = {}
				for (const source of sources) {
					const types = (all.events as Record<string, readonly string[]>)[source]
					if (types?.length) subscription[source] = [...types]
				}

				const request = subscription as Parameters<typeof client.subscribe>[0]
				const response =
					event.options.mode === 'unsubscribe' ? await client.unsubscribe(request) : await client.subscribe(request)
				unwrap(response, 'Subscribe')
			},
		},

		raw_request: {
			name: 'Send raw request',
			description: 'Send any Streamer.bot WebSocket request as raw JSON, e.g. {"request": "GetInfo"}',
			hasResult: true,
			options: [
				{
					id: 'request',
					type: 'textinput',
					label: 'Request (JSON object)',
					default: '{"request": "GetInfo"}',
					multiline: true,
					useVariables: true,
				},
			],
			callback: async (event) => {
				const parsed = parseArgs(event.options.request)
				if (!parsed || typeof parsed.request !== 'string') {
					throw new Error('The JSON object must contain a "request" property, e.g. {"request": "GetInfo"}')
				}
				try {
					return unwrap(await self.connection.rawRequest(parsed), String(parsed.request))
				} catch (error) {
					throw new Error(`Raw request failed: ${errorMessage(error)}`, { cause: error })
				}
			},
		},
	})
}

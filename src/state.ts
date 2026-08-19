import type { StreamerbotAction, StreamerbotCommand, StreamerbotInfo } from '@streamerbot/client'
import type { Platform } from './events.js'

export interface CodeTrigger {
	name: string
	eventName: string
	category: string
}

export interface PlatformState {
	live: boolean
	viewers: number
	broadcaster: string
	broadcasterId: string
	bot: string
}

function emptyPlatformState(): PlatformState {
	return { live: false, viewers: 0, broadcaster: '', broadcasterId: '', bot: '' }
}

/**
 * Everything the module knows about the connected Streamer.bot instance.
 *
 * Written by the connection layer, read by variables, feedbacks and action dropdowns.
 */
export class ModuleState {
	connected = false
	authenticated = false
	info: StreamerbotInfo | undefined = undefined

	actions: StreamerbotAction[] = []
	codeTriggers: CodeTrigger[] = []
	commands: StreamerbotCommand[] = []

	/** Mirrored Streamer.bot global variables, keyed by their original (unsanitized) name. */
	globals = new Map<string, string | number | boolean | null>()

	platforms: Record<Platform, PlatformState> = {
		twitch: emptyPlatformState(),
		youtube: emptyPlatformState(),
		kick: emptyPlatformState(),
		trovo: emptyPlatformState(),
	}

	eventCount = 0
	lastEventSource = ''
	lastEventType = ''
	lastEventTime = ''

	/** Timestamp (ms) of the most recent event per `Source.Type`, used by the event flash feedback. */
	readonly lastEventAt = new Map<string, number>()

	/** Event types offered by the connected instance, keyed by source. Populated from `GetEvents`. */
	eventCatalog: Record<string, string[]> = {}

	/**
	 * How many events of each `Source.Type` have been seen, keyed by the variable id they drive.
	 *
	 * Deliberately not cleared by {@link reset}: these counters are what Companion triggers watch
	 * for a change, so resetting them on a reconnect would fire every trigger watching them.
	 */
	readonly eventCounts = new Map<string, number>()

	reset(): void {
		this.connected = false
		this.authenticated = false
		this.info = undefined
		this.actions = []
		this.codeTriggers = []
		this.commands = []
		this.globals.clear()
		this.platforms = {
			twitch: emptyPlatformState(),
			youtube: emptyPlatformState(),
			kick: emptyPlatformState(),
			trovo: emptyPlatformState(),
		}
	}

	/** @returns the `Source.Type` key, which also keys {@link eventCounts} and {@link lastEventAt}. */
	noteEvent(source: string, type: string, timeStamp: string): string {
		const key = `${source}.${type}`
		this.eventCount += 1
		this.lastEventSource = source
		this.lastEventType = type
		this.lastEventTime = timeStamp
		this.lastEventAt.set(key, Date.now())
		this.eventCounts.set(key, (this.eventCounts.get(key) ?? 0) + 1)
		return key
	}
}

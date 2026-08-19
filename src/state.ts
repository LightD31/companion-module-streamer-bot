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

	noteEvent(source: string, type: string, timeStamp: string): void {
		this.eventCount += 1
		this.lastEventSource = source
		this.lastEventType = type
		this.lastEventTime = timeStamp
		this.lastEventAt.set(`${source}.${type}`, Date.now())
	}
}

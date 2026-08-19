import type { DropdownChoice } from '@companion-module/base'

/**
 * Event sources exposed by Streamer.bot's `GetEvents` request.
 *
 * The authoritative list is fetched from the connected instance at runtime; this static copy only
 * backs the connection config dropdown, which has to be rendered before any connection exists.
 */
export const EVENT_SOURCES = [
	'General',
	'Application',
	'Command',
	'CrowdControl',
	'Custom',
	'DonorDrive',
	'Elgato',
	'FileTail',
	'FileWatcher',
	'Fourthwall',
	'Group',
	'HypeRate',
	'Inputs',
	'Kick',
	'Kofi',
	'MeldStudio',
	'Midi',
	'Misc',
	'Obs',
	'Pallygg',
	'Patreon',
	'Pulsoid',
	'Quote',
	'Raw',
	'Shopify',
	'SpeakerBot',
	'SpeechToText',
	'StreamDeck',
	'StreamElements',
	'StreamerBot',
	'StreamerBotRemote',
	'Streamlabs',
	'StreamlabsDesktop',
	'System',
	'ThrowingSystem',
	'TipeeeStream',
	'TreatStream',
	'Trovo',
	'Twitch',
	'VoiceMod',
	'VTubeStudio',
	'WebsocketClient',
	'WebsocketCustomServer',
	'YouTube',
] as const

export type EventSource = (typeof EVENT_SOURCES)[number]

/** Sources subscribed to when the user has not picked any, chosen to cover the common streaming setup. */
export const DEFAULT_EVENT_SOURCES: string[] = ['General', 'Twitch', 'YouTube', 'Kick', 'Misc', 'Raw', 'Command']

export const EVENT_SOURCE_CHOICES: DropdownChoice[] = EVENT_SOURCES.map((source) => ({
	id: source,
	label: source,
}))

/** Platforms that can carry live/chat state, used by variables and feedbacks. */
export const PLATFORMS = ['twitch', 'youtube', 'kick', 'trovo'] as const
export type Platform = (typeof PLATFORMS)[number]

export const PLATFORM_CHOICES: DropdownChoice[] = [
	{ id: 'twitch', label: 'Twitch' },
	{ id: 'youtube', label: 'YouTube' },
	{ id: 'kick', label: 'Kick' },
	{ id: 'trovo', label: 'Trovo' },
]

/** Map an event source name onto the platform whose state it should update. */
export function platformForSource(source: string): Platform | undefined {
	switch (source) {
		case 'Twitch':
			return 'twitch'
		case 'YouTube':
			return 'youtube'
		case 'Kick':
			return 'kick'
		case 'Trovo':
			return 'trovo'
		default:
			return undefined
	}
}

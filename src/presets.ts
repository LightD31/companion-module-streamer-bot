import { combineRgb } from '@companion-module/base'
import type { CompanionPresetDefinitions, CompanionPresetSection } from '@companion-module/base'
import type ModuleInstance from './main.js'
import type { ModuleSchema } from './main.js'

const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)
const DARK = combineRgb(0, 0, 0)
const GREEN = combineRgb(0, 153, 51)
const RED = combineRgb(204, 0, 0)
const PURPLE = combineRgb(102, 51, 153)
const ORANGE = combineRgb(255, 153, 0)

const BASE_STYLE = {
	size: 'auto' as const,
	color: WHITE,
	bgcolor: DARK,
}

export function UpdatePresets(self: ModuleInstance): void {
	const presets: CompanionPresetDefinitions<ModuleSchema> = {
		connection_status: {
			type: 'simple',
			name: 'Connection status / reconnect',
			style: { ...BASE_STYLE, text: 'Streamer.bot\n$(streamer-bot:connection_status)' },
			steps: [
				{
					down: [{ actionId: 'connection', options: { mode: 'reconnect' } }],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'connection_state',
					options: { state: 'connected' },
					style: { bgcolor: GREEN },
				},
			],
		},

		disconnect: {
			type: 'simple',
			name: 'Disconnect',
			style: { ...BASE_STYLE, text: 'Disconnect' },
			steps: [{ down: [{ actionId: 'connection', options: { mode: 'disconnect' } }], up: [] }],
			feedbacks: [],
		},

		refresh_data: {
			type: 'simple',
			name: 'Refresh actions and triggers',
			style: { ...BASE_STYLE, text: 'Refresh\nSB data' },
			steps: [{ down: [{ actionId: 'refresh_data', options: {} }], up: [] }],
			feedbacks: [],
		},

		run_action: {
			type: 'simple',
			name: 'Run action (pick the action after placing)',
			style: { ...BASE_STYLE, text: 'Run\naction' },
			steps: [
				{
					down: [{ actionId: 'do_action', options: { action: '', args: '', customEventResponse: false } }],
					up: [],
				},
			],
			feedbacks: [],
		},

		run_code_trigger: {
			type: 'simple',
			name: 'Execute code trigger',
			style: { ...BASE_STYLE, text: 'Code\ntrigger' },
			steps: [
				{
					down: [{ actionId: 'execute_code_trigger', options: { trigger: '', args: '', customEventResponse: false } }],
					up: [],
				},
			],
			feedbacks: [],
		},

		send_message: {
			type: 'simple',
			name: 'Send a chat message',
			style: { ...BASE_STYLE, text: 'Send\nmessage' },
			steps: [
				{
					down: [
						{
							actionId: 'send_message',
							options: { platform: 'twitch', message: 'Hello from Companion', bot: false, internal: true, replyId: '' },
						},
					],
					up: [],
				},
			],
			feedbacks: [],
		},

		twitch_live: {
			type: 'simple',
			name: 'Twitch live indicator',
			style: { ...BASE_STYLE, text: 'Twitch\nOFFLINE' },
			previewStyle: { ...BASE_STYLE, text: 'Twitch\nLIVE', bgcolor: RED },
			steps: [{ down: [], up: [] }],
			feedbacks: [
				{
					feedbackId: 'stream_live',
					options: { platform: 'twitch' },
					style: { bgcolor: RED, text: 'Twitch\nLIVE' },
				},
			],
		},

		twitch_viewers: {
			type: 'simple',
			name: 'Twitch viewer count',
			style: { ...BASE_STYLE, text: 'Viewers\n$(streamer-bot:twitch_viewers)' },
			steps: [{ down: [], up: [] }],
			feedbacks: [],
		},

		last_chat: {
			type: 'simple',
			name: 'Last chat message',
			style: { ...BASE_STYLE, size: '7', text: '$(streamer-bot:last_chat_user)\n$(streamer-bot:last_chat_message)' },
			steps: [{ down: [], up: [] }],
			feedbacks: [
				{
					feedbackId: 'event_flash',
					options: { source: 'Twitch', eventType: 'ChatMessage', duration: 1000 },
					style: { bgcolor: PURPLE },
				},
			],
		},

		last_follower: {
			type: 'simple',
			name: 'Last follower',
			style: { ...BASE_STYLE, text: 'Follow\n$(streamer-bot:last_follower)' },
			steps: [{ down: [], up: [] }],
			feedbacks: [
				{
					feedbackId: 'event_flash',
					options: { source: 'Twitch', eventType: 'Follow', duration: 3000 },
					style: { bgcolor: ORANGE, color: BLACK },
				},
			],
		},

		last_sub: {
			type: 'simple',
			name: 'Last subscription',
			style: { ...BASE_STYLE, text: 'Sub\n$(streamer-bot:last_sub_user)' },
			steps: [{ down: [], up: [] }],
			feedbacks: [],
		},

		last_cheer: {
			type: 'simple',
			name: 'Last cheer',
			style: { ...BASE_STYLE, text: '$(streamer-bot:last_cheer_bits) bits\n$(streamer-bot:last_cheer_user)' },
			steps: [{ down: [], up: [] }],
			feedbacks: [],
		},

		last_raid: {
			type: 'simple',
			name: 'Last raid',
			style: { ...BASE_STYLE, text: 'Raid\n$(streamer-bot:last_raid_user)\n$(streamer-bot:last_raid_viewers)' },
			steps: [{ down: [], up: [] }],
			feedbacks: [],
		},

		last_reward: {
			type: 'simple',
			name: 'Last channel point reward',
			style: { ...BASE_STYLE, size: '7', text: '$(streamer-bot:last_reward_name)\n$(streamer-bot:last_reward_user)' },
			steps: [{ down: [], up: [] }],
			feedbacks: [],
		},

		last_event: {
			type: 'simple',
			name: 'Last event received',
			style: { ...BASE_STYLE, size: '7', text: '$(streamer-bot:last_event)' },
			steps: [{ down: [], up: [] }],
			feedbacks: [],
		},
	}

	const structure: CompanionPresetSection<ModuleSchema>[] = [
		{
			id: 'connection',
			name: 'Connection',
			description: 'Connect, disconnect and reload data from Streamer.bot',
			definitions: ['connection_status', 'disconnect', 'refresh_data'],
		},
		{
			id: 'trigger',
			name: 'Trigger Streamer.bot',
			description: 'Run actions, code triggers and send chat messages',
			definitions: ['run_action', 'run_code_trigger', 'send_message'],
		},
		{
			id: 'status',
			name: 'Stream status',
			definitions: ['twitch_live', 'twitch_viewers', 'last_event'],
		},
		{
			id: 'events',
			name: 'Latest events',
			description: 'Buttons showing the most recent chat, follow, sub, cheer, raid and reward',
			definitions: ['last_chat', 'last_follower', 'last_sub', 'last_cheer', 'last_raid', 'last_reward'],
		},
	]

	self.setPresetDefinitions(structure, presets)
}

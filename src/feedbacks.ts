import type { DropdownChoice } from '@companion-module/base'
import { combineRgb } from '@companion-module/base'
import { MAX_FLASH_DURATION } from './connection.js'
import { EVENT_SOURCE_CHOICES, PLATFORMS, PLATFORM_CHOICES } from './events.js'
import type ModuleInstance from './main.js'

export type FeedbacksSchema = {
	connection_state: { type: 'boolean'; options: { state: string } }
	stream_live: { type: 'boolean'; options: { platform: string } }
	action_enabled: { type: 'boolean'; options: { action: string } }
	global_variable: { type: 'boolean'; options: { name: string; comparison: string; value: string } }
	global_variable_value: { type: 'value'; options: { name: string } }
	event_flash: { type: 'boolean'; options: { source: string; eventType: string; duration: number } }
}

const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)
const GREEN = combineRgb(0, 153, 51)
const RED = combineRgb(204, 0, 0)
const PURPLE = combineRgb(102, 51, 153)
const ORANGE = combineRgb(255, 153, 0)

function compare(actual: string | number | boolean | null | undefined, comparison: string, expected: string): boolean {
	const actualText = actual === null || actual === undefined ? '' : String(actual)

	switch (comparison) {
		case 'eq':
			return actualText === expected
		case 'ne':
			return actualText !== expected
		case 'contains':
			return actualText.toLowerCase().includes(expected.toLowerCase())
		case 'gt':
		case 'lt':
		case 'gte':
		case 'lte': {
			const left = Number(actualText)
			const right = Number(expected)
			if (!Number.isFinite(left) || !Number.isFinite(right)) return false
			if (comparison === 'gt') return left > right
			if (comparison === 'lt') return left < right
			if (comparison === 'gte') return left >= right
			return left <= right
		}
		case 'true':
			return actualText.toLowerCase() === 'true' || actualText === '1'
		case 'false':
			return actualText.toLowerCase() === 'false' || actualText === '0' || actualText === ''
		default:
			return false
	}
}

function actionChoices(self: ModuleInstance): DropdownChoice[] {
	return [...self.state.actions]
		.sort((a, b) => a.name.localeCompare(b.name))
		.map((action) => ({
			id: action.id,
			label: action.group ? `${action.group} / ${action.name}` : action.name,
		}))
}

function globalChoices(self: ModuleInstance): DropdownChoice[] {
	return [...self.state.globals.keys()].sort().map((name) => ({ id: name, label: name }))
}

export function UpdateFeedbacks(self: ModuleInstance): void {
	const knownActions = actionChoices(self)
	const knownGlobals = globalChoices(self)

	self.setFeedbackDefinitions({
		connection_state: {
			type: 'boolean',
			name: 'Connection state',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [
				{
					id: 'state',
					type: 'dropdown',
					label: 'State',
					default: 'connected',
					choices: [
						{ id: 'connected', label: 'Connected' },
						{ id: 'disconnected', label: 'Disconnected' },
						{ id: 'authenticated', label: 'Authenticated' },
					],
				},
			],
			callback: (feedback) => {
				switch (feedback.options.state) {
					case 'disconnected':
						return !self.state.connected
					case 'authenticated':
						return self.state.authenticated
					default:
						return self.state.connected
				}
			},
		},

		stream_live: {
			type: 'boolean',
			name: 'Stream is live',
			description: 'Driven by the StreamOnline / StreamOffline events of the selected platform',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [
				{
					id: 'platform',
					type: 'dropdown',
					label: 'Platform',
					default: 'twitch',
					choices: PLATFORM_CHOICES,
				},
			],
			callback: (feedback) => {
				const platform = feedback.options.platform as (typeof PLATFORMS)[number]
				return self.state.platforms[platform]?.live ?? false
			},
		},

		action_enabled: {
			type: 'boolean',
			name: 'Streamer.bot action is enabled',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [
				{
					id: 'action',
					type: 'dropdown',
					label: 'Action',
					default: knownActions[0]?.id ?? '',
					choices: knownActions,
					allowCustom: true,
					minChoicesForSearch: 0,
				},
			],
			callback: (feedback) => {
				const action = self.state.actions.find((candidate) => candidate.id === feedback.options.action)
				return action?.enabled ?? false
			},
		},

		global_variable: {
			type: 'boolean',
			name: 'Global variable comparison',
			description: 'Requires "Mirror global variables" to be enabled in the connection config',
			defaultStyle: { bgcolor: PURPLE, color: WHITE },
			options: [
				{
					id: 'name',
					type: 'dropdown',
					label: 'Variable name',
					default: knownGlobals[0]?.id ?? '',
					choices: knownGlobals,
					allowCustom: true,
					minChoicesForSearch: 0,
				},
				{
					id: 'comparison',
					type: 'dropdown',
					label: 'Comparison',
					default: 'eq',
					choices: [
						{ id: 'eq', label: 'equals' },
						{ id: 'ne', label: 'does not equal' },
						{ id: 'contains', label: 'contains' },
						{ id: 'gt', label: 'is greater than' },
						{ id: 'gte', label: 'is greater than or equal to' },
						{ id: 'lt', label: 'is less than' },
						{ id: 'lte', label: 'is less than or equal to' },
						{ id: 'true', label: 'is true' },
						{ id: 'false', label: 'is false or empty' },
					],
				},
				{
					id: 'value',
					type: 'textinput',
					label: 'Value',
					default: '',
					useVariables: true,
					isVisibleExpression: '$(options:comparison) != "true" && $(options:comparison) != "false"',
				},
			],
			callback: (feedback) => {
				const stored = self.state.globals.get(feedback.options.name)
				return compare(stored, feedback.options.comparison, feedback.options.value ?? '')
			},
		},

		global_variable_value: {
			type: 'value',
			name: 'Global variable value',
			description: 'Exposes a mirrored global variable as a value, for use in local variables',
			options: [
				{
					id: 'name',
					type: 'dropdown',
					label: 'Variable name',
					default: knownGlobals[0]?.id ?? '',
					choices: knownGlobals,
					allowCustom: true,
					minChoicesForSearch: 0,
				},
			],
			callback: (feedback) => {
				const stored = self.state.globals.get(feedback.options.name)
				return stored ?? ''
			},
		},

		event_flash: {
			type: 'boolean',
			name: 'Recent event',
			description: 'True for a short window after a matching event is received',
			defaultStyle: { bgcolor: ORANGE, color: BLACK },
			options: [
				{
					id: 'source',
					type: 'dropdown',
					label: 'Event source',
					default: 'Twitch',
					choices: EVENT_SOURCE_CHOICES,
				},
				{
					id: 'eventType',
					type: 'textinput',
					label: 'Event type (blank for any)',
					default: '',
					tooltip: 'For example ChatMessage, Follow, Cheer, Raid',
				},
				{
					id: 'duration',
					type: 'number',
					label: 'Duration (ms)',
					default: 2000,
					min: 100,
					max: MAX_FLASH_DURATION,
					step: 100,
				},
			],
			callback: (feedback) => {
				const { source, eventType, duration } = feedback.options
				const now = Date.now()
				const window = Math.min(Math.max(duration ?? 2000, 100), MAX_FLASH_DURATION)

				if (eventType) {
					const at = self.state.lastEventAt.get(`${source}.${eventType}`)
					return at !== undefined && now - at < window
				}

				const prefix = `${source}.`
				for (const [key, at] of self.state.lastEventAt) {
					if (key.startsWith(prefix) && now - at < window) return true
				}
				return false
			},
		},
	})
}

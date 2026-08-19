import type { CompanionVariableDefinitions, CompanionVariableValues } from '@companion-module/base'
import { PLATFORMS, platformForSource } from './events.js'
import type ModuleInstance from './main.js'
import type { ModuleState } from './state.js'
import { firstOf, sanitizeVariableId, toVariableValue } from './util.js'

/**
 * The variable ids this module always exposes.
 *
 * Mirrored Streamer.bot globals are added on top of these at runtime, so the definitions are
 * rebuilt whenever the set of known globals changes.
 */
const STATIC_VARIABLES: Record<string, string> = {
	connected: 'Connected to Streamer.bot (true/false)',
	connection_status: 'Connection status',
	authenticated: 'WebSocket authenticated (true/false)',

	sb_name: 'Streamer.bot instance name',
	sb_version: 'Streamer.bot version',
	sb_instance_id: 'Streamer.bot instance id',
	sb_os: 'Streamer.bot host OS',
	sb_os_version: 'Streamer.bot host OS version',

	action_count: 'Number of actions',
	code_trigger_count: 'Number of code triggers',
	command_count: 'Number of commands',
	global_count: 'Number of global variables',

	event_count: 'Events received since connecting',
	last_event: 'Last event (Source.Type)',
	last_event_source: 'Last event source',
	last_event_type: 'Last event type',
	last_event_time: 'Last event timestamp',

	last_chat_platform: 'Last chat message: platform',
	last_chat_user: 'Last chat message: user',
	last_chat_user_id: 'Last chat message: user id',
	last_chat_message: 'Last chat message: text',

	last_follower: 'Last follower: user',
	last_follower_platform: 'Last follower: platform',

	last_sub_user: 'Last subscription: user',
	last_sub_tier: 'Last subscription: tier',
	last_sub_months: 'Last subscription: cumulative months',
	last_gift_sub_user: 'Last gifted subscription: gifter',
	last_gift_sub_count: 'Last gifted subscription: count',

	last_cheer_user: 'Last cheer: user',
	last_cheer_bits: 'Last cheer: bits',

	last_raid_user: 'Last raid: channel',
	last_raid_viewers: 'Last raid: viewers',

	last_reward_name: 'Last channel point reward: name',
	last_reward_user: 'Last channel point reward: user',
	last_reward_input: 'Last channel point reward: user input',
	last_reward_cost: 'Last channel point reward: cost',

	last_donation_user: 'Last donation: user',
	last_donation_amount: 'Last donation: amount',
	last_donation_currency: 'Last donation: currency',
	last_donation_message: 'Last donation: message',

	last_command: 'Last command triggered',
	last_command_user: 'Last command: user',

	last_custom_event: 'Last custom event name',
	last_custom_event_data: 'Last custom event payload (JSON)',

	last_action_run: 'Last Streamer.bot action started',
	last_action_completed: 'Last Streamer.bot action completed',
}

const PLATFORM_VARIABLES: Record<string, string> = {
	live: 'live (true/false)',
	viewers: 'viewer count',
	broadcaster: 'broadcaster name',
	broadcaster_id: 'broadcaster id',
	bot: 'bot account name',
}

/** Companion variable id for a mirrored Streamer.bot global. */
export function globalVariableId(name: string): string {
	return `global_${sanitizeVariableId(name)}`
}

/** Companion variable id for an event type's counter, e.g. `event_twitch_rewardredemption`. */
export function eventVariableId(source: string, type: string): string {
	return `event_${sanitizeVariableId(source)}_${sanitizeVariableId(type)}`
}

/** Split a `Source.Type` state key back into its parts. */
function splitEventKey(key: string): [string, string] {
	const index = key.indexOf('.')
	return index < 0 ? [key, ''] : [key.slice(0, index), key.slice(index + 1)]
}

/**
 * Every event-counter variable that should be defined, as `variableId -> Source.Type`.
 *
 * The catalog of the subscribed sources is declared up front so the variables can be picked in the
 * trigger editor before the first matching event ever arrives. Anything already counted is added on
 * top, so an event from a source that is no longer subscribed, or one missing from the catalog,
 * still keeps a definition for the value it has.
 */
function eventVariableIds(self: ModuleInstance): Map<string, string> {
	const ids = new Map<string, string>()
	if (!self.config.exposeEventVariables) return ids

	const catalog = self.state.eventCatalog
	for (const source of self.subscribedEventSources()) {
		for (const type of catalog[source] ?? []) {
			ids.set(eventVariableId(source, type), `${source}.${type}`)
		}
	}

	for (const key of self.state.eventCounts.keys()) {
		const [source, type] = splitEventKey(key)
		ids.set(eventVariableId(source, type), key)
	}

	return ids
}

export function buildVariableDefinitions(self: ModuleInstance): CompanionVariableDefinitions {
	const definitions: CompanionVariableDefinitions = {}
	const state = self.state

	for (const [id, name] of Object.entries(STATIC_VARIABLES)) {
		definitions[id] = { name }
	}

	for (const platform of PLATFORMS) {
		const label = platform.charAt(0).toUpperCase() + platform.slice(1)
		for (const [suffix, description] of Object.entries(PLATFORM_VARIABLES)) {
			definitions[`${platform}_${suffix}`] = { name: `${label}: ${description}` }
		}
	}

	for (const name of state.globals.keys()) {
		definitions[globalVariableId(name)] = { name: `Global variable: ${name}` }
	}

	for (const [id, key] of eventVariableIds(self)) {
		definitions[id] = { name: `Event count: ${key}` }
	}

	return definitions
}

/**
 * A signature of the variable ids whose existence depends on runtime data.
 *
 * Comparing it lets the module re-send definitions only when the set actually changes, rather than
 * on every data refresh.
 */
export function dynamicVariableSignature(self: ModuleInstance): string {
	const globals = [...self.state.globals.keys()].sort().join(' ')
	const events = [...eventVariableIds(self).keys()].sort().join(' ')
	return `${globals}\n${events}`
}

/** Values derived purely from the current state, refreshed on connect and on data reloads. */
export function stateVariableValues(self: ModuleInstance): CompanionVariableValues {
	const state = self.state
	const values: CompanionVariableValues = {
		connected: state.connected,
		authenticated: state.authenticated,
		sb_name: state.info?.name ?? '',
		sb_version: state.info?.version ?? '',
		sb_instance_id: state.info?.instanceId ?? '',
		sb_os: state.info?.os ?? '',
		sb_os_version: state.info?.osVersion ?? '',
		action_count: state.actions.length,
		code_trigger_count: state.codeTriggers.length,
		command_count: state.commands.length,
		global_count: state.globals.size,
		event_count: state.eventCount,
		last_event: state.lastEventSource ? `${state.lastEventSource}.${state.lastEventType}` : '',
		last_event_source: state.lastEventSource,
		last_event_type: state.lastEventType,
		last_event_time: state.lastEventTime,
	}

	for (const platform of PLATFORMS) {
		const platformState = state.platforms[platform]
		values[`${platform}_live`] = platformState.live
		values[`${platform}_viewers`] = platformState.viewers
		values[`${platform}_broadcaster`] = platformState.broadcaster
		values[`${platform}_broadcaster_id`] = platformState.broadcasterId
		values[`${platform}_bot`] = platformState.bot
	}

	for (const [name, value] of state.globals) {
		values[globalVariableId(name)] = toVariableValue(value)
	}

	// Seed every declared counter, so a variable never sits undefined and the first matching event
	// registers as a 0 -> 1 change for anything triggering on it.
	for (const [id, key] of eventVariableIds(self)) {
		values[id] = state.eventCounts.get(key) ?? 0
	}

	return values
}

const USER_PATHS = [
	'message.displayName',
	'message.username',
	'message.user.name',
	'message.user.displayName',
	'user.displayName',
	'user.name',
	'user.login',
	'displayName',
	'userName',
	'username',
	'user_name',
	'user_login',
	'from_broadcaster_user_name',
	'name',
]

const USER_ID_PATHS = ['message.userId', 'message.user.id', 'user.id', 'userId', 'user_id']

const MESSAGE_PATHS = ['message.message', 'message.text', 'text', 'message', 'comment']

/**
 * Derive variable updates from a Streamer.bot event.
 *
 * Only Twitch payloads are typed by the official client; every other source is untyped and the
 * field names differ per platform and per Streamer.bot release, so each value is resolved from a
 * list of candidate paths rather than a single hardcoded one.
 */
export function eventVariableValues(
	source: string,
	type: string,
	data: unknown,
	state: ModuleState,
): CompanionVariableValues {
	const values: CompanionVariableValues = {
		event_count: state.eventCount,
		last_event: `${source}.${type}`,
		last_event_source: source,
		last_event_type: type,
		last_event_time: state.lastEventTime,
	}

	const platform = platformForSource(source)
	const user = toVariableValue(firstOf(data, USER_PATHS))

	switch (type) {
		case 'ChatMessage':
		case 'Message':
		case 'Whisper':
		case 'BotWhisper': {
			values.last_chat_platform = platform ?? source
			values.last_chat_user = user
			values.last_chat_user_id = toVariableValue(firstOf(data, USER_ID_PATHS))
			values.last_chat_message = toVariableValue(firstOf(data, MESSAGE_PATHS))
			break
		}

		case 'Follow':
		case 'FollowCreated': {
			values.last_follower = user
			values.last_follower_platform = platform ?? source
			break
		}

		case 'Sub':
		case 'ReSub':
		case 'Subscription':
		case 'Resubscription':
		case 'NewSubscriber':
		case 'NewSponsor': {
			values.last_sub_user = user
			values.last_sub_tier = toVariableValue(firstOf(data, ['subTier', 'tier', 'sub_tier', 'level']))
			values.last_sub_months = toVariableValue(
				firstOf(data, ['cumulativeMonths', 'months', 'monthsSubscribed', 'cumulative_months']) ?? 0,
			)
			break
		}

		case 'GiftSub':
		case 'GiftBomb':
		case 'GiftSubscription':
		case 'MassGiftSubscription':
		case 'MembershipGift': {
			values.last_gift_sub_user = user
			values.last_gift_sub_count = toVariableValue(
				firstOf(data, ['subBombCount', 'totalSubsGifted', 'count', 'total', 'gifts']) ?? 1,
			)
			break
		}

		case 'Cheer':
		case 'CoinCheer':
		case 'SpellCast':
		case 'CustomSpellCast': {
			values.last_cheer_user = user
			values.last_cheer_bits = toVariableValue(firstOf(data, ['bits', 'amount', 'value']) ?? 0)
			break
		}

		case 'Raid': {
			values.last_raid_user = user
			values.last_raid_viewers = toVariableValue(firstOf(data, ['viewers', 'viewerCount', 'viewer_count']) ?? 0)
			break
		}

		case 'RewardRedemption':
		case 'RewardRedemptionUpdated':
		case 'AutomaticRewardRedemption': {
			values.last_reward_name = toVariableValue(firstOf(data, ['reward.title', 'reward.name', 'rewardName', 'title']))
			values.last_reward_user = user
			values.last_reward_input = toVariableValue(firstOf(data, ['user_input', 'userInput', 'input', 'message']) ?? '')
			values.last_reward_cost = toVariableValue(firstOf(data, ['reward.cost', 'cost']) ?? 0)
			break
		}

		case 'Donation':
		case 'Tip':
		case 'SuperChat':
		case 'SuperSticker':
		case 'CampaignTip':
		case 'CharityDonation':
		case 'Treat': {
			values.last_donation_user = user
			values.last_donation_amount = toVariableValue(
				firstOf(data, ['amount', 'amount.value', 'formattedAmount', 'value']) ?? 0,
			)
			values.last_donation_currency = toVariableValue(firstOf(data, ['currency', 'amount.currency']) ?? '')
			values.last_donation_message = toVariableValue(firstOf(data, MESSAGE_PATHS) ?? '')
			break
		}

		case 'Triggered': {
			values.last_command = toVariableValue(firstOf(data, ['command', 'commandName', 'name']))
			values.last_command_user = user
			break
		}

		case 'Custom':
		case 'Event':
		case 'CodeEvent': {
			values.last_custom_event = toVariableValue(firstOf(data, ['name', 'eventName', 'trigger', 'id']) ?? type)
			values.last_custom_event_data = toVariableValue(data)
			break
		}

		case 'Action': {
			values.last_action_run = toVariableValue(firstOf(data, ['action.name', 'actionName', 'name']))
			break
		}

		case 'ActionCompleted': {
			values.last_action_completed = toVariableValue(firstOf(data, ['action.name', 'actionName', 'name']))
			break
		}

		default:
			break
	}

	if (platform) {
		const platformState = state.platforms[platform]

		if (type === 'StreamOnline' || type === 'BroadcastStarted' || type === 'BroadcastMonitoringStarted') {
			platformState.live = true
			values[`${platform}_live`] = true
		} else if (type === 'StreamOffline' || type === 'BroadcastEnded' || type === 'BroadcastMonitoringEnded') {
			platformState.live = false
			values[`${platform}_live`] = false
		}

		const viewers = firstOf(data, ['viewers', 'viewerCount', 'viewer_count', 'concurrentViewers', 'count'])
		if (
			(type === 'ViewerCountUpdate' || type === 'PresentViewers' || type === 'StatisticsUpdated') &&
			viewers !== undefined
		) {
			const parsed = Number(Array.isArray(viewers) ? viewers.length : viewers)
			if (Number.isFinite(parsed)) {
				platformState.viewers = parsed
				values[`${platform}_viewers`] = parsed
			}
		}
	}

	return values
}

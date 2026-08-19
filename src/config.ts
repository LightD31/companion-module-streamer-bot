import type { SomeCompanionConfigField } from '@companion-module/base'
import { Regex } from '@companion-module/base'
import { DEFAULT_EVENT_SOURCES, EVENT_SOURCE_CHOICES } from './events.js'

export type ModuleConfig = {
	scheme: 'ws' | 'wss'
	host: string
	port: number
	endpoint: string
	autoReconnect: boolean
	subscribeAll: boolean
	subscriptions: string[]
	syncGlobals: boolean
	globalsFilter: string
	globalsPollInterval: number
	logEvents: boolean
}

/**
 * The WebSocket password lives in the secrets store rather than the config store, so it is never
 * echoed back to the web UI.
 */
export type ModuleSecrets = {
	password: string
}

export const DEFAULT_CONFIG: ModuleConfig = {
	scheme: 'ws',
	host: '127.0.0.1',
	port: 8080,
	endpoint: '/',
	autoReconnect: true,
	subscribeAll: false,
	subscriptions: DEFAULT_EVENT_SOURCES,
	syncGlobals: false,
	globalsFilter: '',
	globalsPollInterval: 0,
	logEvents: false,
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'intro',
			label: 'Streamer.bot WebSocket Server',
			width: 12,
			value:
				'Enable the WebSocket Server in Streamer.bot under <b>Servers/Clients &rarr; WebSocket Server</b>. ' +
				'Defaults are <code>127.0.0.1:8080</code> on endpoint <code>/</code>. ' +
				'If Streamer.bot runs on another machine, set its address to <code>0.0.0.0</code> there and enter that machine&apos;s IP here.',
		},
		{
			type: 'dropdown',
			id: 'scheme',
			label: 'Scheme',
			width: 3,
			default: 'ws',
			choices: [
				{ id: 'ws', label: 'ws (plain)' },
				{ id: 'wss', label: 'wss (TLS)' },
			],
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Address',
			width: 5,
			default: DEFAULT_CONFIG.host,
			regex: Regex.HOSTNAME,
		},
		{
			type: 'number',
			id: 'port',
			label: 'Port',
			width: 2,
			default: DEFAULT_CONFIG.port,
			min: 1,
			max: 65535,
		},
		{
			type: 'textinput',
			id: 'endpoint',
			label: 'Endpoint',
			width: 2,
			default: DEFAULT_CONFIG.endpoint,
			tooltip: 'The endpoint path configured in Streamer.bot, usually /',
		},
		{
			type: 'secret-text',
			id: 'password',
			label: 'Password',
			width: 8,
			tooltip: 'Only required when authentication is enabled on the Streamer.bot WebSocket Server',
		},
		{
			type: 'checkbox',
			id: 'autoReconnect',
			label: 'Reconnect automatically',
			width: 4,
			default: DEFAULT_CONFIG.autoReconnect,
		},
		{
			type: 'static-text',
			id: 'events-header',
			label: 'Events',
			width: 12,
			value: 'Events received from Streamer.bot drive this module&apos;s variables and feedbacks.',
		},
		{
			type: 'checkbox',
			id: 'subscribeAll',
			label: 'Subscribe to all events',
			width: 4,
			default: DEFAULT_CONFIG.subscribeAll,
			tooltip: 'Convenient, but a busy chat will generate a lot of traffic',
			disableAutoExpression: true,
		},
		{
			type: 'multidropdown',
			id: 'subscriptions',
			label: 'Event sources',
			width: 8,
			default: DEFAULT_CONFIG.subscriptions,
			choices: EVENT_SOURCE_CHOICES,
			isVisibleExpression: '!$(options:subscribeAll)',
		},
		{
			type: 'checkbox',
			id: 'logEvents',
			label: 'Log every received event (debug)',
			width: 12,
			default: DEFAULT_CONFIG.logEvents,
		},
		{
			type: 'static-text',
			id: 'globals-header',
			label: 'Global variables',
			width: 12,
			value:
				'Mirror Streamer.bot global variables into Companion variables named <code>$(streamer-bot:global_&lt;name&gt;)</code>. ' +
				'Values are refreshed on connect and whenever Streamer.bot reports a change.',
		},
		{
			type: 'checkbox',
			id: 'syncGlobals',
			label: 'Mirror global variables',
			width: 4,
			default: DEFAULT_CONFIG.syncGlobals,
			disableAutoExpression: true,
		},
		{
			type: 'textinput',
			id: 'globalsFilter',
			label: 'Only these globals (comma separated, blank for all)',
			width: 5,
			default: DEFAULT_CONFIG.globalsFilter,
			isVisibleExpression: '!!$(options:syncGlobals)',
		},
		{
			type: 'number',
			id: 'globalsPollInterval',
			label: 'Poll interval (seconds, 0 to disable)',
			width: 3,
			default: DEFAULT_CONFIG.globalsPollInterval,
			min: 0,
			max: 3600,
			tooltip: 'Optional safety net; Streamer.bot already pushes global variable changes as events',
			isVisibleExpression: '!!$(options:syncGlobals)',
		},
	]
}

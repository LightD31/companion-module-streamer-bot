import {
	InstanceBase,
	InstanceStatus,
	type CompanionVariableValues,
	type SomeCompanionConfigField,
} from '@companion-module/base'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { DEFAULT_CONFIG, GetConfigFields, type ModuleConfig, type ModuleSecrets } from './config.js'
import { StreamerbotConnection } from './connection.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { ModuleState } from './state.js'
import { UpgradeScripts } from './upgrades.js'
import { buildVariableDefinitions, stateVariableValues } from './variables.js'

export type VariablesSchema = CompanionVariableValues

export type ModuleSchema = {
	config: ModuleConfig
	secrets: ModuleSecrets
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config: ModuleConfig = { ...DEFAULT_CONFIG }
	secrets: ModuleSecrets = { password: '' }

	readonly state = new ModuleState()
	readonly connection = new StreamerbotConnection(this)

	/** Cached so the variable definitions are only re-sent when the mirrored global set changes. */
	#definedGlobals = ''

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig, _isFirstInit: boolean, secrets: ModuleSecrets | undefined): Promise<void> {
		this.config = { ...DEFAULT_CONFIG, ...config }
		this.secrets = { password: '', ...secrets }

		this.updateStatus(InstanceStatus.Connecting)
		this.refreshDefinitions()
		this.syncStateVariables()

		await this.connection.connect()
	}

	async destroy(): Promise<void> {
		await this.connection.destroy()
	}

	async configUpdated(config: ModuleConfig, secrets: ModuleSecrets | undefined): Promise<void> {
		this.config = { ...DEFAULT_CONFIG, ...config }
		this.secrets = { password: '', ...secrets }

		// Subscriptions and mirroring are decided when the client is created, so rebuild it wholesale.
		await this.connection.connect()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	/** Rebuild everything whose contents depend on data fetched from Streamer.bot. */
	refreshDefinitions(): void {
		const globalsKey = [...this.state.globals.keys()].sort().join(' ')
		if (globalsKey !== this.#definedGlobals) {
			this.#definedGlobals = globalsKey
			this.setVariableDefinitions(buildVariableDefinitions(this.state))
		}

		UpdateActions(this)
		UpdateFeedbacks(this)
		UpdatePresets(this)
	}

	/** Push the full set of state-derived variable values. */
	syncStateVariables(): void {
		const values = stateVariableValues(this.state)
		values.connection_status = this.#connectionStatusText()
		this.setVariableValues(values)
	}

	#connectionStatusText(): string {
		if (this.state.connected) {
			return this.state.authenticated ? 'Connected (authenticated)' : 'Connected'
		}
		return this.config.autoReconnect ? 'Reconnecting' : 'Disconnected'
	}

	/** Whether a Streamer.bot global should be mirrored, according to the configured filter. */
	shouldMirrorGlobal(name: string): boolean {
		if (!this.config.syncGlobals) return false

		const filter = (this.config.globalsFilter ?? '')
			.split(',')
			.map((entry) => entry.trim().toLowerCase())
			.filter(Boolean)

		return filter.length === 0 || filter.includes(name.toLowerCase())
	}
}

/** Any JSON-ish value coming back from Streamer.bot. Event payloads are untyped for most sources. */
export type UnknownRecord = Record<string, unknown>

/**
 * Turn an arbitrary Streamer.bot name (action name, global variable name, ...) into something
 * usable as a Companion variable id.
 */
export function sanitizeVariableId(name: string): string {
	return name
		.trim()
		.replace(/[^a-zA-Z0-9_-]+/g, '_')
		.replace(/_{2,}/g, '_')
		.replace(/^_|_$/g, '')
		.toLowerCase()
}

/** Parse a JSON object typed by the user. Empty input is treated as "no arguments". */
export function parseArgs(raw: string | undefined): UnknownRecord | undefined {
	const trimmed = (raw ?? '').trim()
	if (!trimmed) return undefined

	let parsed: unknown
	try {
		parsed = JSON.parse(trimmed)
	} catch (error) {
		throw new Error(`Invalid JSON: ${errorMessage(error)}`, { cause: error })
	}

	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new Error('Expected a JSON object, e.g. {"key": "value"}')
	}
	return parsed as UnknownRecord
}

/** Read a nested property using a dotted path, without throwing on missing intermediates. */
function pick(source: unknown, path: string): unknown {
	let current: unknown = source
	for (const segment of path.split('.')) {
		if (typeof current !== 'object' || current === null) return undefined
		current = (current as UnknownRecord)[segment]
	}
	return current
}

/**
 * Return the first defined value among several candidate paths.
 *
 * Streamer.bot event payloads are not consistent between sources (Twitch uses `userName`,
 * the EventSub-shaped events use `user_name`, YouTube uses `user.name`, ...), and they change
 * between releases. Probing a list of candidates keeps the variables populated across versions
 * instead of silently breaking on a rename.
 */
export function firstOf(source: unknown, paths: string[]): unknown {
	for (const path of paths) {
		const value = pick(source, path)
		if (value !== undefined && value !== null && value !== '') return value
	}
	return undefined
}

/** Coerce an unknown payload value into a scalar Companion can store in a variable. */
export function toVariableValue(value: unknown): string | number | boolean {
	if (value === undefined || value === null) return ''
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
	try {
		return JSON.stringify(value) ?? ''
	} catch {
		return Object.prototype.toString.call(value)
	}
}

/** Compact error message for logs and status strings. */
export function errorMessage(error: unknown): string {
	if (error instanceof Error) return error.message
	if (typeof error === 'string') return error
	try {
		return JSON.stringify(error) ?? 'Unknown error'
	} catch {
		return Object.prototype.toString.call(error)
	}
}

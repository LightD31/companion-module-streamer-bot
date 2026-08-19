import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const baseConfig = await generateEslintConfig({
	enableTypescript: true,
})

const customConfig = [
	...baseConfig,
	{
		ignores: ['dist/**', 'node_modules/**', 'pkg/**'],
	},
]

export default customConfig

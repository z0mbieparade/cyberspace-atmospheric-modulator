import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'jsdom',
		globals: true,
		include: ['tests/**/*.test.js'],
		coverage: {
			provider: 'v8',
			include: ['src/**/*.js'],
			exclude: ['src/init.js'], // init has side effects
		},
	},
});

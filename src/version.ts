declare const __APP_VERSION__: string | undefined;

/** The package.json version baked in at build time (see vite.config.ts), or 'dev' outside Vite. */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';

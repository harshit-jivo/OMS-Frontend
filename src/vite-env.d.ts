/// <reference types="vite/client" />

// Injected at build time by Vite's `define` (see vite.config.ts).
//
// These are the ONLY source of the web app's version and build number. Do not
// hardcode a version anywhere else — read it from webDeviceService instead.
declare const __APP_VERSION__: string;
declare const __APP_BUILD_NUMBER__: number;

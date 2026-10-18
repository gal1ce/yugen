/*
 * Which engine the page is running in. yugen is built on QtWebEngine
 * (chromium), but saucer can still be built on WebKitGTK, and the two differ
 * where it matters: WebKitGTK 2.54 takes the web process down when a canvas is
 * drawn from a worker (a race in its accelerated canvas), chromium does not.
 */
export const chromium = typeof navigator !== 'undefined' && /Chrome\//.test(navigator.userAgent)

// canvases may be handed to workers and drawn there
export const workers_draw = chromium

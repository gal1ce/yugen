/*
 * Which engine the page is running in. yugen is built on QtWebEngine
 * (chromium), but saucer can still be built on WebKitGTK, and the two differ
 * where it matters: WebKitGTK 2.54 takes the web process down when a canvas is
 * drawn from a worker (a race in its accelerated canvas), chromium does not.
 */
export const chromium = typeof navigator !== 'undefined' && /Chrome\//.test(navigator.userAgent)

/*
 * Canvases may be handed to workers and drawn there. Nowhere, now: WebKitGTK
 * crashes on it, and on the Qt build a canvas drawn from a worker is a second
 * surface the compositor has to put together with the page on every frame -
 * measured 2026-11-04 with the glyph field up and a track playing, that took
 * VizCompositorThread from 5% of a core to 98%. The same WebGL shader drawn on
 * the page goes out in the page's own frame.
 */
export const workers_draw: boolean = false

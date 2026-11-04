/*
 * Run in the page before its own scripts: the same window.saucer.exposed the
 * desktop's saucer puts there, as a Proxy whose every function posts a call
 * to the app and resolves when the app answers. The interface cannot tell
 * the difference (ui/src/lib/bridge.ts reads it fresh on every call).
 */
export const INJECTED = `
(() => {
    if (window.saucer) return
    let next = 1
    const waiting = new Map()

    // the app answers through here, and pushes the lock screen's commands
    window.__yugen_reply = (id, ok, value) => {
        const call = waiting.get(id)
        if (!call) return
        waiting.delete(id)
        ok ? call.resolve(value) : call.reject(new Error(value))
    }

    // the queue's own functions are optional on the desktop too; a missing one
    // is undefined rather than a call that never answers
    const ABSENT = new Set(['get_audio_frames', 'get_spectrum', 'get_sample_rate', 'get_refresh_rate', 'then'])

    window.saucer = {
        exposed: new Proxy({}, {
            get(_, method) {
                if (typeof method !== 'string' || ABSENT.has(method)) return undefined
                return (...args) => new Promise((resolve, reject) => {
                    const id = next++
                    waiting.set(id, { resolve, reject })
                    window.ReactNativeWebView.postMessage(JSON.stringify({ id, method, args }))
                })
            },
        }),
    }
})();
true;
`

/*
 * How the window is being driven right now: with the pointer, or by walking it
 * with tab. The focus ring is only drawn for the second (index.css).
 *
 * The browser's own guess, :focus-visible, is not enough here. Chromium counts
 * any key as keyboard use, so pressing a shortcut - space to pause, M to mute -
 * rings whichever button was clicked last, and in an app driven by shortcuts
 * that is a ring turning up around a card after nearly every key. Tab, and the
 * arrows inside a menu, are what moving focus by hand looks like; nothing else
 * switches the ring on, and the pointer switches it off again.
 */
const WALKING = new Set(['Tab'])

export function watch_modality() {
    const root = document.documentElement

    const on_key = (e: KeyboardEvent) => {
        if (WALKING.has(e.key) || (e.target instanceof HTMLElement && e.target.closest('[role="menu"]') && e.key.startsWith('Arrow'))) {
            root.dataset.input = 'keys'
        }
    }

    const on_pointer = () => {
        if (root.dataset.input) delete root.dataset.input
    }

    window.addEventListener('keydown', on_key, true)
    window.addEventListener('pointerdown', on_pointer, true)

    return () => {
        window.removeEventListener('keydown', on_key, true)
        window.removeEventListener('pointerdown', on_pointer, true)
    }
}

import { useEffect } from 'react'

// whatever floats closes the way a menu does: a click anywhere, escape, the
// window changing size, or the panel it hangs off scrolling away from it.
// a scroll inside a menu - the list of playlists in Add to - is the menu's
// own, and leaves it where it is
export function useDismiss(open: boolean, close: () => void, { scroll = true } = {}) {
    useEffect(() => {
        if (!open) return

        const on_key = (e: KeyboardEvent) => e.key === 'Escape' && close()

        const on_scroll = (e: Event) => {
            if (e.target instanceof Element && e.target.closest('[role="menu"]')) return
            close()
        }

        // a frame later, so the click that opened it is not the one that closes it
        const timer = setTimeout(() => window.addEventListener('click', close))

        window.addEventListener('keydown', on_key)
        window.addEventListener('resize', close)
        if (scroll) document.addEventListener('scroll', on_scroll, true)

        return () => {
            clearTimeout(timer)
            window.removeEventListener('click', close)
            window.removeEventListener('keydown', on_key)
            window.removeEventListener('resize', close)
            document.removeEventListener('scroll', on_scroll, true)
        }
    }, [open, close, scroll])
}

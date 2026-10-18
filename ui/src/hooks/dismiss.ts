import { useEffect } from 'react'

// whatever floats closes the way a menu does: a click anywhere, escape, the
// window changing size, or the thing it hangs off scrolling away from it
export function useDismiss(open: boolean, close: () => void, { scroll = true } = {}) {
    useEffect(() => {
        if (!open) return

        const on_key = (e: KeyboardEvent) => e.key === 'Escape' && close()

        // a frame later, so the click that opened it is not the one that closes it
        const timer = setTimeout(() => window.addEventListener('click', close))

        window.addEventListener('keydown', on_key)
        window.addEventListener('resize', close)
        if (scroll) document.addEventListener('scroll', close, true)

        return () => {
            clearTimeout(timer)
            window.removeEventListener('click', close)
            window.removeEventListener('keydown', on_key)
            window.removeEventListener('resize', close)
            document.removeEventListener('scroll', close, true)
        }
    }, [open, close, scroll])
}

import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { ui } from '../state/ui'

// whether the page is dark right now: the theme, or the desktop's when it is 'system'
export function useDark() {
    const theme = useStore(ui, (s) => s.theme)
    const [system_dark, set_system_dark] = useState(() => !window.matchMedia('(prefers-color-scheme: light)').matches)

    useEffect(() => {
        const query = window.matchMedia('(prefers-color-scheme: light)')
        const on_change = () => set_system_dark(!query.matches)

        query.addEventListener('change', on_change)
        return () => query.removeEventListener('change', on_change)
    }, [])

    return theme === 'dark' || (theme === 'system' && system_dark)
}

import { useEffect, useState } from 'react'
import { PALETTES, palette_of, type Palette } from '../lib/prefs'
import { useStore } from '../lib/store'
import { ui } from '../state/ui'

// whether the desktop asks for dark
export function useSystemDark() {
    const [system_dark, set_system_dark] = useState(() => !window.matchMedia('(prefers-color-scheme: light)').matches)

    useEffect(() => {
        const query = window.matchMedia('(prefers-color-scheme: light)')
        const on_change = () => set_system_dark(!query.matches)

        query.addEventListener('change', on_change)
        return () => query.removeEventListener('change', on_change)
    }, [])

    return system_dark
}

// the palette on screen right now: the theme, or the desktop's pick when it is 'system'
export function usePalette(): Palette {
    const theme = useStore(ui, (s) => s.theme)
    return palette_of(theme, useSystemDark())
}

// whether that palette is a dark one
export function useDark() {
    const palette = usePalette()
    return PALETTES.find((p) => p.id === palette)?.dark ?? true
}

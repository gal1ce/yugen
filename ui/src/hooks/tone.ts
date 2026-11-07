import { useEffect, useReducer } from 'react'
import { palette_of } from '../lib/palette'

// the strongest colour of a sleeve, read once from its shrunk copy and kept:
// what a card's label is tinted with
const tones = new Map<string, string>()
const asked = new Set<string>()

export function useTone(src?: string | null) {
    const [, landed] = useReducer((count: number) => count + 1, 0)

    useEffect(() => {
        if (!src || tones.has(src) || asked.has(src)) return
        asked.add(src)
        void palette_of(src).then((colours) => {
            tones.set(src, colours[0] ?? '')
            landed()
        })
    }, [src])

    return src ? tones.get(src) || undefined : undefined
}

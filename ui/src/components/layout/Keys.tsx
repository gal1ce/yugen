import { useEffect } from 'react'
import { KEYBINDS, VOLUME_STEP, combo_of } from '../../lib/keys'
import { change_volume, next_shuffle, nudge, player, shuffle_into, skip, toggle_loop, toggle_mute, toggle_pause } from '../../state/player'
import { toggle_like } from '../../state/library'
import { ui } from '../../state/ui'

// the shortcuts. read through the stores when a key lands, so the listener is
// set up once and never holds a stale track or volume
export function Keys() {
    useEffect(() => {
        const on_key = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null
            const tag = target?.tagName

            // anything that takes typing keeps its keys
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return

            const { keybinds } = ui.get()
            const { current, volume } = player.get()
            const combo = combo_of(e)
            const bind = KEYBINDS.find((entry) => keybinds[entry.id] && keybinds[entry.id] === combo)

            if (!bind || (bind.needs_track && !current)) return

            // also keeps the key from pressing whichever button holds focus
            e.preventDefault()

            switch (bind.id) {
                case 'play_pause':
                    return void toggle_pause()
                case 'seek_forward':
                    return nudge(10)
                case 'seek_back':
                    return nudge(-10)
                case 'next_track':
                    return skip(1)
                case 'prev_track':
                    return skip(-1)
                case 'volume_up':
                    return change_volume(Math.min(volume + VOLUME_STEP, 1))
                case 'volume_down':
                    return change_volume(Math.max(volume - VOLUME_STEP, 0))
                case 'toggle_mute':
                    return toggle_mute()
                case 'toggle_like':
                    return current && void toggle_like(current)
                case 'toggle_shuffle':
                    return void shuffle_into(next_shuffle())
                case 'toggle_loop':
                    return void toggle_loop()
                case 'focus_search':
                    ui.set({ search_open: true })
                    // the box may already be open with the caret elsewhere
                    return requestAnimationFrame(() => document.querySelector<HTMLInputElement>('[data-search]')?.focus())
            }
        }

        window.addEventListener('keydown', on_key)
        return () => window.removeEventListener('keydown', on_key)
    }, [])

    return null
}

import { create_store } from '../lib/store'

// how far the page has gone under its bar, 0 at the top to 1 a short way down,
// which is how far into its tear off the top edge the bar is (layout/GlassBar).
// set from the page's scroll, and only ever written when it changes
const LIFT = 56

export const bar = create_store({ lift: 0 })

export function set_scroll(top: number) {
    bar.set({ lift: Math.min(Math.max(top / LIFT, 0), 1) })
}

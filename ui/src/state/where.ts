import { createContext, useContext } from 'react'
import type { View } from '../lib/prefs'
import { useStore } from '../lib/store'
import { ui } from './ui'

/*
 * Which listing a piece of the page draws. On a desktop that is always the
 * one the window is on (ui.view, ui.selection). A phone keeps its tabs
 * standing behind one another (layout/PhonePage), so Songs and Liked are
 * still drawn while Home is in front: each says which listing it is, and
 * what is under it reads that rather than the window's.
 */
export type Where = { view: View; selection: string | null }

export const WhereContext = createContext<Where | null>(null)

// whether the screen this is on is the one in front: a screen kept behind
// another draws nothing that moves (fx painters) and asks for nothing
export const ActiveContext = createContext(true)

export function useWhere(): Where {
    const own = useContext(WhereContext)
    // a screen that says which it is does not render when the window moves on
    const view = useStore(ui, (s) => (own ? own.view : s.view))
    const selection = useStore(ui, (s) => (own ? own.selection : s.selection))

    return { view, selection }
}

export const useActive = () => useContext(ActiveContext)

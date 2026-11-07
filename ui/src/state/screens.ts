import { glide_to } from '../lib/smooth'
import { ui, type UiState } from './ui'
import type { Where } from './where'

// a phone's screens (layout/Screens): which tab is in front, and the ways about them

export type Root = 'home' | 'search' | 'library' | 'songs' | 'liked'
export const ROOTS: Root[] = ['home', 'search', 'library', 'songs', 'liked']

export const LISTS: Partial<Record<Root, Where>> = {
    songs: { view: 'songs', selection: null },
    liked: { view: 'liked', selection: null },
}

export function root_of(s: Pick<UiState, 'page' | 'view' | 'selection'>): Root | null {
    if (s.page === 'search') return 'search'
    if (s.page === 'library') return 'library'
    if (s.page || s.selection) return null
    if (s.view === 'library') return 'home'
    if (s.view === 'songs') return 'songs'
    if (s.view === 'liked') return 'liked'
    return null
}

// each screen's scrolling box, so a tab pressed again can take its screen to the top
export const boxes = new Map<string, HTMLDivElement>()

export function to_top() {
    const at = root_of(ui.get())
    const box = at && boxes.get(at)
    if (box) glide_to(box, 0)
}

// back, from the bar, is the phone's own back: whatever is open closes
// first, a section of settings goes to their list, a page to the one before
export function go_back() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}


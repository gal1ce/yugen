import { default_keybinds, type Bind } from '../lib/keys'
import type { Suggestion } from '../lib/lastfm'
import {
    AURA_RANGE,
    LAYOUT_PREFS,
    LAYOUTS,
    LIBRARY_VIEWS,
    SHELVES,
    SORTS,
    SUGGESTION_VIEWS,
    THEMES,
    save_pref,
    stored_flag,
    stored_list,
    stored_number,
    stored_playback,
    stored_pref,
    type Layout,
    type LayoutKey,
    type LibraryView,
    type Shelf,
    type Sort,
    type SuggestionView,
    type Theme,
    type View,
} from '../lib/prefs'
import type { SearchResult, Source } from '../lib/search'
import type { ViewCover } from './library'
import { create_store } from '../lib/store'

// right-click targets: a track, a playlist in the sidebar, the sidebar itself,
// or a suggestion that is not here yet
export type MenuTarget =
    // `within` is the run of tracks the row was drawn from, when that is a
    // section of its own rather than the listing on screen - see play_from
    | { kind: 'song'; song: string; within?: string[] }
    | { kind: 'playlist'; playlist: string }
    | { kind: 'sidebar' }
    | { kind: 'suggestion'; track: Suggestion }

export type Menu = MenuTarget & { x: number; y: number }

// the full pages drawn instead of the library: every way of navigating has to
// put them away, which is what leave_page is for
export type Page = 'settings' | 'profile' | null

export type CropFor = { kind: 'avatar' } | { kind: 'playlist'; name: string } | { kind: 'track'; name: string } | { kind: 'view'; view: ViewCover }

export type PanelTab = 'lyrics' | 'queue'

export type UiState = {
    view: View
    selection: string | null
    page: Page

    theme: Theme
    // the cover of what is playing colours the app, and this much of it reaches
    // the glow at the top of the window
    aura_on: boolean
    aura: number
    share_dc: boolean
    sort: Sort
    layouts: Record<LayoutKey, Layout>
    library_view: LibraryView
    shelves: Shelf[]
    suggestion_view: SuggestionView
    pins: string[]
    sidebar_hidden: boolean
    // the two side columns, as a share of the frame - see COLUMNS
    sidebar_w: number
    panel_w: number
    panel_hidden: boolean
    panel_tab: PanelTab
    keybinds: Record<Bind, string>

    menu: Menu | null
    // the playlist whose details are being edited
    editing: string | null
    profile_edit: boolean
    crop: { src: string; for: CropFor } | null
    crop_busy: boolean
    info_open: boolean
    info_face: 'about' | 'lyrics'
    // the whole window given over to the words of what is playing
    lyrics_open: boolean

    query: string
    search_open: boolean
    source: Source
    results: SearchResult[]
    searching: boolean
    // how much of the answer is on screen; 'load more' walks it up a page at a time
    shown: number
    // the refs being downloaded, several at once
    downloading: string[]
}

const saved_playback = stored_playback()
const layout_ids = LAYOUTS.map((option) => option.id)

/*
 * The side columns are dragged to a width, kept as a share of the frame so they
 * follow the window when it changes size. The rem pair is the floor and the
 * ceiling: below it a column cannot hold its own rows, above it the page in
 * the middle is what pays.
 */
export const COLUMNS = {
    sidebar: { share: 16, range: [8, 26] as const, rem: [12, 24] as const, key: 'sidebar' },
    panel: { share: 21, range: [10, 32] as const, rem: [15, 32] as const, key: 'rail' },
} as const

export type Column = keyof typeof COLUMNS

export const column_css = (column: Column, share: number) => `clamp(${COLUMNS[column].rem[0]}rem, ${share}%, ${COLUMNS[column].rem[1]}rem)`

export const ui = create_store<UiState>({
    view: saved_playback?.view ?? 'library',
    selection: saved_playback?.selection ?? null,
    page: null,

    theme: stored_pref('theme', THEMES, 'system'),
    aura_on: stored_flag('aura_on', true),
    aura: stored_number('aura', 50, AURA_RANGE),
    share_dc: stored_flag('share_dc', true),
    sort: stored_pref('sort', SORTS.map((s) => s.id), 'title'),
    layouts: {
        library: stored_pref(LAYOUT_PREFS.library, layout_ids, 'grid'),
        liked: stored_pref(LAYOUT_PREFS.liked, layout_ids, 'grid'),
        playlist: stored_pref(LAYOUT_PREFS.playlist, layout_ids, 'list'),
        group: stored_pref(LAYOUT_PREFS.group, layout_ids, 'list'),
    },
    library_view: stored_pref('library_view', LIBRARY_VIEWS.map((o) => o.id), 'list'),
    shelves: stored_list('shelves', SHELVES.map((s) => s.id)),
    suggestion_view: stored_pref('suggestion_view', SUGGESTION_VIEWS.map((o) => o.id), 'grid'),
    pins: stored_list('pins'),
    sidebar_hidden: stored_flag('sidebar_hidden', false),
    // under the keys the old ui wrote, so a width it saved is still the width
    sidebar_w: stored_number('sidebar', COLUMNS.sidebar.share, COLUMNS.sidebar.range),
    panel_w: stored_number('rail', COLUMNS.panel.share, COLUMNS.panel.range),
    panel_hidden: stored_flag('rail_hidden', false),
    panel_tab: stored_pref('panel_tab', ['lyrics', 'queue'] as const, 'lyrics'),
    keybinds: default_keybinds(),

    menu: null,
    editing: null,
    profile_edit: false,
    crop: null,
    crop_busy: false,
    info_open: false,
    info_face: 'about',
    lyrics_open: false,

    query: '',
    search_open: false,
    source: 'yt',
    results: [],
    searching: false,
    shown: 10,
    downloading: [],
})

export { saved_playback }

// one door out of the full pages, and every way of navigating goes through it
export function leave_page() {
    ui.set({ page: null })
}

export function open_view(view: View) {
    ui.set({ page: null, view, selection: null })
}

export function open_playlist(name: string) {
    ui.set({ page: null, view: 'playlist', selection: name })
}

export function open_group(kind: 'albums' | 'artists', name: string) {
    ui.set({ page: null, view: kind, selection: name })
}

export function open_page(page: Page) {
    ui.set({ page, menu: null })
}

// a preference is set and written in the same step, so no caller can do one
// without the other
export function set_pref<K extends keyof UiState>(key: K, value: UiState[K], stored: string = key) {
    ui.set({ [key]: value } as Partial<UiState>)
    save_pref(stored, value as string | string[] | boolean | number)
}

export function set_layout(key: LayoutKey, layout: Layout) {
    ui.set(({ layouts }) => ({ layouts: { ...layouts, [key]: layout } }))
    save_pref(LAYOUT_PREFS[key], layout)
}

export function toggle_pin(name: string) {
    const { pins } = ui.get()
    set_pref('pins', pins.includes(name) ? pins.filter((pin) => pin !== name) : [...pins, name])
}

// a pin points at a name, so it follows a rename and goes with a delete
export function move_pin(name: string, renamed: string | null) {
    const { pins } = ui.get()
    if (!pins.includes(name)) return

    set_pref('pins', renamed ? pins.map((pin) => (pin === name ? renamed : pin)) : pins.filter((pin) => pin !== name))
}

// the native webkit menu is off; this one replaces it, kept inside the window
export function open_menu(target: MenuTarget, x: number, y: number) {
    const height = target.kind === 'song' ? 360 : target.kind === 'playlist' ? 160 : 110

    ui.set({
        menu: {
            ...target,
            x: Math.min(x, window.innerWidth - 232),
            y: Math.min(y, Math.max(window.innerHeight - height, 8)),
        },
    })
}

export const context = (target: MenuTarget) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    open_menu(target, e.clientX, e.clientY)
}

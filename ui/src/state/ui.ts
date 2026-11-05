import { default_keybinds, type Bind } from '../lib/keys'
import type { Suggestion } from '../lib/lastfm'
import {
    DENSITIES,
    LIGHT_RANGE,
    FEELS,
    DEFAULT_PLACES,
    PACES,
    PLACES,
    SEARCH_MODES,
    LAYOUT_PREFS,
    LYRICS_SIZES,
    SCALES,
    SWATCHES,
    LAYOUTS,
    LIBRARY_VIEWS,
    SHELVES,
    SORTS,
    SUGGESTION_VIEWS,
    save_pref,
    stored_radii,
    stored_flag,
    stored_list,
    stored_number,
    stored_playback,
    stored_pref,
    stored_scrolling,
    stored_backdrop,
    stored_theme,
    type Layout,
    type LayoutKey,
    type LibraryView,
    type Shelf,
    type Sort,
    type SuggestionView,
    type Corners,
    type Radius,
    type Region,
    type PrefValue,
    type Density,
    type Feel,
    type Backdrop,
    type Pace,
    type Place,
    type Scrolling,
    type SearchMode,
    type LyricsSize,
    type Scale,
    type Swatch,
    type Theme,
    type View,
} from '../lib/prefs'
import type { SearchResult, Source } from '../lib/search'
import type { ViewCover } from './library'
import { create_store } from '../lib/store'
import { PHONE } from '../hooks/phone'

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
// put them away, which is what leave_page is for. library and search are a
// phone's own: there the sidebar and the search field are tabs of their own
export type Page = 'settings' | 'profile' | 'library' | 'search' | null

export type CropFor = { kind: 'avatar' } | { kind: 'playlist'; name: string } | { kind: 'track'; name: string } | { kind: 'view'; view: ViewCover }

export type PanelTab = 'lyrics' | 'queue'

export type SheetFace = 'player' | 'lyrics' | 'queue'

export type UiState = {
    view: View
    selection: string | null
    page: Page

    theme: Theme
    // the cover of what is playing gives the app its accent; without one, or
    // with this off, the swatch picked in settings does
    cover_accent: boolean
    // the cover's light behind the panels (fx/Ambient), and how strong it is.
    // the keys are the ones master wrote for its cover tint, so a choice made
    // there carries over
    aura_on: boolean
    aura: number
    // how round each part of the window is (settings > appearance)
    radii: Record<Region, Radius>
    swatch: Swatch
    // liquid glass (index.css, [data-glass]; components/ui/Glass)
    glass: boolean
    scale: Scale
    density: Density
    // where the nebula is drawn behind the pages (fx/Nebula)
    nebula: Backdrop
    lyrics_size: LyricsSize
    // what the wheel does (lib/smooth), and how a glide settles
    scrolling: Scrolling
    feel: Feel
    // backdrop blur on what floats over the page: the bar, the dock, menus, dialogs
    blur: boolean
    // the cover's light drifting slowly rather than standing still
    light_motion: boolean
    // how fast transitions run, or none at all
    pace: Pace
    search_mode: SearchMode
    // last.fm's suggestions: at all, and where
    suggest_on: boolean
    places: Place[]
    // the full-screen lyrics page: its words and its wave, each on its own
    lp_lyrics: boolean
    lp_wave: boolean
    // the wave behind what is playing on the home page
    home_wave: boolean
    // the page's bar stays over the page, torn off the top as it scrolls,
    // rather than scrolling away with it
    bar_float: boolean
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
    // the track being given a title of its own
    retitling: string | null
    profile_edit: boolean
    crop: { src: string; for: CropFor } | null
    crop_busy: boolean
    info_open: boolean
    info_face: 'about' | 'lyrics'
    // the whole window given over to the words of what is playing
    lyrics_open: boolean
    // on a phone that page is the whole player, and shows one face at a time
    sheet_face: SheetFace

    query: string
    search_open: boolean
    source: Source
    // what each source has answered for the last search, and which are still out
    found: Record<Source, SearchResult[]>
    busy: Source[]
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

    theme: stored_theme(),
    cover_accent: stored_flag('cover_accent', true),
    aura_on: stored_flag('aura_on', true),
    aura: stored_number('aura', 50, LIGHT_RANGE),
    radii: stored_radii(),
    swatch: stored_pref('swatch', ['theme', ...SWATCHES.map((o) => o.id)] as Swatch[], 'theme'),
    // a phone's tabs and dock are glass from the start; a desktop's panels wait to be asked
    glass: stored_flag('glass', window.matchMedia(PHONE).matches),
    scale: stored_pref('scale', SCALES.map((o) => o.id), 'medium'),
    density: stored_pref('density', DENSITIES.map((o) => o.id), 'comfortable'),
    nebula: stored_backdrop(),
    lyrics_size: stored_pref('lyrics_size', LYRICS_SIZES.map((o) => o.id), 'medium'),
    scrolling: stored_scrolling(),
    feel: stored_pref('feel', FEELS.map((o) => o.id), 'gentle'),
    blur: stored_flag('blur', true),
    light_motion: stored_flag('light_motion', true),
    pace: stored_pref('pace', PACES.map((o) => o.id), 'normal'),
    search_mode: stored_pref('search_mode', SEARCH_MODES.map((o) => o.id), 'parallel'),
    suggest_on: stored_flag('suggest_on', true),
    places: stored_list('places', PLACES.map((o) => o.id), DEFAULT_PLACES),
    lp_lyrics: stored_flag('lp_lyrics', true),
    lp_wave: stored_flag('lp_wave', true),
    home_wave: stored_flag('home_wave', true),
    bar_float: stored_flag('bar_float', false),
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
    retitling: null,
    profile_edit: false,
    crop: null,
    crop_busy: false,
    info_open: false,
    info_face: 'about',
    lyrics_open: false,
    sheet_face: 'player',

    query: '',
    search_open: false,
    source: 'yt',
    found: { yt: [], sc: [] },
    busy: [],
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

// the words of what is playing over the whole window. on a desktop that page
// is the lyrics; on a phone it is the player, opened at the face asked for
export function open_lyrics(face: SheetFace = 'lyrics') {
    ui.set({ lyrics_open: true, sheet_face: face })
}

export function open_page(page: Page) {
    ui.set({ page, menu: null })
}

// a preference is set and written in the same step, so no caller can do one
// without the other
export function set_pref<K extends keyof UiState>(key: K, value: UiState[K], stored: string = key) {
    ui.set({ [key]: value } as Partial<UiState>)
    save_pref(stored, value as PrefValue)
}

// one part's corners, or every part's at once (a pill only where a pill fits)
export function set_radius(region: Region, radius: Radius) {
    set_pref('radii', { ...ui.get().radii, [region]: radius })
}

export function set_all_radii(radius: Corners) {
    set_pref('radii', Object.fromEntries(Object.keys(ui.get().radii).map((region) => [region, radius])) as Record<Region, Radius>)
}

// the one choice every part shares, if they share one
export const common_radius = (radii: Record<Region, Radius>) => {
    const values = new Set(Object.values(radii))
    return values.size === 1 ? [...values][0] : null
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

// the native webkit menu is off; this one replaces it. it opens where it was
// asked for, and the menu itself measures what it drew and keeps inside the window
export function open_menu(target: MenuTarget, x: number, y: number) {
    ui.set({ menu: { ...target, x, y } })
}

export const context = (target: MenuTarget) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    open_menu(target, e.clientX, e.clientY)
}

/*
 * Everything the ui remembers between runs that is a preference rather than
 * data. It is one json blob under one key - webkit keeps localStorage under
 * ~/.local/share/yugen, so it survives a restart - and the keys inside it are
 * the ones the old ui wrote, so nobody's settings go missing over the redesign.
 */
const LAYOUT_KEY = 'yugen.layout'

/*
 * Five palettes, each a full set of tokens (index.css, [data-theme]). System
 * is not a palette of its own: it is Lamplight while the desktop is dark and
 * Paper while it is light.
 */
export const THEMES = ['system', 'lamplight', 'ink', 'paper', 'gruvbox', 'midnight'] as const
export type Theme = (typeof THEMES)[number]
export type Palette = Exclude<Theme, 'system'>

export const PALETTES: { id: Palette; label: string; dark: boolean; note: string; swatch: [string, string, string] }[] = [
    { id: 'lamplight', label: 'Lamplight', dark: true, note: 'Warm graphite, a lamp in a dark room', swatch: ['#100f0e', '#1e1d1b', '#e5654a'] },
    { id: 'ink', label: 'Ink', dark: true, note: 'Black and grey, nothing else', swatch: ['#0b0b0b', '#1c1c1c', '#e9e9e9'] },
    { id: 'paper', label: 'Paper', dark: false, note: 'Grey on white, like a printed sleeve', swatch: ['#f6f6f5', '#ffffff', '#151515'] },
    { id: 'gruvbox', label: 'Gruvbox', dark: true, note: 'The warm retro terminal palette', swatch: ['#1d2021', '#32302f', '#fe8019'] },
    { id: 'midnight', label: 'Midnight', dark: true, note: 'Deep blue, for the small hours', swatch: ['#0a0e1a', '#161c2e', '#7aa2f7'] },
]

// the palette a theme setting stands for right now
export const palette_of = (theme: Theme, system_dark: boolean): Palette => (theme === 'system' ? (system_dark ? 'lamplight' : 'paper') : theme)

// the old three choices, read as palettes
const THEME_RENAMES: Record<string, Theme> = { light: 'paper', dark: 'lamplight' }

export const stored_theme = (): Theme => {
    const raw = saved().theme
    const value = typeof raw === 'string' ? (THEME_RENAMES[raw] ?? raw) : raw
    return THEMES.includes(value as Theme) ? (value as Theme) : 'system'
}

export const VIEWS = ['library', 'songs', 'liked', 'albums', 'artists', 'playlist'] as const
export type View = (typeof VIEWS)[number]

/*
 * Shuffle is three states rather than a switch: off, the listing you are
 * standing in, or the whole library. Which one is on says what the order was
 * drawn from - and once it is drawn it stands, so walking into another playlist
 * does not quietly deal a new one behind whatever is playing.
 */
export type Shuffle = 'off' | 'listing' | 'all'

export const SHUFFLES: { id: Shuffle; label: string; hint: string }[] = [
    { id: 'off', label: 'No shuffle', hint: 'Play in order' },
    { id: 'listing', label: 'Shuffle this listing', hint: 'Only what is on screen' },
    { id: 'all', label: 'Shuffle everything', hint: 'The whole library' },
]

export type Sort = 'title' | 'added' | 'artist' | 'album'

export const SORTS: { id: Sort; label: string }[] = [
    { id: 'title', label: 'Title' },
    { id: 'added', label: 'Recently added' },
    { id: 'artist', label: 'Artist' },
    { id: 'album', label: 'Album' },
]

export type Layout = 'list' | 'compact' | 'grid'

export const LAYOUTS: { id: Layout; label: string }[] = [
    { id: 'list', label: 'List' },
    { id: 'compact', label: 'Compact' },
    { id: 'grid', label: 'Grid' },
]

// which listing a layout belongs to, and the key it has always been saved under
export type LayoutKey = 'library' | 'liked' | 'playlist' | 'group'

export const LAYOUT_PREFS: Record<LayoutKey, string> = {
    library: 'library_layout',
    liked: 'liked_layout',
    playlist: 'track_layout',
    group: 'group_layout',
}

// what keeps the playlists company in the sidebar
export type Shelf = 'playlists' | 'albums' | 'artists'

export const SHELVES: { id: Shelf; label: string }[] = [
    { id: 'playlists', label: 'Playlists' },
    { id: 'albums', label: 'Albums' },
    { id: 'artists', label: 'Artists' },
]

export type LibraryView = 'compact' | 'list' | 'compact-grid' | 'grid'

export const LIBRARY_VIEWS: { id: LibraryView; label: string }[] = [
    { id: 'compact', label: 'Compact' },
    { id: 'list', label: 'List' },
    { id: 'compact-grid', label: 'Compact grid' },
    { id: 'grid', label: 'Grid' },
]

// the suggestion shelf is the same records read four ways: the last one is a
// grouping rather than a shape
export type SuggestionView = 'grid' | 'compact' | 'list' | 'artist'

export const SUGGESTION_VIEWS: { id: SuggestionView; label: string }[] = [
    { id: 'grid', label: 'Grid' },
    { id: 'compact', label: 'Compact' },
    { id: 'list', label: 'List' },
    { id: 'artist', label: 'By artist' },
]

/*
 * How the window looks and moves, for whoever is sitting at it. Each of these
 * is a setting in Settings > Appearance, applied the moment it changes.
 */

// the accent when there is no cover to take one from, or the cover is not
// asked to: the dark-theme shade, then the light one. shu first, the seal red
export type Swatch = 'theme' | 'shu' | 'ochre' | 'moss' | 'indigo' | 'plum'

// 'theme' is each palette's own accent (index.css); the rest replace it
export const SWATCHES: { id: Exclude<Swatch, 'theme'>; label: string; dark: string; light: string }[] = [
    { id: 'shu', label: 'Shu', dark: '#e5654a', light: '#b8432c' },
    { id: 'ochre', label: 'Ochre', dark: '#d9a54a', light: '#8a6216' },
    { id: 'moss', label: 'Moss', dark: '#93b26a', light: '#4f6b2c' },
    { id: 'indigo', label: 'Indigo', dark: '#8ea2e8', light: '#3f51a8' },
    { id: 'plum', label: 'Plum', dark: '#c98bb9', light: '#87406f' },
]

export type Scale = 'small' | 'medium' | 'large' | 'xlarge'

export const SCALES: { id: Scale; label: string; factor: number }[] = [
    { id: 'small', label: 'Small', factor: 0.92 },
    { id: 'medium', label: 'Medium', factor: 1 },
    { id: 'large', label: 'Large', factor: 1.12 },
    { id: 'xlarge', label: 'XLarge', factor: 1.25 },
]

export const scale_factor = (scale: Scale) => SCALES.find((o) => o.id === scale)?.factor ?? 1

/*
 * Size, part by part, the way corners are (settings > appearance): one choice
 * for everything, or each part its own. Text is the whole window's measure -
 * every rem in it - and the other parts are drawn at their own size whatever
 * text is set to: App zooms each by its choice over the text's (--z-<part>).
 */
export type SizePart = 'text' | 'menus' | 'lists' | 'cards' | 'controls'

export const SIZE_PARTS: { id: SizePart; label: string; hint: string }[] = [
    { id: 'text', label: 'Text and pages', hint: 'Everything not named below' },
    { id: 'menus', label: 'Menus and popups', hint: 'Menus, sheets, the search results, dialogs' },
    { id: 'lists', label: 'Lists', hint: 'The rows of a listing, the library and the queue' },
    { id: 'cards', label: 'Cards', hint: 'Covers in grids and on the shelves' },
    { id: 'controls', label: 'Buttons', hint: 'Every button, the player and the tabs' },
]

// one choice for everything was all there was before parts: that is what an old setting reads as
export function stored_sizes(): Record<SizePart, Scale> {
    const raw = saved().sizes as Partial<Record<SizePart, Scale>> | undefined
    const ids = SCALES.map((o) => o.id)
    const old = ids.includes(saved().scale as Scale) ? (saved().scale as Scale) : 'medium'

    return Object.fromEntries(SIZE_PARTS.map(({ id }) => [id, raw?.[id] && ids.includes(raw[id]) ? raw[id] : old])) as Record<SizePart, Scale>
}

// how a track is drawn as a card: a sleeve over a label, one object, or the
// first way - the bare sleeve and two lines under it
export type CardStyle = 'sleeve' | 'classic'

export const CARD_STYLES: { id: CardStyle; label: string }[] = [
    { id: 'sleeve', label: 'Sleeve' },
    { id: 'classic', label: 'Classic' },
]

// where a sleeve card's label takes its colour
export type CardTone = 'cover' | 'theme'

export const CARD_TONES: { id: CardTone; label: string }[] = [
    { id: 'cover', label: 'From the cover' },
    { id: 'theme', label: 'From the theme' },
]

export type Density = 'comfortable' | 'compact'

export const DENSITIES: { id: Density; label: string }[] = [
    { id: 'comfortable', label: 'Comfortable' },
    { id: 'compact', label: 'Compact' },
]

// where the nebula is drawn behind the pages
export type Backdrop = 'off' | 'home' | 'everywhere'

export const BACKDROPS: { id: Backdrop; label: string }[] = [
    { id: 'off', label: 'Off' },
    { id: 'home', label: 'Home' },
    { id: 'everywhere', label: 'Everywhere' },
]

// the nebula took the character field's place, and its choice of where with
// it: whoever had the field off has the nebula off
export function stored_backdrop(): Backdrop {
    const value = saved().nebula ?? saved().field
    return BACKDROPS.some((o) => o.id === value) ? (value as Backdrop) : 'home'
}

export type LyricsSize = 'small' | 'medium' | 'large'

export const LYRICS_SIZES: { id: LyricsSize; label: string }[] = [
    { id: 'small', label: 'Small' },
    { id: 'medium', label: 'Medium' },
    { id: 'large', label: 'Large' },
]

// how round the corners are, as a share of the full radius
export type Corners = 'square' | 'subtle' | 'round'

export const CORNERS: { id: Corners; label: string; factor: number }[] = [
    { id: 'square', label: 'Square', factor: 0.25 },
    { id: 'subtle', label: 'Subtle', factor: 0.6 },
    { id: 'round', label: 'Round', factor: 1 },
]

/*
 * Corners, part by part (settings > appearance): each part of the window takes
 * one of the corner choices, or a pill where a pill makes sense. Each part has
 * its own sizes, since "round" on a panel and "round" on a small button are
 * not the same number of pixels. App sets them as --r-<part> on the root; the
 * panels' choice also sets --corner, which the small things inside a panel -
 * rows, cards' insides - are scaled by.
 */
export type Radius = Corners | 'pill'
export type Region = 'panels' | 'buttons' | 'controls' | 'search' | 'menus' | 'covers'

export const RADII: { id: Radius; label: string }[] = [...CORNERS.map(({ id, label }) => ({ id, label })), { id: 'pill', label: 'Pill' }]

export const REGIONS: { id: Region; label: string; hint: string; css: string; rem: Record<Corners, number>; pill: boolean }[] = [
    { id: 'panels', label: 'Panels', hint: 'The sidebar, the page, the side column, the player', css: '--r-panel', rem: { square: 0.375, subtle: 0.875, round: 1.5 }, pill: false },
    { id: 'buttons', label: 'Buttons', hint: 'Play, shuffle, lyrics and every icon button', css: '--r-button', rem: { square: 0.25, subtle: 0.625, round: 1 }, pill: true },
    { id: 'controls', label: 'Controls', hint: 'Tabs, filters, the rows of the sidebar', css: '--r-control', rem: { square: 0.25, subtle: 0.5, round: 0.75 }, pill: true },
    { id: 'search', label: 'Search bar', hint: 'The field at the top of the page', css: '--r-search', rem: { square: 0.375, subtle: 0.75, round: 1.125 }, pill: true },
    { id: 'menus', label: 'Menus and dialogs', hint: 'Right-click menus, search results, popups', css: '--r-menu', rem: { square: 0.375, subtle: 0.75, round: 1.125 }, pill: false },
    { id: 'covers', label: 'Covers', hint: 'Album art everywhere', css: '--r-cover', rem: { square: 0.125, subtle: 0.375, round: 0.75 }, pill: false },
]

export const radius_css = (region: (typeof REGIONS)[number], radius: Radius) =>
    radius === 'pill' ? '9999px' : `${region.rem[radius]}rem`

// a fresh start: round everywhere, and the buttons pills
const DEFAULT_RADII: Record<Region, Radius> = { panels: 'round', buttons: 'pill', controls: 'round', search: 'round', menus: 'round', covers: 'round' }

// before parts could differ there was one choice for everything, and buttons,
// controls and the search bar were always pills: that is what an old setting reads as
export function stored_radii(): Record<Region, Radius> {
    const raw = saved().radii as Partial<Record<Region, Radius>> | undefined
    const old = CORNERS.some((o) => o.id === saved().corners) ? (saved().corners as Corners) : null
    const ids = RADII.map((o) => o.id)

    return Object.fromEntries(
        REGIONS.map((region) => {
            const value = raw?.[region.id]
            const fallback: Radius = old ? (region.pill ? 'pill' : old) : DEFAULT_RADII[region.id]
            return [region.id, value && ids.includes(value) && (region.pill || value !== 'pill') ? value : fallback]
        }),
    ) as Record<Region, Radius>
}

// how much of the cover's light reaches the room behind the panels
export const LIGHT_RANGE = [0, 100] as const

// liquid glass: the panels turn to frosted glass over the cover of what is
// playing, and what floats over the page bends the light at its edges
export type Glass = 'off' | 'on'

// how the wheel settles: gentle trails a little, quick stops sooner
export type Feel = 'gentle' | 'quick'

export const FEELS: { id: Feel; label: string }[] = [
    { id: 'gentle', label: 'Gentle' },
    { id: 'quick', label: 'Quick' },
]

// what the wheel does (lib/smooth): a spring, a browser's short ease, or the raw engine
export type Scrolling = 'glide' | 'standard' | 'instant'

export const SCROLLINGS: { id: Scrolling; label: string; hint: string }[] = [
    { id: 'glide', label: 'Glide', hint: 'The wheel glides on a spring and settles' },
    { id: 'standard', label: 'Standard', hint: 'A short ease per notch, the way a browser scrolls' },
    // the id is older than the name: with chromium's own scroll animation on
    // (main.cpp), what the engine does unaided is no longer a jump
    { id: 'instant', label: 'Native', hint: 'The engine scrolls on its own, with chromium\'s short ease' },
]

/*
 * How fast the interface moves: every transition and spring is scaled by it
 * (App, useAppearance; lib/motion). Off is no transitions at all - what moves
 * on its own, the light and the wave, is Motion's business.
 */
export type Pace = 'off' | 'slow' | 'normal' | 'fast'

export const PACES: { id: Pace; label: string; factor: number }[] = [
    { id: 'off', label: 'Off', factor: 0 },
    { id: 'slow', label: 'Slow', factor: 1.6 },
    { id: 'normal', label: 'Normal', factor: 1 },
    { id: 'fast', label: 'Fast', factor: 0.55 },
]

// a search asks both sources at once and shows each as it answers, or one tab at a time
export type SearchMode = 'parallel' | 'tabs'

export const SEARCH_MODES: { id: SearchMode; label: string }[] = [
    { id: 'parallel', label: 'Both at once' },
    { id: 'tabs', label: 'One at a time' },
]

// where last.fm's suggestions are offered
export type Place = 'home' | 'playlists' | 'liked' | 'songs' | 'groups' | 'queue'

export const PLACES: { id: Place; label: string; hint: string }[] = [
    { id: 'home', label: 'Home', hint: 'A shelf of tracks you do not have yet' },
    { id: 'playlists', label: 'Playlists', hint: 'More like this, under each playlist' },
    { id: 'liked', label: 'Liked songs', hint: 'More like what you liked' },
    { id: 'songs', label: 'All songs', hint: 'Under the full song list' },
    { id: 'groups', label: 'Albums and artists', hint: 'Under an album or an artist' },
    { id: 'queue', label: 'Queue', hint: 'A few suggestions under up next' },
]

export const DEFAULT_PLACES: Place[] = PLACES.map((o) => o.id)

function saved(): Record<string, unknown> {
    try {
        const value = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? '{}')
        return value && typeof value === 'object' ? value : {}
    } catch {
        return {}
    }
}

export function stored_pref<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
    const value = saved()[key]
    return allowed.includes(value as T) ? (value as T) : fallback
}

export function stored_flag(key: string, fallback: boolean) {
    const value = saved()[key]
    return typeof value === 'boolean' ? value : fallback
}

export function stored_number(key: string, fallback: number, [min, max]: readonly [number, number]) {
    const value = saved()[key]
    return typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(value, min), max) : fallback
}

// the old switch, read as the new choice: smooth off now means a browser's ease
export function stored_scrolling(): Scrolling {
    const value = saved().scrolling
    if (SCROLLINGS.some((o) => o.id === value)) return value as Scrolling

    return saved().smooth === false ? 'standard' : 'glide'
}

export function stored_list<T extends string>(key: string, allowed?: readonly T[], fallback: T[] = []): T[] {
    const value = saved()[key]
    if (!Array.isArray(value)) return fallback

    return value.filter(
        (item): item is T => typeof item === 'string' && (!allowed || allowed.includes(item as T)),
    )
}

export type PrefValue = string | string[] | boolean | number | Record<string, string>

export function save_pref(key: string, value: PrefValue) {
    try {
        localStorage.setItem(LAYOUT_KEY, JSON.stringify({ ...saved(), [key]: value }))
    } catch {
        // storage unavailable, the choice just will not stick
    }
}

/*
 * What was playing when the app last went away. It is written while the track
 * runs rather than on the way out: webkitgtk does not reliably give the page a
 * turn when the window closes, so the last tick that made it to disk is what a
 * restart picks up.
 */
const PLAYBACK_KEY = 'yugen.playback'

export type Playback = {
    song: string
    position: number
    // the listing the queue was built from, so prev/next carry on where they left off
    view: View
    selection: string | null
    shuffle: Shuffle
}

export function stored_playback(): Playback | null {
    try {
        const value = JSON.parse(localStorage.getItem(PLAYBACK_KEY) ?? 'null')

        if (!value || typeof value.song !== 'string') return null

        return {
            song: value.song,
            position:
                typeof value.position === 'number' && Number.isFinite(value.position)
                    ? Math.max(value.position, 0)
                    : 0,
            view: VIEWS.includes(value.view) ? value.view : 'library',
            selection: typeof value.selection === 'string' ? value.selection : null,
            // it was a switch before it was three states, and 'on' meant the
            // listing you were standing in
            shuffle:
                value.shuffle === true
                    ? 'listing'
                    : SHUFFLES.some((option) => option.id === value.shuffle)
                      ? value.shuffle
                      : 'off',
        }
    } catch {
        return null
    }
}

export function save_playback(state: Playback) {
    try {
        localStorage.setItem(PLAYBACK_KEY, JSON.stringify(state))
    } catch {
        // storage unavailable, the next launch just comes up empty
    }
}

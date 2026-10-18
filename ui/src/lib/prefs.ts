/*
 * Everything the ui remembers between runs that is a preference rather than
 * data. It is one json blob under one key - webkit keeps localStorage under
 * ~/.local/share/yugen, so it survives a restart - and the keys inside it are
 * the ones the old ui wrote, so nobody's settings go missing over the redesign.
 */
const LAYOUT_KEY = 'yugen.layout'

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

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

export const AURA_RANGE = [0, 100] as const

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

export function stored_list<T extends string>(key: string, allowed?: readonly T[]): T[] {
    const value = saved()[key]
    if (!Array.isArray(value)) return []

    return value.filter(
        (item): item is T => typeof item === 'string' && (!allowed || allowed.includes(item as T)),
    )
}

export function save_pref(key: string, value: string | string[] | boolean | number) {
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

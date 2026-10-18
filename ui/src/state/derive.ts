import type { FavoriteTrack } from '../lib/bridge'
import { album_tag, artist_tag, collate } from '../lib/names'
import type { LayoutKey, Sort, View } from '../lib/prefs'
import { memo_last, useStore } from '../lib/store'
import { added_of, album_of, artist_of, length_of, library, title_of } from './library'
import { player } from './player'
import { ui } from './ui'

/*
 * Everything that is worked out of the stores rather than kept in them. Each
 * one is memoised on exactly what it is made of, so the many places that read
 * the same list in one render - and the actions that read it outside of one -
 * all get the same array, built once.
 */

// group the library by a tag, keeping the scan order
const group = (songs: string[], meta: Record<string, string[]>, tag: (meta?: string[]) => string) => {
    const groups = new Map<string, string[]>()

    for (const name of songs) {
        const value = tag(meta[name]).trim() || 'Unknown'
        const bucket = groups.get(value)

        if (bucket) bucket.push(name)
        else groups.set(value, [name])
    }

    return groups
}

export const albums_of = memo_last((songs: string[], meta: Record<string, string[]>) => group(songs, meta, album_tag))
export const artists_of = memo_last((songs: string[], meta: Record<string, string[]>) => group(songs, meta, artist_tag))

export const liked_of = memo_last((songs: string[], liked: Set<string>) => songs.filter((name) => liked.has(name)))

// a favourite whose file has left the folder cannot be played, so it is on
// neither the shelf, the profile page, nor the run those two play from
export const favorite_songs_of = memo_last((songs: string[], favorites: FavoriteTrack[]) => {
    const on_disk = new Set(songs)
    return favorites.map((track) => track.file_path).filter((name) => on_disk.has(name))
})

// newest first for dates, alphabetical for the rest
const by_sort = (sort: Sort) => (a: string, b: string) =>
    sort === 'added'
        ? added_of(b) - added_of(a)
        : sort === 'artist'
          ? collate(artist_of(a), artist_of(b))
          : sort === 'album'
            ? collate(album_of(a), album_of(b))
            : collate(title_of(a), title_of(b))

/*
 * The listing on screen, which is also the queue prev/next walk through when
 * nothing else has been asked for. Every listing answers to the sort, so the
 * order it is shown in is the order it plays in.
 */
const listed_memo = memo_last(
    (
        view: View,
        selection: string | null,
        sort: Sort,
        songs: string[],
        meta: Record<string, string[]>,
        liked: Set<string>,
        playlists: Record<string, string[]>,
    ): string[] => {
        const order = by_sort(sort)

        if (view === 'playlist') {
            if (!selection) return []

            // a playlist only lists what is still on disk
            const on_disk = new Set(songs)
            return (playlists[selection] ?? []).filter((name) => on_disk.has(name)).sort(order)
        }

        if (selection && (view === 'albums' || view === 'artists')) {
            const groups = view === 'albums' ? albums_of(songs, meta) : artists_of(songs, meta)
            return [...(groups.get(selection) ?? [])].sort(order)
        }

        if (view === 'liked') return [...liked_of(songs, liked)].sort(order)

        return [...songs].sort(order)
    },
)

export function listed_now() {
    const { view, selection, sort } = ui.get()
    const { songs, meta, liked, playlists } = library.get()

    return listed_memo(view, selection, sort, songs, meta, liked, playlists)
}

export function useListed() {
    const view = useStore(ui, (s) => s.view)
    const selection = useStore(ui, (s) => s.selection)
    const sort = useStore(ui, (s) => s.sort)
    const songs = useStore(library, (s) => s.songs)
    const meta = useStore(library, (s) => s.meta)
    const liked = useStore(library, (s) => s.liked)
    const playlists = useStore(library, (s) => s.playlists)

    return listed_memo(view, selection, sort, songs, meta, liked, playlists)
}

export const useAlbums = () => albums_of(useStore(library, (s) => s.songs), useStore(library, (s) => s.meta))
export const useArtists = () => artists_of(useStore(library, (s) => s.songs), useStore(library, (s) => s.meta))
export const useLikedSongs = () => liked_of(useStore(library, (s) => s.songs), useStore(library, (s) => s.liked))
export const useFavoriteSongs = () =>
    favorite_songs_of(useStore(library, (s) => s.songs), useStore(library, (s) => s.favorites))

/*
 * Sorted by album, a listing is the albums themselves - the same cards the
 * Albums page deals - rather than one long run of tracks with the album
 * repeated down a column. An album's own page is the one listing this cannot
 * mean anything on: it is already that album.
 */
export const album_runs_of = memo_last((listed: string[], sort: Sort, view: View, selection: string | null, meta: Record<string, string[]>) => {
    // the tags are read through the store; they are here to say when to work it out again
    void meta

    if (sort !== 'album' || (view === 'albums' && selection)) return null

    const runs = new Map<string, string[]>()

    for (const name of listed) {
        const key = album_of(name) || 'Unknown album'
        const held = runs.get(key)

        if (held) held.push(name)
        else runs.set(key, [name])
    }

    return runs.size ? runs : null
})

// the newest of what is here. files with no date cannot answer, so the shelf
// goes away with them
export const arrivals_of = memo_last((songs: string[], meta: Record<string, string[]>) => {
    // the dates are read through the store; the tags are here to say when to work it out again
    void meta

    return songs
        .filter((name) => added_of(name))
        .sort((a, b) => added_of(b) - added_of(a))
        .slice(0, 12)
})

export const span_of = (names: string[]) => names.reduce((total, name) => total + length_of(name), 0)

// pinned first in the order they were pinned, the rest alphabetical
export const playlist_names_of = memo_last((playlists: Record<string, string[]>, pins: string[]) =>
    Object.keys(playlists).sort((a, b) => {
        const rank = (name: string) => (pins.includes(name) ? pins.indexOf(name) : pins.length)
        return rank(a) !== rank(b) ? rank(a) - rank(b) : collate(a, b)
    }),
)

// a playlist shows the sleeve it was given; one that was never given one borrows
// the cover of the first track inside it that has one
export function playlist_art(name: string) {
    const { playlist_covers, playlists, covers } = library.get()
    const borrowed = (playlists[name] ?? []).find((track) => covers[track])

    return playlist_covers[name] || (borrowed ? covers[borrowed] : '')
}

export const group_art = (tracks: string[]) => {
    const { covers } = library.get()
    const found = tracks.find((track) => covers[track])

    return found ? covers[found] : ''
}

// each kind of listing remembers its own layout, because they are read differently
export function layout_key(view: View, selection: string | null): LayoutKey {
    if (view === 'playlist') return 'playlist'
    if (view === 'liked') return 'liked'
    if (selection) return 'group'
    return 'library'
}

/*
 * What prev/next walk. A queue built by hand wins; otherwise a shuffle that
 * has been dealt, otherwise the section a track was started from, otherwise
 * the listing on screen.
 */
export function queue_now() {
    const { manual_queue, shuffle_mode, shuffled, scope } = player.get()

    if (manual_queue?.length) return manual_queue
    if (shuffle_mode !== 'off' && shuffled?.length) return shuffled

    return scope ?? listed_now()
}

export function useQueue() {
    const listed = useListed()
    const manual_queue = useStore(player, (s) => s.manual_queue)
    const shuffle_mode = useStore(player, (s) => s.shuffle_mode)
    const shuffled = useStore(player, (s) => s.shuffled)
    const scope = useStore(player, (s) => s.scope)

    if (manual_queue?.length) return manual_queue
    if (shuffle_mode !== 'off' && shuffled?.length) return shuffled

    return scope ?? listed
}

import { bridge, music_dir, type FavoriteTrack } from '../lib/bridge'
import { album_tag, artist_tag } from '../lib/names'
import { create_store } from '../lib/store'
import { warm_thumbs } from '../lib/thumbs'

/*
 * What is on disk, and everything the listener has said about it. The backend
 * files are the source of truth for all of it - liked_songs.json,
 * playlists.json, profile.json - so every write is read back afterwards
 * rather than trusted.
 */
export type LibraryState = {
    songs: string[]
    // file name -> [title, artist, album, seconds, added]
    meta: Record<string, string[]>
    // file name -> base64 of the picture in its tags
    covers: Record<string, string>
    liked: Set<string>
    favorites: FavoriteTrack[]
    // name -> its tracks, and the sleeve it was given if it was given one
    playlists: Record<string, string[]>
    playlist_covers: Record<string, string>
    // the sleeves of the two listings that are not playlists, by VIEW_COVER key
    view_covers: Partial<Record<ViewCover, string>>
    loading: boolean
    scan_error: string | null
    folder: string
    username: string
    profile_pic: string
    biography: string
}

export const library = create_store<LibraryState>({
    songs: [],
    meta: {},
    covers: {},
    liked: new Set(),
    favorites: [],
    playlists: {},
    playlist_covers: {},
    view_covers: {},
    loading: false,
    scan_error: null,
    folder: '',
    username: '',
    profile_pic: '',
    biography: '',
})

// the tags, read off the store rather than handed around
const meta_of = (name: string) => library.get().meta[name]

export const title_of = (name: string) => meta_of(name)?.[0] || name.replace(/\.mp3$/i, '')
export const artist_of = (name: string) => artist_tag(meta_of(name))
export const album_of = (name: string) => album_tag(meta_of(name))
export const length_of = (name: string) => Number(meta_of(name)?.[3]) || 0
export const added_of = (name: string) => Number(meta_of(name)?.[4]) || 0
export const cover_of = (name: string) => library.get().covers[name]

// a handful in the air at a time: each is a thread on the far side
const SCAN_BATCH = 8

// a scan only ever lands once: a second one started while the first is still
// fetching covers takes over, and the first stops writing
let scan_run = 0

/*
 * The library in two passes. The tags first - small, and all a listing needs to
 * be drawn - and the list is on screen the moment they are in. The covers come
 * after, a batch at a time, each batch landing as it arrives, so the window is
 * usable long before the last picture has been read off the last file.
 */
export async function fetch_songs() {
    const run = ++scan_run
    library.set({ loading: true })

    // anything in here can throw - an old backend, a music folder that is not
    // there - and without the catch the spinner never stops, which says nothing
    try {
        const dir = await music_dir()
        const names: string[] = await bridge().fetch_songs(dir)

        const { meta: known } = library.get()
        const meta: Record<string, string[]> = {}

        for (let i = 0; i < names.length; i += SCAN_BATCH) {
            await Promise.all(
                names.slice(i, i + SCAN_BATCH).map(async (name) => {
                    const tags = await bridge().get_metadata(dir + name)
                    // unchanged tags keep the same array, so nothing drawn from them redraws
                    meta[name] = known[name] && same_tags(known[name], tags) ? known[name] : tags
                }),
            )
        }

        if (run !== scan_run) return { names, meta }

        library.set({ songs: names, meta, scan_error: null, folder: dir })
        void fetch_covers(names, dir, run)

        return { names, meta }
    } catch (e) {
        library.set({ scan_error: e instanceof Error ? e.message : String(e), songs: [] })

        return { names: [] as string[], meta: {} as Record<string, string[]> }
    } finally {
        if (run === scan_run) library.set({ loading: false })
    }
}

async function fetch_covers(names: string[], dir: string, run: number) {
    // a file that left the folder takes its cover with it
    const on_disk = new Set(names)
    library.set(({ covers }) => ({ covers: Object.fromEntries(Object.entries(covers).filter(([name]) => on_disk.has(name))) }))

    for (let i = 0; i < names.length; i += SCAN_BATCH) {
        const batch = names.slice(i, i + SCAN_BATCH)
        const art = await Promise.all(batch.map((name) => bridge().get_cover(dir + name).catch(() => '')))

        if (run !== scan_run) return

        library.set(({ covers }) => {
            const next = { ...covers }

            // the same picture keeps the same string, so its shrunk copy and
            // every cover drawn from it carry over a rescan
            batch.forEach((name, k) => {
                if (next[name] !== art[k]) next[name] = art[k]
            })

            return { covers: next }
        })

        warm_thumbs(art)
    }
}

const same_tags = (a: string[], b: string[]) => a.length === b.length && a.every((tag, i) => tag === b[i])

// liked_songs.json is the source of truth, so it is read back after every write
export async function sync_liked() {
    try {
        library.set({ liked: new Set(await bridge().get_liked_songs()) })
    } catch {
        // keep showing whatever is there rather than dropping the list
    }
}

export async function toggle_like(name: string) {
    const was = library.get().liked.has(name)

    // flipped right away so the click always answers, then reconciled
    library.set(({ liked }) => {
        const next = new Set(liked)

        if (was) next.delete(name)
        else next.add(name)

        return { liked: next }
    })

    try {
        if (was) await bridge().unlike_song(name)
        else await bridge().like_song(name)
    } finally {
        await sync_liked()
    }
}

export async function load_favorites() {
    try {
        library.set({ favorites: await bridge().get_favorite_songs() })
    } catch {
        library.set({ favorites: [] })
    }
}

export const is_favorite = (name: string) =>
    library.get().favorites.some((track) => track.file_path === name)

export async function toggle_favorite(name: string) {
    const was = is_favorite(name)
    const track = { title: title_of(name), artist: artist_of(name), album: album_of(name), file_path: name }

    library.set(({ favorites }) => ({
        favorites: was ? favorites.filter((t) => t.file_path !== name) : [...favorites, track],
    }))

    try {
        if (was) await bridge().remove_from_favorites(name)
        else await bridge().add_favorite_song(track)
    } finally {
        await load_favorites()
    }
}

// playlists.json is small, so the whole of it is pulled in one go - sleeves
// included. a backend without the cover calls still answers for the tracks, so
// each sleeve fails on its own rather than taking the list down with it.
export async function sync_playlists() {
    try {
        const names = await bridge().get_playlists()
        const [tracks, sleeves] = await Promise.all([
            Promise.all(names.map((name) => bridge().get_playlist(name))),
            Promise.all(names.map((name) => bridge().get_playlist_cover(name).catch(() => ''))),
        ])

        const map = Object.fromEntries(names.map((name, i) => [name, tracks[i]]))
        const { playlist_covers: had } = library.get()

        library.set({
            playlists: map,
            playlist_covers: Object.fromEntries(
                names
                    .map((name, i) => [name, had[name] === sleeves[i] ? had[name] : sleeves[i]])
                    .filter(([, art]) => art),
            ),
        })

        return map
    } catch {
        // the last known list stays rather than the sidebar blanking
        return null
    }
}

/*
 * Liked Songs and All songs are not playlists, but they take a sleeve the same
 * way: the backend keeps theirs under a reserved name, apart from
 * playlists.json, and answers for it through the playlist cover calls.
 */
export const VIEW_COVER = { liked: '__liked__', songs: '__songs__' } as const
export type ViewCover = keyof typeof VIEW_COVER

export async function sync_view_covers() {
    const views = Object.keys(VIEW_COVER) as ViewCover[]
    const art = await Promise.all(views.map((view) => bridge().get_playlist_cover(VIEW_COVER[view]).catch(() => '')))

    library.set({ view_covers: Object.fromEntries(views.map((view, i) => [view, art[i]]).filter(([, data]) => data)) })
}

// the backend counts the playlists, and a new one is named after the count. a
// name already on the list means the count has been reused, so walk past it.
export async function next_playlist_name() {
    const taken = new Set(Object.keys(library.get().playlists))
    let count = taken.size

    try {
        count = await bridge().get_playlist_count()
    } catch {
        // the count is not exposed: the sidebar knows the same number
    }

    let name = `Playlist ${count}`
    while (taken.has(name)) name = `Playlist ${++count}`

    return name
}

export async function add_to_playlist(playlist: string, name: string) {
    await bridge().add_to_playlist(playlist, name)
    await sync_playlists()
}

export async function remove_from_playlist(playlist: string, name: string) {
    await bridge().remove_from_playlist(playlist, name)
    await sync_playlists()
}

// profile.json backs all three. each field fails on its own: a backend that
// only exposes some of the profile bridge still shows what it has
export async function sync_profile() {
    const [username, profile_pic, biography] = await Promise.all([
        bridge().get_username().catch(() => ''),
        bridge().get_profile_picture().catch(() => ''),
        bridge().get_biography().catch(() => ''),
    ])

    library.set({ username, profile_pic, biography })
}

export async function save_profile(name: string, bio: string) {
    const { username, biography } = library.get()

    if (name && name !== username) {
        library.set({ username: name })
        // the field already shows it; a failed write only means it will not
        // survive a restart
        await bridge().set_username(name).catch(() => false)
    }

    if (bio !== biography) {
        library.set({ biography: bio })
        await bridge().set_biography(bio).catch(() => false)
    }
}

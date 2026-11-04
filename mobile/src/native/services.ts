import { load, update } from './store'

/*
 * MusicManager, Profile and Settings from services.cpp, over the same json
 * files: playlists.json (name -> { songs, cover }), liked_songs.json (a flat
 * array), profile.json, settings.json, view_covers.json.
 */

type Playlist = { songs?: string[]; cover?: string }
type Playlists = Record<string, Playlist>
type Track = { title: string; artist: string; album: string; file_path: string }
type Profile = { username?: string; biography?: string; profile_pic_path?: string; favorite_songs?: Track[] }

const PLAYLISTS = 'playlists.json'
const LIKED = 'liked_songs.json'
const PROFILE = 'profile.json'
const SETTINGS = 'settings.json'
const VIEW_COVERS = 'view_covers.json'

// All songs and Liked songs keep their sleeves under these, beside the playlists
const is_view_cover = (name: string) => name === '__liked__' || name === '__songs__'

// playlists

export const playlists = async () => Object.keys(await load<Playlists>(PLAYLISTS, {}))
export const playlist = async (name: string) => (await load<Playlists>(PLAYLISTS, {}))[name]?.songs ?? []
export const playlist_count = async () => (await playlists()).length + 1

export async function playlist_cover(name: string) {
    if (is_view_cover(name)) return (await load<Record<string, string>>(VIEW_COVERS, {}))[name] ?? ''
    return (await load<Playlists>(PLAYLISTS, {}))[name]?.cover ?? ''
}

export async function set_playlist_cover(name: string, base64: string) {
    if (!name || !base64) return false
    if (is_view_cover(name)) {
        await update<Record<string, string>>(VIEW_COVERS, {}, (covers) => void (covers[name] = base64))
        return true
    }

    let ok = false
    await update<Playlists>(PLAYLISTS, {}, (all) => {
        if (!all[name]) return
        all[name].cover = base64
        ok = true
    })
    return ok
}

export async function create_playlist(name: string) {
    await update<Playlists>(PLAYLISTS, {}, (all) => void (all[name] ??= {}))
    return true
}

export async function delete_playlist(name: string) {
    await update<Playlists>(PLAYLISTS, {}, (all) => void delete all[name])
    return true
}

export async function rename_playlist(name: string, renamed: string) {
    await update<Playlists>(PLAYLISTS, {}, (all) => {
        if (!all[name] || all[renamed]) return
        all[renamed] = all[name]
        delete all[name]
    })
    return true
}

export async function add_to_playlist(name: string, song: string) {
    let ok = false
    await update<Playlists>(PLAYLISTS, {}, (all) => {
        const list = all[name]
        if (!list || !song) return
        list.songs ??= []
        if (list.songs.includes(song)) return
        list.songs.push(song)
        ok = true
    })
    return ok
}

export async function remove_from_playlist(name: string, song: string) {
    let ok = false
    await update<Playlists>(PLAYLISTS, {}, (all) => {
        const list = all[name]?.songs
        if (!list) return
        const at = list.indexOf(song)
        if (at >= 0) list.splice(at, 1), (ok = true)
    })
    return ok
}

// liked songs

export const liked = () => load<string[]>(LIKED, [])

export async function like(name: string) {
    await update<string[]>(LIKED, [], (all) => (all.includes(name) ? all : [...all, name]))
}

export async function unlike(name: string) {
    await update<string[]>(LIKED, [], (all) => all.filter((n) => n !== name))
}

// profile

const profile = () => load<Profile>(PROFILE, {})

export const username = async () => (await profile()).username ?? ''
export const biography = async () => (await profile()).biography ?? ''
export const picture = async () => (await profile()).profile_pic_path ?? ''
export const favorites = async () => (await profile()).favorite_songs ?? []

async function set_profile(change: (p: Profile) => void) {
    await update<Profile>(PROFILE, {}, change)
    return true
}

export const set_username = (value: string) => set_profile((p) => void (p.username = value))
export const set_biography = (value: string) => set_profile((p) => void (p.biography = value))
export const set_picture = (value: string) => set_profile((p) => void (p.profile_pic_path = value))

export const add_favorite = (track: Track) =>
    set_profile((p) => {
        p.favorite_songs ??= []
        if (!p.favorite_songs.some((t) => t.file_path === track.file_path)) p.favorite_songs.push(track)
    })

export const remove_favorite = (file_path: string) =>
    set_profile((p) => {
        p.favorite_songs = (p.favorite_songs ?? []).filter((t) => t.file_path !== file_path)
    })

// settings.json: a flat string map, the keybinds among the rest

export async function set_setting(key: string, value: string) {
    if (!key) return false
    await update<Record<string, string>>(SETTINGS, {}, (all) => {
        if (value) all[key] = value
        else delete all[key]
    })
    return true
}

export async function remove_setting(key: string) {
    if (!key) return false
    await update<Record<string, string>>(SETTINGS, {}, (all) => void delete all[key])
    return true
}

export const setting = async (key: string) => (await load<Record<string, string>>(SETTINGS, {}))[key] ?? ''

export async function all_settings() {
    const all = await load<Record<string, string>>(SETTINGS, {})
    return Object.keys(all).length ? JSON.stringify(all) : ''
}

// lyrics: lrclib's search, a timed sheet anywhere in the answer before the
// closest name - Core::get_lyrics. answers are kept, empty ones too
export async function lyrics(title: string, artist: string) {
    const key = `${artist} - ${title}`
    const kept = await load<Record<string, string>>('lyrics.json', {})
    if (key in kept) return kept[key]

    try {
        const response = await fetch(`https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`)
        if (!response.ok) return ''

        const hits = (await response.json()) as { syncedLyrics?: string | null; plainLyrics?: string | null }[]
        const sheet = hits.find((hit) => hit.syncedLyrics)?.syncedLyrics ?? hits.find((hit) => hit.plainLyrics)?.plainLyrics ?? ''

        await update<Record<string, string>>('lyrics.json', {}, (all) => void (all[key] = sheet))
        return sheet
    } catch {
        // offline: say nothing, and ask again next time
        return ''
    }
}

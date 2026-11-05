import * as library from '../native/library'
import * as player from '../native/player'
import * as services from '../native/services'
import * as ytdlp from '../native/ytdlp'

/*
 * The app's side of window.saucer.exposed: every function main.cpp exposes on
 * the desktop, by the same name and with the same answer. What a phone cannot
 * do yet answers the way the desktop does when it cannot either - empty.
 */
type Handler = (...args: never[]) => unknown

const nothing = async () => {}

export const HANDLERS: Record<string, Handler> = {
    // the library
    get_music_dir: async () => library.ROOT,
    fetch_songs: () => library.scan(),
    get_metadata: (path: string) => library.metadata(path),
    get_cover: (path: string) => library.cover(path),
    update_track_cover: (path: string, base64: string) => library.set_cover(path, base64),
    set_track_title: (path: string, title: string) => library.set_title(path, title),
    get_track_titles: () => library.titles(),
    delete_song: (path: string) => library.remove(path),

    // playback
    play_music: (path: string, title: string, artist: string, album: string) => player.play(path, title, artist, album),
    // a phone's own: the page's order around what is playing, so the playlist
    // can go on without it (src/native/player)
    set_up_next: (previous: string, next: string[]) => player.set_up_next(previous, next),
    resume: () => player.resume(),
    stop: () => player.stop(),
    seek: (position: number) => player.seek(position),
    toggle_loop: (state: boolean) => player.set_loop(state),
    get_position: () => player.position(),
    get_length: () => player.length(),
    is_finished: () => player.is_finished(),
    set_volume: (volume: number) => player.set_volume(volume),
    load_volume: () => player.load_volume(),
    shuffle: async (songs: string[]) => player.shuffle(songs),
    // the interface keeps the queue; these are the desktop's leftovers
    next: async () => '',
    prev: async () => '',

    // what the desktop tells mpris, the phone tells its lock screen through
    // the player already; nothing more to do with these
    mpris_track: nothing,
    mpris_state: nothing,
    mpris_seeked: nothing,

    // playlists and the liked songs
    get_playlists: () => services.playlists(),
    get_playlist: (name: string) => services.playlist(name),
    get_playlist_count: () => services.playlist_count(),
    get_playlist_cover: (name: string) => services.playlist_cover(name),
    set_playlist_cover: (name: string, base64: string) => services.set_playlist_cover(name, base64),
    create_playlist: (name: string) => services.create_playlist(name),
    delete_playlist: (name: string) => services.delete_playlist(name),
    rename_playlist: (name: string, renamed: string) => services.rename_playlist(name, renamed),
    add_to_playlist: (name: string, song: string) => services.add_to_playlist(name, song),
    remove_from_playlist: (name: string, song: string) => services.remove_from_playlist(name, song),
    get_liked_songs: () => services.liked(),
    like_song: (name: string) => services.like(name),
    unlike_song: (name: string) => services.unlike(name),

    // the profile
    get_username: () => services.username(),
    get_biography: () => services.biography(),
    get_profile_picture: () => services.picture(),
    set_username: (value: string) => services.set_username(value),
    set_biography: (value: string) => services.set_biography(value),
    set_profile_picture: (value: string) => services.set_picture(value),
    get_favorite_songs: () => services.favorites(),
    add_favorite_song: (track: never) => services.add_favorite(track),
    remove_from_favorites: (path: string) => services.remove_favorite(path),

    // settings.json
    set_keybind: (key: string, value: string) => services.set_setting(key, value),
    remove_keybind: (key: string) => services.remove_setting(key),
    get_keybind: (key: string) => services.setting(key),
    get_all_keybinds: () => services.all_settings(),

    get_lyrics: (title: string, artist: string) => services.lyrics(title, artist),

    // discord has no socket on a phone
    set_activity: nothing,
    get_activity: async () => false,

    // yt-dlp, through modules/yt-dlp
    search_yt: (query: string, count: number) => ytdlp.search_youtube(query, count),
    search_sc: (query: string, count: number) => ytdlp.search_soundcloud(query, count),
    download_yt: (id: string) => ytdlp.download(`https://youtube.com/watch?v=${id}`),
    download_sc: (url: string) => ytdlp.download(url),

    // not on the phone yet: last.fm
    get_similar: async () => '',
    get_info: async () => '',
}

export type Call = { id: number; method: string; args: unknown[] }

// one call in, one answer out: [ok, value]
export async function answer(call: Call): Promise<[boolean, unknown]> {
    const handler = HANDLERS[call.method]
    if (!handler) return [false, `no ${call.method} on this phone`]

    try {
        return [true, (await (handler as (...args: unknown[]) => unknown)(...call.args)) ?? null]
    } catch (e) {
        return [false, e instanceof Error ? e.message : String(e)]
    }
}

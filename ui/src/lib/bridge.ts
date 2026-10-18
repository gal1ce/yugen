/*
 * The other side of the window. main.cpp exposes these through saucer, and
 * nothing in the ui talks to the backend any other way.
 */
// the functions main.cpp exposes through saucer
export type Bridge = {
    fetch_songs(path: string): Promise<string[]>
    get_metadata(path: string): Promise<string[]>
    get_cover(path: string): Promise<string>
    // a cover the user picked in place of the one in the file's tags. it is kept
    // beside the library rather than written into the file, and get_cover answers
    // with it once it is set - so nothing that draws a cover has to know which
    // of the two it is looking at
    update_track_cover(path: string, base64_img: string): Promise<boolean>
    get_lyrics(title: string, artist: string): Promise<string>
    set_activity(state: boolean): Promise<void>
    get_activity(): Promise<boolean>
    play_music(path: string, title: string, artist: string, album: string): Promise<void>
    get_position(): Promise<number>
    get_length(): Promise<number>
    stop(): Promise<void>
    resume(): Promise<void>
    toggle_loop(state: boolean): Promise<void>
    search_yt(query: string, count: number): Promise<string[]>
    search_sc(query: string, count: number): Promise<string[]>
    download_yt(id: string, path: string): Promise<string>
    download_sc(url: string, path: string): Promise<string>
    shuffle(songs: string[]): Promise<string[]>
    next(): Promise<string>
    prev(): Promise<string>
    is_finished(): Promise<boolean>
    seek(position: number): Promise<void>
    delete_song(path: string): Promise<void>
    get_liked_songs(): Promise<string[]>
    like_song(name: string): Promise<void>
    unlike_song(name: string): Promise<void>
    get_playlists(): Promise<string[]>
    get_playlist(playlist: string): Promise<string[]>
    // a playlist's own sleeve, as raw base64 the same way a track's cover comes
    // over. a playlist that has never been given one answers with nothing.
    get_playlist_cover(playlist: string): Promise<string>
    set_playlist_cover(playlist: string, base64_pic: string): Promise<boolean>
    create_playlist(playlist: string): Promise<boolean>
    // how many playlists exist, which is what a new one is named after
    get_playlist_count(): Promise<number>
    delete_playlist(playlist: string): Promise<boolean>
    rename_playlist(playlist: string, renamed: string): Promise<boolean>
    add_to_playlist(playlist: string, name: string): Promise<boolean>
    remove_from_playlist(playlist: string, name: string): Promise<boolean>
    set_volume(volume: number) : Promise<void>
    load_volume() : Promise<number>
    // settings.json, a flat string map. get_all_keybinds() hands the whole file
    // over as json text, not only the shortcut rows, so it is read by prefix
    set_keybind(key: string, value: string): Promise<boolean>
    remove_keybind(key: string): Promise<boolean>
    get_keybind(key: string): Promise<string>
    get_all_keybinds(): Promise<string>
    get_music_dir(): Promise<string>
    mpris_track(
        title: string,
        artist: string,
        album: string,
        path: string,
        cover: string,
    ): Promise<void>
    mpris_state(
        playing: boolean,
        position: number,
        length: number,
        volume: number,
        can_next: boolean,
        can_prev: boolean,
        loop: boolean,
        shuffle: boolean,
    ): Promise<void>
    mpris_seeked(position: number): Promise<void>
    get_username(): Promise<string>
    get_profile_picture(): Promise<string>
    get_biography(): Promise<string>
    set_username(username: string): Promise<boolean>
    set_profile_picture(img: string): Promise<boolean>
    set_biography(bio: string): Promise<boolean>
    get_favorite_songs(): Promise<FavoriteTrack[]>
    add_favorite_song(track: FavoriteTrack): Promise<boolean>
    remove_from_favorites(file_path: string): Promise<boolean>
    // one track in, the tracks last.fm puts next to it out - as json text
    // rather than an array, see as_similar. the path is read off disk to know
    // what is being asked about, the limit is per track, and an answer of ''
    // means the far side had no api key to ask with.
    get_similar(file_path: string, limit: number): Promise<string>
    // everything last.fm carries on one track's page, as the json text it
    // answered with. two things read it: the shelf, which wants the artwork out
    // of it and nothing else (as_cover, and it arrives placeholder and all - see
    // picture()), and the card in front of the player, which wants the rest.
    get_info(artist: string, track_name: string): Promise<string>
    // what is coming out of the speakers right now: the last `count` frames the
    // engine mixed, folded to mono, as floats in -1..1. not exposed yet - see
    // lib/audio.ts for what the ui does with it and why it is optional here
    get_audio_frames?(count: number): Promise<number[]>
    // the rate those frames were mixed at, asked for once
    get_sample_rate?(): Promise<number>
    // the display's refresh rate, on the Qt build only: see lib/frames.ts
    get_refresh_rate?(): Promise<number>
}

// what get_similar answers with, once the text has been read. the backend
// rebuilds each entry rather than passing last.fm's own on, so the image is
// blank wherever it only had the placeholder - which is most of them, and what
// the second look is for. the closeness is whatever json it was written as.
export type SimilarTrack = {
    name: string
    artist: string
    image: string
    match: string | number
}

export type FavoriteTrack = {
    title: string
    artist: string
    album: string
    file_path: string
}

declare global {
    interface Window {
        saucer: { exposed: Bridge }

        // where the backend delivers whatever the desktop asked of the mpris
        // interface - see the mpris block in the component below
        __yugen_mpris?: (cmd: string, arg: number) => void
    }
}

// saucer injects the bridge on the window at runtime
export const bridge = () => window.saucer.exposed

// the mpris calls are fire and forget: a missing binding is a backend from
// before the interface existed, and a machine with no session bus is still a
// perfectly good music player. neither is worth breaking a render over.
export const mpris = (call: () => Promise<void>) => {
    try {
        void call().catch(() => {})
    } catch {
        // binding not exposed
    }
}

// the music folder is the backend's to decide, so it is asked for once and kept
// here. every call site appends a file name straight onto it, hence the slash.
let music_path = ''

export async function music_dir() {
    if (!music_path) {
        const path = await bridge().get_music_dir()
        music_path = path.endsWith('/') ? path : `${path}/`
    }

    return music_path
}

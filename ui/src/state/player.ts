import { bridge, mpris, music_dir } from '../lib/bridge'
import { hold_position, position, set_position, set_running } from '../lib/clock'
import { as_info, type TrackInfo } from '../lib/lastfm'
import { asked } from '../lib/names'
import { save_playback, type Shuffle } from '../lib/prefs'
import { create_store } from '../lib/store'
import { listed_now, queue_now } from './derive'
import {
    album_of,
    artist_of,
    fetch_songs,
    library,
    sync_liked,
    sync_playlists,
    title_of,
} from './library'
import { saved_playback, ui } from './ui'

export type PlayerState = {
    current: string | null
    paused: boolean
    looped: boolean
    length: number
    volume: number
    // what unmuting goes back to, so the level survives a trip through zero
    prev_volume: number
    shuffle_mode: Shuffle
    // the order itself, kept apart from the mode: it is dealt once, by a click,
    // and then it is the queue until something asks for another one
    shuffled: string[] | null
    // the section a track was started from, when that is not the listing on
    // screen: next/prev stay inside the one that was opened
    scope: string[] | null
    // a queue built by hand. it holds the current track at its head and wraps,
    // so the chosen run keeps playing until it is cleared
    manual_queue: string[] | null
    // what lrclib and last.fm said, each held by the track it belongs to, so an
    // answer that lands after the song changed is not read as this one's
    sheet_for: { song: string; text: string } | null
    info_for: { song: string; info: TrackInfo | null } | null
}

export const player = create_store<PlayerState>({
    current: null,
    paused: false,
    looped: false,
    length: 0,
    volume: 1,
    prev_volume: 1,
    shuffle_mode: saved_playback?.shuffle ?? 'off',
    shuffled: null,
    scope: null,
    manual_queue: null,
    sheet_for: null,
    info_for: null,
})

// two runs that hold the same names in the same order. sections are rebuilt
// all the time, so identity says nothing about whether one has changed
const same_run = (a: string[] | null, b: string[] | null) =>
    a === b || (!!a && !!b && a.length === b.length && a.every((name, i) => name === b[i]))

/*
 * Repeat. toggle_loop() on the far side ignores what it is passed and flips the
 * flag on the sound that is loaded, and every play() loads a new sound with the
 * flag clear - so this side keeps its own copy of what the backend holds and
 * only calls across when the two have come apart.
 */
let loops = false

async function sync_loop(want: boolean) {
    if (loops === want) return

    loops = want
    await bridge().toggle_loop(want)
}

export async function play_music(name: string) {
    // the tags travel with the call: the backend needs them for the discord
    // status and this side has already read them
    const meta = library.get().meta[name] ?? []
    await bridge().play_music((await music_dir()) + name, meta[0] || name, meta[1] || '', meta[2] || '')

    // the far side builds a new sound per track and the new one never loops
    loops = false
    await sync_loop(player.get().looped)

    set_position(0)
    player.set({ current: name, paused: false })
}

// playing out of a section pins it: the bar, the queue and the shuffle walk
// these tracks until something is started from a listing again
export async function play_from(name: string, tracks: string[] | null) {
    const { scope, shuffle_mode } = player.get()
    const moved = !same_run(scope, tracks)

    player.set({ scope: tracks, manual_queue: null })

    // the order was dealt over the pool this is leaving, so a shuffle already
    // going gets a fresh one over the section being entered
    if (moved && shuffle_mode === 'listing') {
        player.set({ shuffled: await bridge().shuffle(tracks ?? listed_now()) })
    }

    await play_music(name)
}

// the head of a listing plays that listing, whatever the queue was holding
export async function play_listing(listed: string[]) {
    if (!listed.length) return

    player.set({ scope: null, manual_queue: null })

    if (player.get().shuffle_mode === 'listing') {
        const order = await bridge().shuffle(listed)

        player.set({ shuffled: order })
        await play_music(order[0] ?? listed[0])

        return
    }

    await play_music(listed[0])
}

export async function toggle_pause() {
    const { current, paused } = player.get()
    if (!current) return

    if (paused) await bridge().resume()
    else await bridge().stop()

    player.set({ paused: !paused })
}

export async function toggle_loop() {
    const want = !player.get().looped

    player.set({ looped: want })
    await sync_loop(want)
}

// the sound is parked at its end and stopped, so going round again is a seek
// and a start. with the flag on the track never reports finished at all.
async function replay() {
    await bridge().seek(0)
    await bridge().resume()

    set_position(0)
}

export function skip(offset: number) {
    const queue = queue_now()
    if (!queue.length) return

    const { current } = player.get()
    const index = current ? queue.indexOf(current) : -1

    void play_music(queue[(index + offset + queue.length) % queue.length])
}

export async function seek_to(seconds: number) {
    await bridge().seek(seconds)
    set_position(seconds)

    mpris(() => bridge().mpris_seeked(seconds))
}

export function nudge(seconds: number) {
    const { current, length } = player.get()
    if (!current || !length) return

    void seek_to(Math.min(Math.max(position() + seconds, 0), length))
}

// a drag on the progress bar: shown while it lasts, sent once it lets go
export const hold_seek = hold_position

export async function shuffle_into(mode: Shuffle) {
    player.set({ shuffle_mode: mode })

    if (mode === 'off') {
        player.set({ shuffled: null })
        return
    }

    // the backend owns the shuffling
    const pool = mode === 'all' ? library.get().songs : (player.get().scope ?? listed_now())
    player.set({ shuffled: await bridge().shuffle(pool) })
}

// off, then what is on screen, then everything, then off again
export const next_shuffle = (): Shuffle => {
    const mode = player.get().shuffle_mode
    return mode === 'off' ? 'listing' : mode === 'listing' ? 'all' : 'off'
}

export function play_next(name: string) {
    const { current, manual_queue } = player.get()

    if (!current) return void play_from(name, null)

    const base = (manual_queue ?? [current]).filter((song) => song !== name)
    const at = Math.max(base.indexOf(current), 0)

    player.set({ manual_queue: [...base.slice(0, at + 1), name, ...base.slice(at + 1)] })
}

export function add_to_queue(name: string) {
    const { current, manual_queue } = player.get()

    if (!current) return void play_from(name, null)

    player.set({ manual_queue: [...(manual_queue ?? [current]), name] })
}

export function remove_from_queue(index: number) {
    const order = player.get().manual_queue
    if (!order) return

    const next = order.filter((_, at) => at !== index)
    player.set({ manual_queue: next.length > 1 ? next : null })
}

export function move_in_queue(index: number, offset: number) {
    const order = player.get().manual_queue
    const to = index + offset

    if (!order || index < 1 || to < 1 || to >= order.length) return

    const next = [...order]
    ;[next[index], next[to]] = [next[to], next[index]]

    player.set({ manual_queue: next })
}

export const clear_queue = () => player.set({ manual_queue: null })

export function change_volume(v: number) {
    const volume = Math.max(0, Math.min(1, v))

    player.set(volume > 0 ? { volume, prev_volume: volume } : { volume })
    void bridge().set_volume(volume)
}

// silence is not a level to go back to, so a mute parks where the slider was.
// with nothing remembered - it was already at zero on the way up - it comes
// back at half
export function toggle_mute() {
    const { volume, prev_volume } = player.get()

    if (volume === 0) return change_volume(prev_volume > 0 ? prev_volume : 0.5)

    player.set({ prev_volume: volume })
    void bridge().set_volume(0)
    player.set({ volume: 0 })
}

export async function set_sharing(on: boolean) {
    // set rather than flipped, so a click landing twice cannot leave the two
    // sides disagreeing
    await bridge().set_activity(on)
    ui.set({ share_dc: on })
}

export async function remove_song(name: string) {
    await bridge().delete_song((await music_dir()) + name)

    if (player.get().current === name) player.set({ current: null })

    // nothing cascades on the disk side, so the dangling entries go here
    for (const [playlist, tracks] of Object.entries(library.get().playlists)) {
        if (tracks.includes(name)) await bridge().remove_from_playlist(playlist, name)
    }

    await fetch_songs()
    await sync_liked()
    await sync_playlists()
}

/*
 * Bringing the last track back. Nothing is loaded at startup and the backend
 * has no way to load a sound without starting it, so it is played and stopped
 * again - stop() is a pause, the cursor survives it, and seek() only wants a
 * loaded sound. What leaks out is one ipc round trip of audio.
 */
export async function restore(songs: string[]) {
    if (!saved_playback || player.get().current || !songs.includes(saved_playback.song)) return

    const { song, position: saved_at } = saved_playback
    const meta = library.get().meta[song] ?? []

    await bridge().play_music((await music_dir()) + song, meta[0] || song, meta[1] || '', meta[2] || '')
    await bridge().stop()

    const length = await bridge().get_length()

    // a cursor parked at the end trips is_finished, and the queue would move on
    // the moment the track is resumed
    const at = saved_at < length - 2 ? saved_at : 0
    if (at) await bridge().seek(at)

    set_position(at)
    player.set({ current: song, paused: true, length })
}

function persist() {
    const { current, shuffle_mode } = player.get()
    if (!current) return

    const { view, selection } = ui.get()
    save_playback({ song: current, position: position(), view, selection, shuffle: shuffle_mode })
}

// position is the one property mpris never signals, so this rides the poller,
// and the backend only puts a signal on the bus when something else moved
function push_state() {
    const { current, paused, length, volume, looped, shuffle_mode } = player.get()
    const queued = queue_now().length > 1

    mpris(() =>
        bridge().mpris_state(!!current && !paused, position(), length, volume, queued, queued, looped, shuffle_mode !== 'off'),
    )
}

// the cover rides along as the base64 the page already holds, so this is kept
// to the track changing rather than the once a second above
async function push_track(name: string | null) {
    if (!name) return mpris(() => bridge().mpris_track('', '', '', '', ''))

    const path = (await music_dir()) + name
    const cover = library.get().covers[name] ?? ''

    mpris(() => bridge().mpris_track(title_of(name), artist_of(name), album_of(name), path, cover))
}

// asked for every track that comes up: the backend keeps lyrics.json and
// answers off disk, which is the copy that outlives the window
function fetch_lyrics(song: string) {
    const ask = asked(title_of(song), artist_of(song))

    bridge()
        .get_lyrics(ask.track, ask.artist)
        .then((raw) => player.set({ sheet_for: { song, text: raw ?? '' } }))
        .catch(() => player.set({ sheet_for: { song, text: '' } }))
}

// only while the card is up - nothing else reads it, and info.json on the far
// side is what makes the second look free
function fetch_info(song: string) {
    const ask = asked(title_of(song), artist_of(song))

    bridge()
        .get_info(ask.artist, ask.track)
        .then((raw) => player.set({ info_for: { song, info: as_info(raw ?? '') } }))
        .catch(() => player.set({ info_for: { song, info: null } }))
}

/*
 * The one poller, and everything that has to hear about the player changing.
 * Started once from the app's mount; returns its own teardown.
 */
export function start_player() {
    let last = player.get()
    let last_ui = ui.get()
    let last_meta = library.get().meta

    const on_player = () => {
        const now = player.get()

        if (now.current !== last.current || now.paused !== last.paused) {
            set_running(!!now.current && !now.paused)
        }

        if (now.current !== last.current) {
            void push_track(now.current)
            if (now.current) fetch_lyrics(now.current)
            if (now.current && ui.get().info_open) fetch_info(now.current)
            persist()
        }

        if (
            now.current !== last.current ||
            now.paused !== last.paused ||
            now.length !== last.length ||
            now.volume !== last.volume ||
            now.looped !== last.looped ||
            now.shuffle_mode !== last.shuffle_mode ||
            now.manual_queue !== last.manual_queue
        ) {
            push_state()
        }

        if (now.shuffle_mode !== last.shuffle_mode) persist()

        last = now
    }

    const on_ui = () => {
        const now = ui.get()
        const { current } = player.get()

        if (now.info_open && !last_ui.info_open && current) fetch_info(current)
        if (now.view !== last_ui.view || now.selection !== last_ui.selection) persist()

        last_ui = now
    }

    // retagged files are asked about again under their new names
    const on_library = () => {
        const { meta } = library.get()
        const { current } = player.get()

        if (meta !== last_meta && current && meta[current] !== last_meta[current]) {
            fetch_lyrics(current)
            void push_track(current)
        }

        last_meta = meta
    }

    const unsubscribe = [player.subscribe(on_player), ui.subscribe(on_ui), library.subscribe(on_library)]

    const interval = setInterval(async () => {
        set_position(await bridge().get_position())
        player.set({ length: await bridge().get_length() })

        persist()
        push_state()

        if (!(await bridge().is_finished())) return

        // miniaudio parks the cursor at the end of a track, so is_finished
        // drives the queue
        const { current, paused, looped } = player.get()
        if (!current || paused) return

        if (looped) void replay()
        else skip(1)
    }, 1000)

    void bridge()
        .load_volume()
        .then((volume) => player.set(volume > 0 ? { volume, prev_volume: volume } : { volume }))

    // the flag is a ui preference, so the backend is told what it is on the way up
    void bridge().set_activity(ui.get().share_dc)

    return () => {
        clearInterval(interval)
        unsubscribe.forEach((off) => off())
    }
}

/*
 * MPRIS - the interface every panel, lock screen and media key reads a player
 * through. Controls come back from the backend through this.
 */
export function mpris_command(cmd: string, arg: number) {
    const { paused, length, looped } = player.get()

    if (cmd === 'playpause') void toggle_pause()
    else if (cmd === 'play' && paused) void toggle_pause()
    else if (cmd === 'pause' && !paused) void toggle_pause()
    // there is no stopped state - a track is always cued - so the closest
    // honest answer to Stop is a pause at the top of it
    else if (cmd === 'stop') {
        if (!paused) void toggle_pause()
        void seek_to(0)
    } else if (cmd === 'next') skip(1)
    else if (cmd === 'prev') skip(-1)
    else if (cmd === 'seek') void seek_to(Math.min(Math.max(position() + arg, 0), length))
    else if (cmd === 'position') void seek_to(Math.min(Math.max(arg, 0), length))
    else if (cmd === 'volume') change_volume(arg)
    else if (cmd === 'loop') {
        if (arg > 0 !== looped) void toggle_loop()
    } else if (cmd === 'shuffle') void shuffle_into(arg > 0 ? 'listing' : 'off')
}

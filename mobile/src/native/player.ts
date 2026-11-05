import { createAudioPlaylist, setAudioModeAsync, type AudioPlaylist } from 'expo-audio'
import { File, Paths } from 'expo-file-system'
import { cover, entry_of, metadata } from './library'
import { load, save } from './store'

/*
 * SoundManager, on a phone. The queue is still the interface's - shuffle, the
 * manual queue, the drift - but a phone cannot leave it all to the page: with
 * the screen off Android freezes the WebView's timers, so nothing would poll
 * is_finished and nothing would play next. So the voice is a playlist, and the
 * page keeps it stocked (set_up_next): the track before, the one playing and
 * the next ones in the page's own order. Tracks run into each other here, with
 * the screen off or on, and the lock screen's previous and next walk the same
 * list.
 *
 * Whenever the playlist moves on its own - a track ended, the lock screen -
 * the page is told which track it is on now (__yugen_now) and takes it as
 * the one playing. The lock screen's play and pause reach the page the way
 * MPRIS reaches it on the desktop (__yugen_mpris).
 */

let voice: AudioPlaylist | null = null
// the path of every item in the playlist, in its order
let paths: string[] = []
// the track the page and the lock screen were last told is up
let up = ''
let finished = false
// what the page last asked for; a change it did not ask for came from outside
let wanted_playing = false
let on_remote: (cmd: string, arg: number) => void = () => {}
let on_track: (path: string) => void = () => {}

export function listen_remote(callback: (cmd: string, arg: number) => void, track: (path: string) => void) {
    on_remote = callback
    on_track = track
}

const LOCK_SCREEN = { showNextTrack: true, showPreviousTrack: true, showSeekForward: false, showSeekBackward: false }

async function the_voice() {
    if (voice) return voice

    await setAudioModeAsync({ shouldPlayInBackground: true, interruptionMode: 'doNotMix', playsInSilentMode: true })

    voice = createAudioPlaylist({ sources: [], updateInterval: 250, loop: 'none' })
    voice.volume = await load_volume()

    voice.addListener('playlistStatusUpdate', (status) => {
        moved()

        // the end of the last track there is: not a pause from outside - the
        // page's poll takes it from here
        const ended = !status.playing && status.currentIndex >= paths.length - 1 && status.duration > 0 && status.currentTime >= status.duration - 0.5
        if (ended) return void (finished = true)

        if (status.isLoaded && status.playing !== wanted_playing && !finished) {
            wanted_playing = status.playing
            on_remote(status.playing ? 'play' : 'pause', 0)
        }
    })

    voice.addListener('trackChanged', () => moved())

    return voice
}

/*
 * Whether the playlist has gone to another track on its own. Told by path,
 * and read off the playlist as it is now rather than the event: set_up_next
 * takes items out from in front of the one playing, which shifts its index
 * without a transition, so the last index expo-audio reported goes stale (a
 * later move to that same index would never be reported), and an event raised
 * halfway through a rearrangement names an index of a list that is gone.
 */
function moved() {
    if (!voice) return
    const index = voice.currentIndex
    const path = paths[index]
    if (!path || path === up) return

    up = path
    finished = false
    wanted_playing = true
    void show(path)
    on_track(path)
}

// the lock screen wants a picture it can open: the cover goes to a file first
async function artwork_of(path: string) {
    const data = await cover(path)
    const match = /^data:image\/(\w+);base64,(.*)$/.exec(data)
    if (!match) return undefined

    try {
        // a name per track, so the lock screen never shows a stale picture under a new title
        const file = new File(Paths.cache, `now-${Date.now()}.${match[1] === 'png' ? 'png' : 'jpg'}`)
        file.create()
        file.write(match[2], { encoding: 'base64' })
        return file.uri
    } catch {
        return undefined
    }
}

// what the lock screen says about the track that is up
async function show(path: string | undefined) {
    if (!path || !voice) return

    const [title, artist, album] = await metadata(path)
    const about = { title: title || path.replace(/^.*\//, ''), artist, albumTitle: album }
    voice.updateLockScreenMetadata(about)

    const artworkUrl = await artwork_of(path)
    if (artworkUrl && paths[voice.currentIndex] === path) voice.updateLockScreenMetadata({ ...about, artworkUrl })
}

const source_of = (path: string) => {
    const entry = entry_of(path)
    return entry ? { uri: entry.uri } : null
}

export async function play(path: string, title: string, artist: string, album: string) {
    const list = await the_voice()
    finished = false
    wanted_playing = true

    // the page asked for it, so the move is not reported back to the page
    up = path

    // already up: the playlist got here first, and the page is catching up
    const at = paths.indexOf(path)
    if (at >= 0 && at === list.currentIndex) {
        list.play()
        return
    }

    // anything else starts the playlist over from it. not a skipTo, even to
    // a track already in it: a jump of the index has crashed the app in
    // media3's session ("Invalid PlayerInfo update", its controller still
    // holding a one-item list) - the page sends what follows right after
    const source = source_of(path)
    if (!source) return

    list.clear()
    paths = [path]
    list.add(source)
    list.play()

    about_now = { title, artist, albumTitle: album }
    list.setActiveForLockScreen(true, about_now, LOCK_SCREEN)
    void show(path)
}

/*
 * The lock screen's session, handed the playlist again once a run of edits
 * has settled. Its controller connects while the playlist still holds the
 * one track it was started with, and the additions made during that
 * handshake did not reach it: it kept a one-item list, and the first move
 * past the first item crashed the app. Made active again, it reads the
 * playlist as it is now.
 */
let about_now: { title: string; artist: string; albumTitle: string } = { title: '', artist: '', albumTitle: '' }
let resettle = 0

function settle_lock_screen() {
    clearTimeout(resettle)
    resettle = setTimeout(() => {
        if (!voice || !paths.length) return
        voice.setActiveForLockScreen(true, about_now, LOCK_SCREEN)
        void show(paths[voice.currentIndex])
    }, 400) as unknown as number
}

/*
 * The page's order after the track that is playing. Only what follows the
 * playing item is ever touched, and only from where the old order and the
 * new one part: media3's session crashed the app ("Invalid PlayerInfo
 * update") when the items in front of the playing one were taken out and put
 * back, the index shifting under its controller. What came before stays, as
 * the tracks that played - which is what the lock screen's previous walks
 * back through. `previous` is the page's own idea of that, kept for the
 * desktop-shaped call and not needed here.
 */
export async function set_up_next(around: string, _previous: string, next: string[]) {
    const list = await the_voice()
    const at = list.currentIndex
    const current = paths[at]
    // only a list worked out around the track playing here: one from a page
    // that is behind (asleep while this went on) waits for it to catch up
    if (!current || current !== around) return

    const after = next.filter((p) => p !== current && source_of(p))
    const tail = paths.slice(at + 1)

    let same = 0
    while (same < after.length && same < tail.length && after[same] === tail[same]) same++
    if (same === after.length && same === tail.length) return

    // from the end back to where they part, then what the new order adds
    for (let i = paths.length - 1; i > at + same; i--) list.remove(i)
    for (const path of after.slice(same)) list.add(source_of(path)!)
    paths = [...paths.slice(0, at + 1 + same), ...after.slice(same)]
    settle_lock_screen()
}

export async function resume() {
    const list = await the_voice()
    wanted_playing = true
    list.play()
}

export async function stop() {
    const list = await the_voice()
    wanted_playing = false
    list.pause()
}

export async function seek(position: number) {
    const list = await the_voice()
    finished = false
    await list.seekTo(position)
}

// repeat is one track over and over, as on the desktop
export async function set_loop(state: boolean) {
    ;(await the_voice()).loop = state ? 'single' : 'none'
}

export const position = async () => voice?.currentTime ?? 0
export const length = async () => voice?.duration ?? 0
export const is_finished = async () => finished

export async function set_volume(volume: number) {
    if (voice) voice.volume = volume
    await save('volume.json', volume)
}

export async function load_volume() {
    return load<number>('volume.json', 1)
}

// the queue's own order is the interface's; shuffle only deals a new one
export function shuffle(songs: string[]) {
    const out = [...songs]
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
}

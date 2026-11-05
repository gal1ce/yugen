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
 * the page is told the way MPRIS tells it on the desktop (__yugen_mpris
 * 'next' / 'prev'), and catches up: its skip lands on the track already
 * playing here, which play() takes as a no-op. The lock screen's play and
 * pause reach the page the same way.
 */

let voice: AudioPlaylist | null = null
// the path of every item in the playlist, in its order
let paths: string[] = []
// the track the page and the lock screen were last told is up
let up = ''
// moves made here the page has been told of and not yet caught up with: its
// skips answering them land on tracks this has already moved past
let owed = 0
let finished = false
// what the page last asked for; a change it did not ask for came from outside
let wanted_playing = false
let on_remote: (cmd: string, arg: number) => void = () => {}

export function listen_remote(callback: (cmd: string, arg: number) => void) {
    on_remote = callback
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

    const from = paths.indexOf(up)
    up = path
    finished = false
    wanted_playing = true
    owed++
    void show(path)
    on_remote(from >= 0 && index < from ? 'prev' : 'next', 0)
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

    // the page catching up with a move made here: its skip names a track
    // this has gone through already, or the one playing - nothing to do
    if (owed > 0 && paths.includes(path)) {
        owed--
        list.play()
        return
    }
    owed = 0

    // the page asked for it, so the move is not reported back to the page
    up = path

    // already up: the playlist got here first, and the page is catching up
    const at = paths.indexOf(path)
    if (at >= 0 && at === list.currentIndex) {
        list.play()
        return
    }

    // in the playlist already: a step to it keeps the rest as it is
    if (at >= 0) {
        list.skipTo(at)
        list.play()
        void show(path)
        return
    }

    const source = source_of(path)
    if (!source) return

    list.clear()
    paths = [path]
    list.add(source)
    list.play()

    list.setActiveForLockScreen(true, { title, artist, albumTitle: album }, LOCK_SCREEN)
    void show(path)
}

/*
 * The page's order around the track that is playing: the one before it, and
 * the ones after it. Everything but the playing item is taken out and put back
 * in the new order, so the track playing never stops.
 */
export async function set_up_next(around: string, previous: string, next: string[]) {
    const list = await the_voice()
    const current = paths[list.currentIndex]
    // only a list worked out around the track playing here: one from a page
    // that is behind (asleep while this went on) waits for it to catch up
    if (!current || current !== around) return

    const before = previous && previous !== current && source_of(previous) ? previous : ''
    const after = next.filter((p) => p !== current && source_of(p))
    const want = [...(before ? [before] : []), current, ...after]
    if (want.length === paths.length && want.every((p, i) => p === paths[i])) return

    // after the current item, from the end, then everything before it
    for (let i = paths.length - 1; i > list.currentIndex; i--) list.remove(i)
    for (let i = list.currentIndex - 1; i >= 0; i--) list.remove(0)

    for (const path of after) list.add(source_of(path)!)
    if (before) list.insert(source_of(before)!, 0)
    paths = want
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

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio'
import { File, Paths } from 'expo-file-system'
import { cover, entry_of } from './library'
import { load, save } from './store'

/*
 * SoundManager, on a phone: one voice, and every transport call means the
 * track that is up. The queue stays the interface's, as on the desktop - it
 * polls is_finished and asks for the next track itself.
 *
 * The lock screen and the notification drive the voice directly. When they
 * pause or play it, the interface is told the way MPRIS tells it on the
 * desktop (window.__yugen_mpris), so the two never disagree about whether
 * anything is playing.
 */

let voice: AudioPlayer | null = null
let finished = false
// what the interface last asked for; a change it did not ask for came from outside
let wanted_playing = false
let on_remote: (cmd: string, arg: number) => void = () => {}

export function listen_remote(callback: (cmd: string, arg: number) => void) {
    on_remote = callback
}

async function the_voice() {
    if (voice) return voice

    await setAudioModeAsync({ shouldPlayInBackground: true, interruptionMode: 'doNotMix', playsInSilentMode: true })

    voice = createAudioPlayer(null, { updateInterval: 250 })
    voice.volume = await load_volume()
    voice.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) finished = true
        if (status.isLoaded && status.playing !== wanted_playing && !status.didJustFinish && !finished) {
            wanted_playing = status.playing
            on_remote(status.playing ? 'play' : 'pause', 0)
        }
    })

    return voice
}

// the lock screen wants a picture it can open: the cover goes to a file first
async function artwork_of(path: string) {
    const data = await cover(path)
    const match = /^data:image\/(\w+);base64,(.*)$/.exec(data)
    if (!match) return undefined

    try {
        const file = new File(Paths.cache, `now.${match[1] === 'png' ? 'png' : 'jpg'}`)
        if (file.exists) file.delete()
        file.create()
        file.write(match[2], { encoding: 'base64' })
        return `${file.uri}?${Date.now()}`
    } catch {
        return undefined
    }
}

export async function play(path: string, title: string, artist: string, album: string) {
    const entry = entry_of(path)
    if (!entry) return

    const player = await the_voice()
    finished = false
    wanted_playing = true
    player.replace({ uri: entry.uri })
    player.play()

    player.setActiveForLockScreen(true, { title, artist, albumTitle: album }, { showSeekForward: false, showSeekBackward: false })
    void artwork_of(path).then((artworkUrl) => artworkUrl && player.updateLockScreenMetadata({ title, artist, albumTitle: album, artworkUrl }))
}

export async function resume() {
    const player = await the_voice()
    wanted_playing = true
    player.play()
}

export async function stop() {
    const player = await the_voice()
    wanted_playing = false
    player.pause()
}

export async function seek(position: number) {
    const player = await the_voice()
    finished = false
    await player.seekTo(position)
}

export async function set_loop(state: boolean) {
    ;(await the_voice()).loop = state
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

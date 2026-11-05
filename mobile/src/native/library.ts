import { File, FileMode } from 'expo-file-system'
import { Asset, AssetField, MediaType, Query, requestPermissionsAsync } from 'expo-media-library'
import { read_tags, tag_size, type Tags } from './id3'
import { read_mp4_tags } from './mp4'
import { load, update } from './store'

// what a phone's music comes as: the desktop's mp3s, and the m4a most other
// downloaders make. a voice note is audio too, but not music
const MUSIC = /\.(mp3|m4a)$/i
const VOICE = /^(AUD|PTT)-\d/

/*
 * The library is every music file the phone's media store knows about. The
 * interface names a track by its file name under a folder (dir + name, as on
 * the desktop), so the folder here is a made-up root and the name is the
 * file's own - made unique when two folders hold the same one.
 */
export const ROOT = 'media://'

type Entry = { id: string; uri: string; duration: number; added: number }

const tracks = new Map<string, Entry>()
const tags = new Map<string, Tags>()

export const name_of = (path: string) => (path.startsWith(ROOT) ? path.slice(ROOT.length) : path.slice(path.lastIndexOf('/') + 1))
export const entry_of = (path: string) => tracks.get(name_of(path))

export async function scan(): Promise<string[]> {
    const permission = await requestPermissionsAsync(false, ['audio'])
    if (!permission.granted) return []

    const assets = await new Query().eq(AssetField.MEDIA_TYPE, MediaType.AUDIO).exe()
    const infos = await Promise.all(assets.map((asset) => asset.getInfo().catch(() => null)))

    tracks.clear()
    for (const info of infos) {
        if (!info || !MUSIC.test(info.filename) || VOICE.test(info.filename)) continue

        let name = info.filename
        for (let n = 2; tracks.has(name); n++) name = info.filename.replace(MUSIC, ` (${n})$&`)

        tracks.set(name, {
            id: info.id,
            uri: info.uri,
            // the media store counts in milliseconds
            duration: Math.round((info.duration ?? 0) / 1000),
            added: Math.round((info.creationTime ?? info.modificationTime ?? 0) / 1000),
        })
    }

    return [...tracks.keys()]
}

// the tag only, read off the head of the file: the audio after it never moves
async function tags_of(name: string): Promise<Tags> {
    const known = tags.get(name)
    if (known) return known

    const entry = tracks.get(name)
    let read: Tags = { title: '', artist: '', album: '', cover: '' }

    if (entry) {
        try {
            const handle = new File(entry.uri).open(FileMode.ReadOnly)
            try {
                if (/\.m4a$/i.test(name)) {
                    read = await read_mp4_tags(handle)
                    tags.set(name, read)
                    return read
                }

                const head = await handle.readBytes(10)
                const size = tag_size(head)
                if (size) {
                    const rest = await handle.readBytes(size - 10)
                    const whole = new Uint8Array(size)
                    whole.set(head)
                    whole.set(rest, 10)
                    read = read_tags(whole)
                }
            } finally {
                handle.close()
            }
        } catch (e) {
            console.warn(`could not read the tags of ${name}`, e)
        }
    }

    tags.set(name, read)
    return read
}

// [title, artist, album, seconds, added] - SoundManager::get_metadata's shape
export async function metadata(path: string): Promise<string[]> {
    const name = name_of(path)
    const entry = tracks.get(name)
    if (!entry) return []

    const read = await tags_of(name)
    return [read.title, read.artist, read.album, String(entry.duration), String(entry.added)]
}

// a cover picked in the app beats the one in the file (update_track_cover)
export async function cover(path: string): Promise<string> {
    const name = name_of(path)
    const own = (await load<Record<string, string>>('track_covers.json', {}))[name]
    if (own) return own

    return (await tags_of(name)).cover
}

export async function set_cover(path: string, base64_img: string) {
    await update<Record<string, string>>('track_covers.json', {}, (covers) => {
        covers[name_of(path)] = `data:image/jpeg;base64,${base64_img}`
    })
    return true
}

// custom_titles.json: full path -> title, as on the desktop
export async function set_title(path: string, title: string) {
    await update<Record<string, string>>('custom_titles.json', {}, (titles) => {
        if (title) titles[path] = title
        else delete titles[path]
    })
    return true
}

export async function titles() {
    return JSON.stringify(await load<Record<string, string>>('custom_titles.json', {}))
}

export async function remove(path: string) {
    const entry = entry_of(path)
    if (!entry) return
    // the system asks the listener before a file it did not make goes
    await new Asset(entry.id).delete()
    tracks.delete(name_of(path))
}

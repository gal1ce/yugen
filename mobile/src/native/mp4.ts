import type { FileHandle } from 'expo-file-system'
import { base64, type Tags } from './id3'

/*
 * The tags of an m4a: the iTunes-style list under moov/udta/meta/ilst. The
 * file is walked atom by atom from the top, reading only headers, until moov
 * - which may sit at the end, after the audio - and only moov is read whole.
 */

const EMPTY: Tags = { title: '', artist: '', album: '', cover: '' }

const u32 = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0
const name_at = (b: Uint8Array, at: number) => String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3])

function utf8(b: Uint8Array) {
    let out = ''
    for (let i = 0; i < b.length; ) {
        const c = b[i++]
        if (c < 0x80) out += String.fromCharCode(c)
        else if (c < 0xe0) out += String.fromCharCode(((c & 0x1f) << 6) | (b[i++] & 0x3f))
        else if (c < 0xf0) out += String.fromCharCode(((c & 0x0f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f))
        else out += String.fromCodePoint(((c & 0x07) << 18) | ((b[i++] & 0x3f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f))
    }
    return out
}

// the children of an atom whose body runs from `from` to `to`
function* children(b: Uint8Array, from: number, to: number) {
    for (let at = from; at + 8 <= to; ) {
        const size = u32(b, at)
        if (size < 8 || at + size > to) return
        yield { type: name_at(b, at + 4), body: at + 8, end: at + size }
        at += size
    }
}

const child = (b: Uint8Array, from: number, to: number, type: string) => {
    for (const c of children(b, from, to)) if (c.type === type) return c
    return null
}

// moov, read off the file without the audio around it
async function moov_of(handle: FileHandle): Promise<Uint8Array | null> {
    const size = handle.size ?? 0
    let at = 0

    while (at + 8 <= size) {
        handle.offset = at
        const head = await handle.readBytes(16)
        let length = u32(head, 0)
        const type = name_at(head, 4)
        let skip = 8

        // a 64-bit size, and 0 for "to the end of the file"
        if (length === 1) (length = u32(head, 8) * 2 ** 32 + u32(head, 12)), (skip = 16)
        else if (length === 0) length = size - at
        if (length < skip) return null

        if (type === 'moov') {
            handle.offset = at
            return handle.readBytes(length)
        }
        at += length
    }

    return null
}

export async function read_mp4_tags(handle: FileHandle): Promise<Tags> {
    const moov = await moov_of(handle)
    if (!moov) return EMPTY

    const udta = child(moov, 8, moov.length, 'udta')
    const meta = udta && child(moov, udta.body, udta.end, 'meta')
    // meta is a full atom: four bytes of version and flags before its children
    const ilst = meta && child(moov, meta.body + 4, meta.end, 'ilst')
    if (!ilst) return EMPTY

    const out = { ...EMPTY }
    for (const item of children(moov, ilst.body, ilst.end)) {
        const data = child(moov, item.body, item.end, 'data')
        if (!data) continue

        // type (4), locale (4), then the value
        const kind = u32(moov, data.body) & 0xffffff
        const value = moov.subarray(data.body + 8, data.end)

        if (item.type === '©nam') out.title = utf8(value)
        else if (item.type === '©ART') out.artist = utf8(value)
        else if (item.type === '©alb') out.album = utf8(value)
        else if (item.type === 'covr' && !out.cover) out.cover = `data:${kind === 14 ? 'image/png' : 'image/jpeg'};base64,${base64(value)}`
    }

    return out
}

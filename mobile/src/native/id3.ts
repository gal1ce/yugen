/*
 * What TagLib does for the desktop, for the one format the library holds: an
 * ID3v2 tag at the head of an mp3. Only what the interface asks for is read -
 * the title, the artist, the album and the front cover - and only the tag's
 * own bytes, never the audio after it.
 */

export type Tags = {
    title: string
    artist: string
    album: string
    // the picture as a data url, ready for an <img>
    cover: string
}

const EMPTY: Tags = { title: '', artist: '', album: '', cover: '' }

// how big the tag says it is, before any byte of it has been read
export function tag_size(head: Uint8Array): number {
    if (head.length < 10 || head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return 0
    const size = synchsafe(head, 6)
    // a footer, when the flags say there is one, is ten more
    return 10 + size + (head[5] & 0x10 ? 10 : 0)
}

const synchsafe = (b: Uint8Array, at: number) => ((b[at] & 0x7f) << 21) | ((b[at + 1] & 0x7f) << 14) | ((b[at + 2] & 0x7f) << 7) | (b[at + 3] & 0x7f)
const plain = (b: Uint8Array, at: number) => ((b[at] << 24) | (b[at + 1] << 16) | (b[at + 2] << 8) | b[at + 3]) >>> 0

function latin1(b: Uint8Array) {
    let out = ''
    for (let i = 0; i < b.length; i++) out += String.fromCharCode(b[i])
    return out
}

function utf8(b: Uint8Array) {
    let out = ''
    for (let i = 0; i < b.length; ) {
        const c = b[i++]
        if (c < 0x80) out += String.fromCharCode(c)
        else if (c < 0xe0) out += String.fromCharCode(((c & 0x1f) << 6) | (b[i++] & 0x3f))
        else if (c < 0xf0) out += String.fromCharCode(((c & 0x0f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f))
        else {
            const point = ((c & 0x07) << 18) | ((b[i++] & 0x3f) << 12) | ((b[i++] & 0x3f) << 6) | (b[i++] & 0x3f)
            out += String.fromCodePoint(point)
        }
    }
    return out
}

function utf16(b: Uint8Array, big: boolean) {
    let at = 0
    // a byte order mark says which way round, and is not part of the text
    if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) (big = false), (at = 2)
    else if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) (big = true), (at = 2)

    let out = ''
    for (; at + 1 < b.length; at += 2) out += String.fromCharCode(big ? (b[at] << 8) | b[at + 1] : b[at] | (b[at + 1] << 8))
    return out
}

function text(b: Uint8Array, encoding: number) {
    const s = encoding === 1 ? utf16(b, false) : encoding === 2 ? utf16(b, true) : encoding === 3 ? utf8(b) : latin1(b)
    // a frame may hold several strings, nul-separated; the first is the one
    return s.split('\0')[0].trim()
}

// where a nul-terminated string ends, in the frame's encoding
function terminator(b: Uint8Array, from: number, encoding: number) {
    const wide = encoding === 1 || encoding === 2
    for (let i = from; i < b.length; i += wide ? 2 : 1) {
        if (b[i] === 0 && (!wide || b[i + 1] === 0)) return i + (wide ? 2 : 1)
    }
    return b.length
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function base64(b: Uint8Array) {
    let out = ''
    let i = 0
    for (; i + 2 < b.length; i += 3) {
        const n = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2]
        out += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63] + ALPHABET[(n >> 6) & 63] + ALPHABET[n & 63]
    }
    if (i < b.length) {
        const n = (b[i] << 16) | ((b[i + 1] ?? 0) << 8)
        out += ALPHABET[n >> 18] + ALPHABET[(n >> 12) & 63] + (i + 1 < b.length ? ALPHABET[(n >> 6) & 63] : '=') + '='
    }
    return out
}

function picture(b: Uint8Array, v22: boolean) {
    const encoding = b[0]
    let at = 1
    let mime: string

    if (v22) {
        // three letters of format rather than a mime type
        const format = latin1(b.subarray(1, 4)).toLowerCase()
        mime = format === 'png' ? 'image/png' : 'image/jpeg'
        at = 4
    } else {
        const end = terminator(b, at, 0)
        mime = latin1(b.subarray(at, end - 1)) || 'image/jpeg'
        if (!mime.includes('/')) mime = `image/${mime.toLowerCase() === 'png' ? 'png' : 'jpeg'}`
        at = end
    }

    const kind = b[at]
    at = terminator(b, at + 1, encoding)

    return { kind, url: `data:${mime};base64,${base64(b.subarray(at))}` }
}

// the tag, from its first byte; anything after it is ignored
export function read_tags(tag: Uint8Array): Tags {
    if (!tag_size(tag)) return EMPTY

    const major = tag[3]
    const flags = tag[5]
    const v22 = major === 2
    const end = Math.min(tag.length, 10 + synchsafe(tag, 6))
    let at = 10

    // an extended header carries nothing wanted here
    if (flags & 0x40 && !v22) at += major === 4 ? synchsafe(tag, at) : plain(tag, at) + 4

    const out = { ...EMPTY }
    let front = false

    while (at + (v22 ? 6 : 10) <= end) {
        const id = latin1(tag.subarray(at, at + (v22 ? 3 : 4)))
        if (!/^[A-Z0-9]{3,4}$/.test(id)) break

        const size = v22 ? (tag[at + 3] << 16) | (tag[at + 4] << 8) | tag[at + 5] : major === 4 ? synchsafe(tag, at + 4) : plain(tag, at + 4)
        const body = tag.subarray(at + (v22 ? 6 : 10), at + (v22 ? 6 : 10) + size)
        at += (v22 ? 6 : 10) + size
        if (!size) continue

        if (id === 'TIT2' || id === 'TT2') out.title ||= text(body.subarray(1), body[0])
        else if (id === 'TPE1' || id === 'TP1') out.artist ||= text(body.subarray(1), body[0])
        else if (id === 'TALB' || id === 'TAL') out.album ||= text(body.subarray(1), body[0])
        else if ((id === 'APIC' || id === 'PIC') && !front) {
            // the front cover wins over any other picture; failing one, the first
            const pic = picture(body, v22)
            if (pic.kind === 3 || !out.cover) out.cover = pic.url
            front = pic.kind === 3
        }
    }

    return out
}

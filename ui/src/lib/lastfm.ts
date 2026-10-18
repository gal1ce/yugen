import type { SimilarTrack } from './bridge'
import { fold } from './names'

// how many suggestions a full shelf holds. a pass digs four times as deep as
// that before it gives up: last.fm rarely has a picture on the similar list
// itself, so most of what is found costs one more request before it can be
// shown, and the ones with nothing behind them are dropped.
export const SUGGESTIONS = 60

// one artist is allowed this many places on the shelf. last.fm answers a seed
// with a lot of the same name, so without a ceiling a pass reads as one back
// catalogue rather than as a spread of what else there is.
export const PER_ARTIST = 3

// the backend answers for one track at a time by design, so a pass is many
// small calls rather than one big one: a sample of the tracks the listener has
// actually marked, each asked about on its own.
export const SEEDS = [60, 110] as const
export const PER_SEED = [50, 60] as const

// a pass does not only ask about what carries a heart. this share of its seeds
// is drawn from the rest of the folder instead, so the shelf hears from more
// than the handful of tracks that have been marked - the ones that have are
// still the larger half of it.
export const WIDER_SHARE = 0.4

// what is on screen before 'load more'
export const SUGGESTION_PAGE = 20

// the shelf at the foot of a listing is a list rather than a wall of covers, so
// it holds fewer and uncovers them a handful at a time
export const NEARBY = 30
export const NEARBY_PAGE = 10

// every call runs on a thread of its own on the far side and ends in a request
// to last.fm, which asks for about five a second: the work is walked a few at a
// time rather than all at once, and this is the width of that walk
export const LANES = 4

// what a pass was asked for: a shelf being filled, the same shelf asked again
// for different names, or more piled under what is already on it
export type Mood = 'new' | 'again' | 'more'

export type Suggestion = {
    // artist and title folded together: what tells two answers apart, and what
    // a track already on disk is recognised by
    key: string
    artist: string
    title: string
    // last.fm's own artwork for the track, as a url. a suggestion without one
    // never reaches the screen, so this is always set by the time it is read.
    image: string
    // how close last.fm thinks it is to the seed, which is the order they read in
    match: number
}

/*
 * The backend hands its answer over as text - one json library in the binary is
 * enough, and the one it has is not the one saucer serialises with - so the
 * reading is done here. Anything that does not come back as an array is a seed
 * with nothing to say, which is the same as an empty one: a pass carries on
 * around it rather than failing over it.
 */
export function as_similar(answer: string): SimilarTrack[] {
    if (!answer) return []

    try {
        const parsed = JSON.parse(answer)

        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

/*
 * The one url out of a track.getInfo answer, read here for the same reason
 * as_similar is: what the backend hands over is last.fm's own reply, whole.
 *
 * What a track page carries is the album's cover rather than the track's, at
 * the largest size offered, and every step down to it is allowed to be missing
 * - a track last.fm knows by name but has no release for has no picture
 * either, which reads the same as an answer that never arrived.
 */
export function as_cover(answer: string): string {
    if (!answer) return ''

    try {
        const images = JSON.parse(answer)?.track?.album?.image
        if (!Array.isArray(images)) return ''

        return images.find((i) => i?.size === 'extralarge')?.['#text'] ?? ''
    } catch {
        return ''
    }
}

/* ---------- what last.fm keeps on a track ---------- */

// more than four reads as a wall rather than as a description of the track
export const TAGS = 4

// the parts of a track.getInfo answer the card in front of the player shows.
// every one of them is optional: last.fm answers for a track it barely knows
// with little more than the name it was asked about.
export type TrackInfo = {
    album: string
    tags: string[]
    listeners: number
    playcount: number
    // out of the wiki entry, which dates the release rather than the writing
    year: string
    summary: string
}

export const ENTITIES: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    '#39': "'",
    nbsp: ' ',
}

// last.fm writes its wiki entries as html and closes every one of them with a
// link back to its own page for the track. Neither belongs in a paragraph here,
// so the link goes first - trailing full stop and all - and what is left of the
// markup is unwrapped around what it was wrapping.
export function as_prose(html: string) {
    return html
        .replace(/<a\b[^>]*>[\s\S]*?<\/a>\.?/gi, '')
        .replace(/<[^>]*>/g, '')
        .replace(/&(#?\w+);/g, (whole, name: string) => ENTITIES[name] ?? whole)
        .replace(/\s+/g, ' ')
        .trim()
}

/*
 * One track.getInfo answer, read down to the handful of fields the card shows.
 *
 * Every step is reached for rather than assumed: the same endpoint answers with
 * a wiki and a tag list for a track it has an entry for, with a bare name and a
 * play count for one it does not, and with an error object for one it has never
 * heard of. None of the three is worth failing the card over, so anything that
 * is not there simply does not appear on it.
 */
export function as_info(answer: string): TrackInfo | null {
    if (!answer) return null

    try {
        const track = JSON.parse(answer)?.track
        if (!track) return null

        // a track carrying one tag has it handed over as an object rather than
        // as a list of one, which is the only shape surprise in the answer
        const listed = track.toptags?.tag
        const tags: string[] = (Array.isArray(listed) ? listed : listed ? [listed] : [])
            .map((tag: { name?: string }) => tag?.name)
            .filter((name: unknown): name is string => typeof name === 'string' && !!name)

        const published: string = track.wiki?.published ?? ''

        return {
            album: typeof track.album?.title === 'string' ? track.album.title : '',
            tags: tags.slice(0, TAGS),
            listeners: Number(track.listeners) || 0,
            playcount: Number(track.playcount) || 0,
            year: published.match(/\b(?:19|20)\d{2}\b/)?.[0] ?? '',
            summary: as_prose(track.wiki?.summary ?? ''),
        }
    } catch {
        return null
    }
}

// the one grey star last.fm hands back for everything it has no picture for.
// get_similar already drops it on the way over; a track's own page does not,
// and that is the call nearly every card ends up going through.
export const NO_PICTURE = '2a96cbd8b46e442fc41c2b86b821562f'

export const picture = (url?: string) => {
    const src = (url ?? '').trim()

    return src.startsWith('http') && !src.includes(NO_PICTURE) ? src : ''
}

export const between = ([min, max]: readonly [number, number]) =>
    min + Math.floor(Math.random() * (max - min + 1))

// a partial fisher-yates: only as much of the pool as is actually wanted gets
// shuffled, and the pool itself is left alone
export function sample<T>(pool: T[], count: number) {
    const rest = [...pool]
    const wanted = Math.min(count, rest.length)

    for (let i = 0; i < wanted; i++) {
        const pick = i + Math.floor(Math.random() * (rest.length - i))
        ;[rest[i], rest[pick]] = [rest[pick], rest[i]]
    }

    return rest.slice(0, wanted)
}

/*
 * Last.fm answers a seed with a lot of the same name - ask it about one track
 * and half the list is that track's artist - so the closest hundred candidates
 * can easily be a dozen artists deep and nothing else. This deals them out in
 * rounds instead: everyone's closest first, then everyone's second closest,
 * and so on, up to PER_ARTIST each. The order within an artist is kept, so the
 * list still reads closest-first; it just stops being one name at a time.
 */
export function spread_artists(tracks: Suggestion[]) {
    const by_artist = new Map<string, Suggestion[]>()

    for (const track of tracks) {
        const name = fold(track.artist) || track.key
        const held = by_artist.get(name)

        if (held) held.push(track)
        else by_artist.set(name, [track])
    }

    const dealt: Suggestion[] = []

    for (let round = 0; round < PER_ARTIST; round++) {
        for (const held of by_artist.values()) {
            if (held[round]) dealt.push(held[round])
        }
    }

    return dealt
}

// a fixed number of workers over one list: whichever lane comes free takes the
// next seed, so a slow one holds up nothing but itself
export async function in_lanes<T, R>(items: T[], lanes: number, work: (item: T) => Promise<R>) {
    const done: R[] = new Array(items.length)
    let next = 0

    await Promise.all(
        Array.from({ length: Math.min(lanes, items.length) }, async () => {
            while (next < items.length) {
                const index = next++
                done[index] = await work(items[index])
            }
        }),
    )

    return done
}

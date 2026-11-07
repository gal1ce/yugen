import { artist_tag, album_tag } from '../lib/names'
import { memo_last, useStore } from '../lib/store'
import { library } from './library'
import { plays } from './plays'

/*
 * Mixes: an artist the listener keeps coming back to and the few artists
 * that live next to them, dealt together - Spotify's Daily Mix, made of this
 * library alone. Nothing is guessed at: an artist's weight is what was done
 * with them (plays first, then hearts and stars, then simply how much of them
 * is kept), and two artists are neighbours only where the listener put them
 * side by side - in one playlist, one after the other within a sitting, or on
 * one record. The deal is the day's: the same mixes all day, so a mix that is
 * playing is never reshuffled under it, and new ones tomorrow.
 */

export type Mix = {
    name: string
    seed: string
    with: string[]
    tracks: string[]
    // the faces on its cover: the seed's tracks, then each side's
    faces: [string[], string[], string[]]
}

const MAX_MIXES = 6
const MAX_TRACKS = 50
const MIN_TRACKS = 5
// two plays further apart than this were not one sitting
const SITTING = 20 * 60 * 1000

const today = () => new Date().toDateString()

// a small seeded deal, so a day's mix is the same each time it is opened
function rng(seed: string) {
    let h = 2166136261
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
    return () => {
        h = Math.imul(h ^ (h >>> 15), 2246822507)
        h = Math.imul(h ^ (h >>> 13), 3266489909)
        return ((h ^= h >>> 16) >>> 0) / 4294967296
    }
}

const pair = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`)

const mixes_of = memo_last((songs: string[], meta: Record<string, string[]>, playlists: Record<string, string[]>, day: string): Mix[] => {
    const { liked, favorites } = library.get()
    const { counts, history } = plays.get()
    const starred = new Set(favorites.map((track) => track.file_path))
    const artist = (name: string) => artist_tag(meta[name]).trim()
    const known = (name: string) => !!name && name !== 'Unknown artist'

    // each artist's tracks, and how much the listener has done with each one
    const weight = (name: string) => (counts[name]?.n ?? 0) * 3 + (liked.has(name) ? 2 : 0) + (starred.has(name) ? 2 : 0)
    const tracks = new Map<string, string[]>()
    for (const name of songs) {
        const who = artist(name)
        if (!known(who)) continue
        const bucket = tracks.get(who)
        if (bucket) bucket.push(name)
        else tracks.set(who, [name])
    }

    const score = new Map<string, number>()
    for (const [who, names] of tracks) score.set(who, names.reduce((sum, name) => sum + weight(name), 0) + names.length * 0.5)

    // who sits beside whom
    const near = new Map<string, number>()
    const bump = (a: string, b: string, by: number) => {
        if (a === b || !tracks.has(a) || !tracks.has(b)) return
        const key = pair(a, b)
        near.set(key, (near.get(key) ?? 0) + by)
    }
    for (const list of Object.values(playlists)) {
        const who = [...new Set(list.map(artist).filter(known))]
        if (who.length > 40) continue // a playlist of everything says nothing of who goes with whom
        for (let i = 0; i < who.length; i++) for (let j = i + 1; j < who.length; j++) bump(who[i], who[j], 2)
    }
    for (let i = 1; i < history.length; i++) {
        if (history[i].at - history[i - 1].at > SITTING) continue
        bump(artist(history[i - 1].name), artist(history[i].name), 1)
    }
    const records = new Map<string, Set<string>>()
    for (const name of songs) {
        const record = album_tag(meta[name]).trim()
        if (!record || record === 'Unknown album') continue
        const who = records.get(record) ?? new Set<string>()
        who.add(artist(name))
        records.set(record, who)
    }
    for (const who of records.values()) {
        const list = [...who].filter(known)
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) bump(list[i], list[j], 1)
    }

    const ranked = [...tracks.keys()].sort((a, b) => score.get(b)! - score.get(a)!)
    const neighbours = (seed: string) =>
        ranked
            .filter((other) => other !== seed && (near.get(pair(seed, other)) ?? 0) > 0)
            .sort((a, b) => near.get(pair(seed, b))! - near.get(pair(seed, a))! || score.get(b)! - score.get(a)!)
            .slice(0, 4)

    // an artist's tracks for one deal: the most loved ahead, shuffled among equals
    const dealt = (who: string, random: () => number) =>
        (tracks.get(who) ?? [])
            .map((name) => ({ name, key: weight(name) + random() * 2 }))
            .sort((a, b) => b.key - a.key)
            .map((t) => t.name)

    const mixes: Mix[] = []
    const used = new Set<string>()

    // two passes: first the seeds no earlier mix already carries, so the mixes
    // are of different corners of the library; then any left, if there is room
    for (const strict of [true, false]) {
        for (const seed of ranked) {
            if (mixes.length >= MAX_MIXES) break
            if (mixes.some((mix) => mix.seed === seed) || (strict && used.has(seed))) continue

            const random = rng(`${day}:${seed}`)
            const others = neighbours(seed)
            const own = dealt(seed, random)
            const runs = others.map((who) => dealt(who, random))

            // every other track the seed's, the ones between each neighbour's in turn
            const out: string[] = []
            for (let turn = 0; out.length < MAX_TRACKS; turn++) {
                const run = turn % 2 === 0 || !runs.length ? own : runs[(turn >> 1) % runs.length]
                const next = run.shift() ?? own.shift() ?? runs.find((r) => r.length)?.shift()
                if (!next) break
                out.push(next)
            }
            if (out.length < MIN_TRACKS) continue

            for (const who of others) used.add(who)
            used.add(seed)
            mixes.push({
                name: `${seed} Mix`,
                seed,
                with: others,
                tracks: out,
                faces: [tracks.get(seed)!, tracks.get(others[0] ?? seed)!, tracks.get(others[1] ?? others[0] ?? seed)!],
            })
        }
    }

    return mixes
})

export const mixes_now = () => {
    const { songs, meta, playlists } = library.get()
    return mixes_of(songs, meta, playlists, today())
}

export const useMixes = () => mixes_of(useStore(library, (s) => s.songs), useStore(library, (s) => s.meta), useStore(library, (s) => s.playlists), today())

export const mix_named = (mixes: Mix[], name: string | null) => mixes.find((mix) => mix.name === name)

// "with A, B and more": who a mix is made of besides its seed
export const mix_line = (mix: Mix) =>
    mix.with.length ? `${[mix.seed, ...mix.with.slice(0, 2)].join(', ')}${mix.with.length > 2 ? ' and more' : ''}` : mix.seed

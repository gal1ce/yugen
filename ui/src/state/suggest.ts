import { bridge, music_dir, type SimilarTrack } from '../lib/bridge'
import {
    LANES,
    NEARBY,
    NEARBY_PAGE,
    PER_SEED,
    SEEDS,
    SUGGESTION_PAGE,
    SUGGESTIONS,
    WIDER_SHARE,
    as_cover,
    as_similar,
    between,
    in_lanes,
    picture,
    sample,
    spread_artists,
    type Mood,
    type Suggestion,
} from '../lib/lastfm'
import { fold, library_mark } from '../lib/names'
import type { View } from '../lib/prefs'
import { create_store, memo_last } from '../lib/store'
import { listed_now } from './derive'
import { add_to_playlist, artist_of, fetch_songs, library, sync_liked, title_of } from './library'
import { fetch_source, owns } from './search'
import { ui } from './ui'

/*
 * Suggestions. The backend answers about one track at a time - that is the
 * shape of the last.fm call behind it - so a pass picks a sample of the tracks
 * already here and asks about each, a few at a time. What comes back are
 * tracks that are not here yet, which is why a click on one goes to a download
 * rather than to the player.
 */
export type SuggestState = {
    similar: Suggestion[]
    similar_busy: boolean
    cards_shown: number
    // the same shelf at the foot of a playlist or the liked songs, drawn from
    // that listing
    nearby: Suggestion[]
    nearby_busy: boolean
    nearby_shown: number
    // fetching, fetched, and nothing on youtube under that name - by key
    getting: string[]
    fetched: string[]
    missing: string[]
}

export const suggest = create_store<SuggestState>({
    similar: [],
    similar_busy: false,
    cards_shown: SUGGESTION_PAGE,
    nearby: [],
    nearby_busy: false,
    nearby_shown: NEARBY_PAGE,
    getting: [],
    fetched: [],
    missing: [],
})

// a pass left in the air must not land on top of the one that replaced it
let similar_run = 0
let nearby_run = 0
let asked_similar = false

// everything the shelf has offered this session. another pass reads it as a
// list of what not to come back with, which is what makes the button worth
// pressing twice
const served = new Set<string>()

/*
 * What every listing's shelf is holding, kept behind the one on screen. Walking
 * out of a playlist and back does not change what is in it, so it should not
 * cost another pass, and should not answer with the same names as if new.
 */
const nearby_cache = new Map<string, { tracks: Suggestion[]; shown: number; served: Set<string> }>()
let nearby_for = ''

function nearby_memory(key: string) {
    const held = nearby_cache.get(key)
    if (held) return held

    const fresh = { tracks: [] as Suggestion[], shown: NEARBY_PAGE, served: new Set<string>() }
    nearby_cache.set(key, fresh)

    return fresh
}

// a playlist and the liked songs are hand-picked, so they are the two listings
// where 'what else is like this' means anything
export const nearby_key_of = (view: View, selection: string | null) =>
    view === 'playlist' && selection ? `playlist:${selection}` : view === 'liked' ? 'liked' : ''

// what a suggestion is measured against: something already on disk is not one.
// the tags and the file name both count - a download names the file after the
// search result, which is where the tags may not have reached
const library_keys_of = memo_last((songs: string[], meta: Record<string, string[]>) => {
    // the tags are read through the store; they are here to say when to work it out again
    void meta

    const keys = new Set<string>()

    for (const name of songs) {
        keys.add(fold(artist_of(name) + title_of(name)))
        keys.add(fold(library_mark(name).title))
    }

    return keys
})

const library_keys = () => {
    const { songs, meta } = library.get()
    return library_keys_of(songs, meta)
}

/*
 * What a pass is drawn from, in two halves: 'marked' is everything the listener
 * has pointed at - liked, favourited, or put in a playlist - and 'rest' is the
 * remainder of the folder, which gets a say too, so two runs over the same
 * small pile of hearts do not come back with the same names.
 */
const seed_pools_of = memo_last(
    (songs: string[], liked: Set<string>, favorites: { file_path: string }[], playlists: Record<string, string[]>) => {
        const on_disk = new Set(songs)
        const marked = new Set(songs.filter((name) => liked.has(name)))

        for (const track of favorites) if (on_disk.has(track.file_path)) marked.add(track.file_path)
        for (const tracks of Object.values(playlists)) for (const name of tracks) if (on_disk.has(name)) marked.add(name)

        return { marked: [...marked], rest: songs.filter((name) => !marked.has(name)) }
    },
)

export const seed_pools = () => {
    const { songs, liked, favorites, playlists } = library.get()
    return seed_pools_of(songs, liked, favorites, playlists)
}

function pick_seeds() {
    const { marked, rest } = seed_pools()
    const wanted = between(SEEDS)
    const wide = Math.min(Math.round(wanted * WIDER_SHARE), rest.length)
    const close = sample(marked, wanted - wide)

    return [...close, ...sample(rest, wanted - close.length)]
}

/*
 * The shelf is filled rather than filtered. Last.fm hardly ever carries a
 * picture on the similar list itself, so nearly every suggestion costs a
 * second request before it can be shown, and one with no picture is not shown
 * at all. The candidates are walked closest first, a few at a time, and the
 * walk stops the moment the shelf is full.
 */
async function with_pictures(tracks: Suggestion[], wanted: number, alive: () => boolean) {
    const filled: Suggestion[] = []
    let next = 0

    await Promise.all(
        Array.from({ length: Math.min(LANES, tracks.length) }, async () => {
            while (filled.length < wanted && next < tracks.length && alive()) {
                const track = tracks[next++]
                const image =
                    track.image ||
                    picture(as_cover(await bridge().get_info(track.artist, track.title).catch(() => '')))

                if (image) filled.push({ ...track, image })
            }
        }),
    )

    // the lanes finish out of turn, so the order is put back afterwards
    return filled.sort((a, b) => b.match - a.match)
}

/*
 * One pass. The seeds go out one at a time, and what comes back is gathered
 * into one list, thinned to what is not on disk, held back from repeating what
 * the shelf has offered, spread so no one artist takes it over, and filled with
 * pictures until there are enough. 'skip' is cleared here rather than by the
 * caller: only this side knows whether holding those back would leave the
 * shelf half empty, and a repeat beats a gap.
 */
async function gather(seeds: string[], wanted: number, skip: Set<string>, alive: () => boolean) {
    const dir = await music_dir()

    const answers = await in_lanes(seeds, LANES, (name) =>
        bridge()
            .get_similar(dir + name, between(PER_SEED))
            .then(as_similar)
            // no api key, no network, a track last.fm never heard of: a seed
            // with nothing to say, and the pass carries on
            .catch(() => [] as SimilarTrack[]),
    )

    if (!alive()) return []

    const owned = library_keys()
    const seen = new Set<string>()
    const found: Suggestion[] = []

    for (const answer of answers) {
        for (const track of answer ?? []) {
            // parsed text rather than a typed answer: every field is whatever
            // last.fm happened to put there, including nothing
            const title = String(track?.name ?? '').trim()
            const artist = String(track?.artist ?? '').trim()
            if (!title) continue

            const key = fold(artist + title)
            if (seen.has(key) || owned.has(key)) continue

            seen.add(key)
            found.push({ key, title, artist, image: picture(String(track?.image ?? '')), match: Number(track?.match) || 0 })
        }
    }

    const unseen = found.filter((track) => !skip.has(track.key))
    const pool = unseen.length >= wanted ? unseen : found

    if (pool === found) skip.clear()

    const candidates = spread_artists(pool.sort((a, b) => b.match - a.match)).slice(0, wanted * 4)
    const shown = await with_pictures(candidates, wanted, alive)

    for (const track of shown) skip.add(track.key)

    return shown
}

// 'more' lands under what is on screen, and only names not on it already; the
// other two moods replace the shelf
const settle = (mood: Mood, shown: Suggestion[], current: Suggestion[]) => {
    if (mood !== 'more') return shown

    const here = new Set(current.map((track) => track.key))
    return [...current, ...shown.filter((track) => !here.has(track.key))]
}

/*
 * The library's shelf, in one of three moods: 'new' is it being filled for the
 * first time, 'again' is the pass button - new seeds, nothing it already
 * offered - and 'more' is another dig added under what is there.
 */
export async function load_similar(mood: Mood = 'new') {
    const { marked, rest } = seed_pools()
    if (!marked.length && !rest.length) return
    if (suggest.get().similar_busy) return

    const run = ++similar_run
    asked_similar = true

    if (mood === 'new') served.clear()

    suggest.set(mood === 'more' ? { similar_busy: true } : { similar_busy: true, cards_shown: SUGGESTION_PAGE })

    try {
        const shown = await gather(pick_seeds(), SUGGESTIONS, served, () => run === similar_run)
        if (run !== similar_run) return

        suggest.set(({ similar, cards_shown }) => ({
            similar: settle(mood, shown, similar),
            cards_shown: mood === 'more' ? cards_shown + SUGGESTION_PAGE : cards_shown,
        }))
    } finally {
        if (run === similar_run) suggest.set({ similar_busy: false })
    }
}

// the first pass waits until the library page is actually open: it is a round
// trip per seed, and a launch straight into a playlist should not pay for one
export function want_similar() {
    if (asked_similar) return

    const { marked, rest } = seed_pools()
    if (!marked.length && !rest.length) return

    void load_similar()
}

// more of what is already here first, and once that runs out, another dig
export function load_more_similar() {
    const { cards_shown, similar } = suggest.get()

    if (cards_shown < similar.length) return suggest.set({ cards_shown: cards_shown + SUGGESTION_PAGE })

    void load_similar('more')
}

export async function load_nearby(mood: Mood = 'new') {
    const { view, selection } = ui.get()
    const key = nearby_key_of(view, selection)
    const listed = listed_now()

    if (!key || !listed.length || suggest.get().nearby_busy) return

    const run = ++nearby_run
    const memory = nearby_memory(key)

    if (mood === 'new') memory.served.clear()

    if (mood !== 'more') memory.shown = NEARBY_PAGE
    suggest.set({ nearby_busy: true, nearby_shown: memory.shown })

    try {
        const shown = await gather(
            sample(listed, between(SEEDS)),
            NEARBY,
            memory.served,
            () => run === nearby_run && nearby_for === key,
        )
        if (run !== nearby_run) return

        memory.tracks = settle(mood, shown, memory.tracks)
        if (mood === 'more') memory.shown += NEARBY_PAGE

        if (nearby_for === key) suggest.set({ nearby: memory.tracks, nearby_shown: memory.shown })
    } finally {
        if (run === nearby_run) suggest.set({ nearby_busy: false })
    }
}

export function load_more_nearby() {
    const { view, selection } = ui.get()
    const { nearby_shown, nearby } = suggest.get()

    if (nearby_shown < nearby.length) {
        const memory = nearby_memory(nearby_key_of(view, selection))

        memory.shown = nearby_shown + NEARBY_PAGE
        return suggest.set({ nearby_shown: memory.shown })
    }

    void load_nearby('more')
}

/*
 * Which shelf is on screen. Walking into a listing that already has one puts it
 * back rather than asking for another. Only a listing with no shelf yet costs a
 * pass, and an empty one costs nothing: it is left unclaimed so the first track
 * added to it still gets a shelf.
 */
export function show_nearby(key: string, has_tracks: boolean) {
    if (!key || nearby_for === key) return

    const held = nearby_cache.get(key)

    if (held) {
        nearby_for = key
        return suggest.set({ nearby: held.tracks, nearby_shown: held.shown })
    }

    suggest.set({ nearby: [], nearby_shown: NEARBY_PAGE })

    if (!has_tracks) return

    nearby_for = key
    void load_nearby()
}

export const suggestion_name = (track: Suggestion) => [track.artist, track.title].filter(Boolean).join(' - ')

export function suggestion_state(track: Suggestion, s: SuggestState, owned: Set<string>) {
    const busy = s.getting.includes(track.key)
    const here = owned.has(track.key) || s.fetched.includes(track.key)
    const gone = s.missing.includes(track.key)

    return {
        busy,
        here,
        gone,
        held: busy || here,
        note: here ? 'In your library' : busy ? 'Downloading…' : gone ? 'Nothing found' : track.artist || 'Unknown artist',
    }
}

export const library_keys_now = library_keys

/*
 * A suggestion carries no id to fetch by, only a name, so the name goes out
 * through the same youtube search the box uses and the first answer is what is
 * downloaded. Where it was asked for is where it belongs: one taken from the
 * foot of a playlist joins that playlist, one taken from the liked songs is
 * liked - read before the download, since the page can move on meanwhile.
 */
export async function download_suggestion(track: Suggestion) {
    const { getting, fetched } = suggest.get()
    if (getting.includes(track.key) || library_keys().has(track.key) || fetched.includes(track.key)) return

    const { view, selection } = ui.get()
    const home = nearby_key_of(view, selection)

    suggest.set(({ getting, missing }) => ({
        getting: [...getting, track.key],
        missing: missing.filter((key) => key !== track.key),
    }))

    try {
        const found = await fetch_source('yt', suggestion_name(track))
        const best = found.find((result) => !owns(result)) ?? found[0]

        // last.fm knows tracks youtube does not always carry, and a name that
        // turns up nothing is an answer rather than an error
        if (!best) return suggest.set(({ missing }) => ({ missing: [...missing, track.key] }))

        await bridge().download_yt(best.ref, await music_dir())

        suggest.set(({ fetched }) => ({ fetched: [...fetched, track.key] }))

        // the file is named after the search result, id and all, so the id is
        // what says which of these is the one that landed
        const { names } = await fetch_songs()
        const landed = names.find((name) => library_mark(name).id === best.ref)

        if (landed && home.startsWith('playlist:')) await add_to_playlist(home.slice('playlist:'.length), landed)
        else if (landed && home === 'liked') await bridge().like_song(landed)

        await sync_liked()
    } catch {
        suggest.set(({ missing }) => ({ missing: [...missing, track.key] }))
    } finally {
        suggest.set(({ getting }) => ({ getting: getting.filter((key) => key !== track.key) }))
    }
}

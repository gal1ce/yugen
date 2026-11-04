import { bridge, music_dir } from '../lib/bridge'
import { library_mark } from '../lib/names'
import { run_search, SOURCES, type SearchResult, type Source } from '../lib/search'
import { memo_last } from '../lib/store'
import { fetch_songs, library, sync_liked } from './library'
import { ui } from './ui'

export const PAGE = 10

/*
 * A search shells out to yt-dlp, and the two sources are tabs over the same
 * query - flipping between them should not pay for it twice. The request is
 * held alongside its answer, so a tab left and returned to before it lands
 * waits on the one already running instead of starting another.
 */
const searches = new Map<string, { pending: Promise<SearchResult[]>; found?: SearchResult[] }>()

// switching tabs mid-flight leaves an answer in the air, and it must not land
// on top of the newer one
let search_run = 0

export function fetch_source(on: Source, wanted: string) {
    const key = `${on}\n${wanted}`
    const entry = searches.get(key)

    if (entry?.found) return Promise.resolve(entry.found)

    const pending = entry?.pending ?? run_search(on, wanted)
    if (!entry) searches.set(key, { pending })

    return pending.then((found) => {
        if (found.length) searches.set(key, { pending, found })
        // an empty answer is not worth remembering: the empty state invites
        // another enter, and that has to be able to go out again
        else searches.delete(key)

        return found
    })
}

/*
 * One enter, and the answer lands under its source's tab the moment that
 * source has it. With search_mode 'parallel' both sources go out at once, so
 * the tab not on screen is usually ready by the time it is opened; with
 * 'tabs' only the source on screen is asked, and the other when its tab is.
 */
async function ask(on: Source, wanted: string, run: number) {
    ui.set((s) => ({ busy: s.busy.includes(on) ? s.busy : [...s.busy, on] }))

    const found = await fetch_source(on, wanted)
    if (run !== search_run) return

    ui.set((s) => ({ found: { ...s.found, [on]: found }, busy: s.busy.filter((b) => b !== on) }))
}

// which query the tabs are holding answers for
let asked_for = ''

export async function search(on: Source = ui.get().source) {
    const wanted = ui.get().query.trim()
    if (!wanted) return

    const run = ++search_run
    asked_for = wanted

    ui.set({ search_open: true, found: { yt: [], sc: [] }, busy: [], shown: PAGE })

    const sources = ui.get().search_mode === 'parallel' ? SOURCES.map((s) => s.id) : [on]
    await Promise.all(sources.map((id) => ask(id, wanted, run)))
}

export function switch_source(next: Source) {
    ui.set({ source: next, shown: PAGE })

    // one at a time: the tab opened is asked now, unless it already answered
    const { query, found, busy } = ui.get()
    if (asked_for && query.trim() === asked_for && !found[next].length && !busy.includes(next)) void ask(next, asked_for, search_run)
}

export function clear_search() {
    search_run++
    asked_for = ''
    ui.set({ query: '', shown: PAGE, found: { yt: [], sc: [] }, busy: [] })
}

// soundcloud sends an artwork url, youtube's is built from the video id
export const artwork = (result: SearchResult, source: Source) =>
    source === 'yt' ? `https://img.youtube.com/vi/${result.ref}/mqdefault.jpg` : result.thumbnail

/*
 * A result is in the library when a file there carries its id - downloads are
 * named `<title> [<id>].mp3` - and only then. Going by the title as well made
 * every track that shared a name with one already here look downloaded and
 * refuse the click: three soundcloud uploads called LEGACY, one of them here.
 */
const owned_ids_of = memo_last((songs: string[]) => new Set(songs.map((name) => library_mark(name).id).filter(Boolean)))

export function owns(result: SearchResult) {
    return !!result.id && owned_ids_of(library.get().songs).has(result.id)
}


// every binding runs on a thread of its own, so downloads do not take turns:
// only the row being fetched is held, the rest of the list stays live
export async function download(result: SearchResult, source: Source = ui.get().source) {
    const { downloading } = ui.get()
    if (downloading.includes(result.ref) || owns(result)) return

    ui.set({ downloading: [...downloading, result.ref] })

    try {
        const dir = await music_dir()

        if (source === 'yt') await bridge().download_yt(result.ref, dir)
        else await bridge().download_sc(result.ref, dir)
    } finally {
        // a failed fetch lets go of the row too, or it never comes back
        ui.set(({ downloading }) => ({ downloading: downloading.filter((ref) => ref !== result.ref) }))
    }

    await fetch_songs()
    await sync_liked()
}

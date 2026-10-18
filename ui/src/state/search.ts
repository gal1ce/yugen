import { bridge, music_dir } from '../lib/bridge'
import { fold, library_mark } from '../lib/names'
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

export async function search(on: Source = ui.get().source) {
    const wanted = ui.get().query.trim()
    if (!wanted) return

    ui.set({ search_open: true })

    const run = ++search_run

    // both sources go out on the same enter: the tab not on screen costs one
    // more yt-dlp process now, and switching to it is instant later
    for (const other of SOURCES) {
        if (other.id !== on) void fetch_source(other.id, wanted)
    }

    const already = searches.get(`${on}\n${wanted}`)?.found
    if (already) return ui.set({ results: already, shown: PAGE, searching: false })

    ui.set({ results: [], shown: PAGE, searching: true })

    const found = await fetch_source(on, wanted)
    if (run !== search_run) return

    ui.set({ results: found, shown: PAGE, searching: false })
}

export function switch_source(next: Source) {
    ui.set({ source: next })

    if (ui.get().query.trim()) void search(next)
    else ui.set({ results: [], shown: PAGE })
}

export function clear_search() {
    search_run++
    ui.set({ query: '', results: [], shown: PAGE, searching: false })
}

// youtube hands back the id the file is named with, so that match is exact.
// soundcloud hands back a page url, which leaves the title to go on
const owned_of = memo_last((songs: string[]) => {
    const ids = new Set<string>()
    const titles = new Set<string>()

    for (const name of songs) {
        const { title, id } = library_mark(name)

        if (id) ids.add(id)
        titles.add(fold(title))
    }

    return { ids, titles }
})

export function owns(result: SearchResult) {
    const owned = owned_of(library.get().songs)
    return owned.ids.has(result.ref) || owned.titles.has(fold(result.title))
}

// soundcloud sends an artwork url, youtube's is built from the video id
export const artwork = (result: SearchResult, source: Source) =>
    source === 'yt' ? `https://img.youtube.com/vi/${result.ref}/mqdefault.jpg` : result.thumbnail

// every binding runs on a thread of its own, so downloads do not take turns:
// only the row being fetched is held, the rest of the list stays live
export async function download(result: SearchResult) {
    const { downloading, source } = ui.get()
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

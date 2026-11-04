import { bridge } from './bridge'

export type Source = 'yt' | 'sc'

export type SearchResult = {
    title: string
    // a video id on youtube, the track's page url on soundcloud
    ref: string
    // what a download is named after (`<title> [<id>].mp3`): the video id on
    // youtube, the numeric track id on soundcloud
    id: string
    thumbnail?: string
}

// one search shells out to yt-dlp once and asks for a whole batch - the backend
// has its own floor under this - because a second search costs another subprocess
// while slicing a list that is already here costs nothing
export const BATCH = 50
// but the whole batch is not put on screen: every row holds a remote thumbnail,
// and fifty of those live at once is what the dropdown pays for in memory
export const PAGE = 10

export const SOURCES: { id: Source; label: string }[] = [
    { id: 'yt', label: 'YouTube' },
    { id: 'sc', label: 'SoundCloud' },
]

// what the source prints per result, and the shape of its second field: an
// 11-character video id on youtube, the track's page url on soundcloud (which
// then prints its thumbnail and its numeric id)
export const SHAPE: Record<Source, { fields: number; ref: RegExp }> = {
    yt: { fields: 2, ref: /^[\w-]{11}$/ },
    sc: { fields: 4, ref: /^https?:\/\/(www\.)?soundcloud\.com\/.+/ },
}

// soundcloud names an artwork's size in its file name, and the flat search
// hands back a thumbnail-sized one (100 px and under) that turns to blocks in
// a row; the 300 px cut of the same picture is one name away
export const larger = (url?: string) => url?.replace(/-(mini|tiny|small|badge|large|crop|t\d+x\d+)(\.(?:jpe?g|png|webp))/i, '-t300x300$2')

// yt-dlp prints NA for anything the flat listing does not carry
export const printed = (value?: string) => (value && value !== 'NA' ? value : undefined)

// both searches print one flat list, a fixed number of lines per result
export async function run_search(on: Source, query: string): Promise<SearchResult[]> {
    try {
        const flat =
            on === 'yt'
                ? await bridge().search_yt(query, BATCH)
                : await bridge().search_sc(query, BATCH)

        const { fields, ref } = SHAPE[on]

        return Array.from({ length: Math.floor(flat.length / fields) }, (_, i) => ({
            title: flat[i * fields],
            ref: flat[i * fields + 1],
            // only soundcloud prints a third field; on youtube the next one
            // along is already the next result's title
            thumbnail: fields > 2 ? larger(printed(flat[i * fields + 2])) : undefined,
            id: fields > 3 ? (printed(flat[i * fields + 3]) ?? '') : flat[i * fields + 1],
        }))
            // a flat search also turns up channels and playlists, which are not tracks
            .filter((result) => ref.test(result.ref))
    } catch {
        // yt-dlp is a subprocess and can simply fail; an empty answer is not
        // remembered, so the next enter goes back out
        return []
    }
}

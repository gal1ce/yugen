import { bridge } from './bridge'

export type Source = 'yt' | 'sc'

export type SearchResult = {
    title: string
    // a video id on youtube, the track's page url on soundcloud
    ref: string
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
// 11-character video id on youtube, the track's page url on soundcloud
export const SHAPE: Record<Source, { fields: number; ref: RegExp }> = {
    yt: { fields: 2, ref: /^[\w-]{11}$/ },
    sc: { fields: 3, ref: /^https?:\/\/(www\.)?soundcloud\.com\/.+/ },
}

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
            thumbnail: printed(flat[i * fields + 2]),
        }))
            // a flat search also turns up channels and playlists, which are not tracks
            .filter((result) => ref.test(result.ref))
    } catch {
        // yt-dlp is a subprocess and can simply fail; an empty answer is not
        // remembered, so the next enter goes back out
        return []
    }
}

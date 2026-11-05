import { metadata } from './library'
import { load, update } from './store'

/*
 * MusicManager::get_similar and get_info from services.cpp: the same two
 * last.fm calls, answered the same way - the similar list rebuilt down to
 * four fields, a track page passed on whole and kept in info.json.
 *
 * The key is the desktop's own (LASTFM_API_KEY, or ~/.config/yugen/lastfm_key):
 * a build reads it into EXPO_PUBLIC_LASTFM_API_KEY (.env.local, never
 * committed), and without one both answer empty, as the desktop does.
 */

const KEY = process.env.EXPO_PUBLIC_LASTFM_API_KEY ?? ''
const API = 'https://ws.audioscrobbler.com/2.0/'
const INFO = 'info.json'
// the one grey star last.fm answers with for everything it has no picture of
const PLACEHOLDER = '2a96cbd8b46e442fc41c2b86b821562f'

export const has_key = () => !!KEY

async function ask(params: Record<string, string>) {
    const query = new URLSearchParams({ ...params, api_key: KEY, format: 'json' })
    try {
        const response = await fetch(`${API}?${query}`)
        return response.ok ? await response.json() : null
    } catch {
        return null
    }
}

export async function similar(path: string, limit: number) {
    if (!KEY || !path) return ''

    const [title = '', artist = ''] = await metadata(path)
    if (!title && !artist) return ''

    const data = await ask({ method: 'track.getsimilar', artist, track: title, autocorrect: '1', limit: String(limit || 10) })
    const tracks = data?.similartracks?.track
    if (!Array.isArray(tracks)) return ''

    const out = []
    for (const t of tracks) {
        const name = typeof t?.name === 'string' ? t.name : ''
        if (!name) continue

        let image = Array.isArray(t.image) ? (t.image.find((i: { size?: string }) => i?.size === 'extralarge')?.['#text'] ?? '') : ''
        if (image.includes(PLACEHOLDER)) image = ''

        const match = typeof t.match === 'number' ? t.match : parseFloat(t.match) || 0
        out.push({ name, artist: t.artist?.name ?? '', image, match })
    }

    return JSON.stringify(out)
}

// kept answers - an empty one too, which is an answer and not asked again
export async function info(artist: string, track: string) {
    const key = `${artist} - ${track}`
    const cached = (await load<Record<string, string>>(INFO, {}))[key]
    if (cached !== undefined) return cached
    if (!KEY) return ''

    const data = await ask({ method: 'track.getInfo', artist, track })
    // a request that never got an answer is not kept: next time may reach it
    if (data === null) return ''

    const text = data && typeof data === 'object' && Object.keys(data).length ? JSON.stringify(data) : ''
    await update<Record<string, string>>(INFO, {}, (all) => void (all[key] = text))
    return text
}

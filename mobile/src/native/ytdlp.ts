import YtDlp from '../../modules/yt-dlp'

/*
 * Core::search_youtube, search_sound_cloud and the downloads, over the same
 * yt-dlp arguments, so the interface reads the same lines back.
 */

// enough for the interface to page through without asking again
const MIN_COUNT = 50

// two lines a hit: title, id
export async function search_youtube(query: string, count: number) {
    const target = `ytsearch${Math.max(count, MIN_COUNT)}:${query}`
    return YtDlp.lines([target, '--flat-playlist', '--no-warnings', '--skip-download', '--print', 'title', '--print', 'id']).catch(() => [])
}

// four lines a hit: title, page url, thumbnail url, track id
export async function search_soundcloud(query: string, count: number) {
    const target = `scsearch${Math.max(count, MIN_COUNT)}:${query}`
    return YtDlp.lines([
        target,
        '--flat-playlist',
        '--no-warnings',
        '--skip-download',
        '--print',
        'title',
        '--print',
        'webpage_url',
        '--print',
        '%(thumbnails.0.url)s',
        '--print',
        'id',
    ]).catch(() => [])
}

// "done", or "" when it failed - what download_with_ytdlp answers
export async function download(url: string) {
    try {
        const made = await YtDlp.download(url)
        return made.length ? 'done' : ''
    } catch (e) {
        console.warn('yt-dlp could not download', url, e)
        return ''
    }
}

// once a launch, in the background: a newer yt-dlp if there is one
let updating: Promise<unknown> | null = null

export function keep_current() {
    updating ??= YtDlp.update().catch((e) => console.warn('yt-dlp could not update', e))
    return updating
}

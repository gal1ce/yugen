export type Line = { at: number; text: string }

// lrclib answers with an lrc body when it has one and flat text when it does not,
// and get_lyrics hands whichever it got straight through
export const STAMP = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g

export function parse_lyrics(raw: string): Line[] | null {
    const lines: Line[] = []

    for (const row of raw.split(/\r?\n/)) {
        const stamps = [...row.matchAll(STAMP)]
        if (!stamps.length) continue

        const text = row.replace(STAMP, '').trim()

        for (const [, m, sec, frac] of stamps) {
            // the fraction is centiseconds at two digits and milliseconds at three
            const rest = frac ? Number(frac) / 10 ** frac.length : 0

            lines.push({ at: Number(m) * 60 + Number(sec) + rest, text })
        }
    }

    // an lrc file can carry its own metadata tags and nothing else, which is not
    // a timed lyric sheet
    if (lines.length < 2) return null

    return lines.sort((a, b) => a.at - b.at)
}

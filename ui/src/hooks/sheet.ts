import { useMemo } from 'react'
import { parse_lyrics } from '../lib/lyrics'
import { useStore } from '../lib/store'
import { player } from '../state/player'

/*
 * The sheet for whatever is playing. A timed one follows along: the line in
 * force is worked out off the clock, and the panel only renders when that line
 * changes - a few times a minute, not once a frame.
 */
export function useSheet() {
    const current = useStore(player, (s) => s.current)
    const sheet_for = useStore(player, (s) => s.sheet_for)

    // a sheet is this track's only while it names this track
    const sheet = sheet_for?.song === current ? sheet_for.text : undefined
    const timed = useMemo(() => (sheet ? parse_lyrics(sheet) : null), [sheet])

    return { current, sheet, timed, waiting: !!current && sheet === undefined }
}


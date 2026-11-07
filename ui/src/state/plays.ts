import { position } from '../lib/clock'
import { create_store, memo_last, useStore } from '../lib/store'
import { library } from './library'
import { player } from './player'

/*
 * What has been listened to, counted the way the services count it: a play
 * is half a minute of the track actually sounding (Spotify's and last.fm's
 * stream), or half of a track shorter than a minute. A skip past the
 * opening is not a play, a pause stops the count, and a track that starts
 * over - repeat, or taken back to its start - can be played again. Kept on
 * this machine with the rest of its history: a count per track, and the
 * plays in order, which is what the mixes read as "played together".
 */

export type Count = { n: number; last: number }
export type Played = { name: string; at: number }

type PlaysState = { counts: Record<string, Count>; history: Played[] }

const KEY = 'yugen.plays'
const HISTORY_MAX = 600
const ENOUGH = 30

function stored(): PlaysState {
    try {
        const value = JSON.parse(localStorage.getItem(KEY) ?? '{}')
        const counts = value && typeof value.counts === 'object' && value.counts ? value.counts : {}
        const history = Array.isArray(value?.history) ? value.history.filter((p: Played) => typeof p?.name === 'string' && typeof p.at === 'number') : []
        return { counts, history }
    } catch {
        return { counts: {}, history: [] }
    }
}

export const plays = create_store<PlaysState>(stored())

function count(name: string) {
    const at = Date.now()
    plays.set(({ counts, history }) => ({
        counts: { ...counts, [name]: { n: (counts[name]?.n ?? 0) + 1, last: at } },
        history: [...history, { name, at }].slice(-HISTORY_MAX),
    }))
    try {
        localStorage.setItem(KEY, JSON.stringify(plays.get()))
    } catch {
        // storage unavailable: the counts last the session
    }
}

/*
 * The count itself. It runs on the wall clock while the player says a track
 * is sounding, not on the track's position, so a seek forward is not heard
 * time; and it is settled whenever the player changes and every few seconds
 * between, so a phone's page held in the background loses nothing - the
 * next look adds up all the time that went by.
 */
export function start_plays() {
    let track: string | null = null
    let heard = 0
    let counted = false
    let since = 0
    let last_heard_at = 0

    const settle = () => {
        const now = performance.now()
        if (since) heard += (now - since) / 1000
        since = since ? now : 0
        const { length } = player.get()
        const need = length > 0 ? Math.min(ENOUGH, length / 2) : ENOUGH
        if (track && !counted && heard >= need) {
            counted = true
            count(track)
        }
    }

    const follow = () => {
        const { current, paused } = player.get()
        settle()
        if (current !== track) {
            track = current
            heard = 0
            counted = false
        }
        since = current && !paused ? performance.now() : 0
    }

    // the same track from its start again is another play
    const restart = (seconds: number) => {
        if (counted && seconds < 3 && last_heard_at > ENOUGH) {
            heard = 0
            counted = false
        }
        last_heard_at = seconds
    }

    follow()
    const stop = player.subscribe(follow)
    const timer = window.setInterval(() => {
        settle()
        restart(position())
    }, 5000)

    return () => {
        stop()
        clearInterval(timer)
    }
}

// the most played, on disk, the most first and the latest of equals first
export const most_played_of = memo_last((counts: Record<string, Count>, songs: string[]) =>
    songs
        .filter((name) => counts[name]?.n)
        .sort((a, b) => counts[b].n - counts[a].n || counts[b].last - counts[a].last)
        .slice(0, 50),
)

export const most_played = () => most_played_of(plays.get().counts, library.get().songs)
export const useMostPlayed = () => most_played_of(useStore(plays, (s) => s.counts), useStore(library, (s) => s.songs))

// when anything among these was last played: what a library sorted by "recently played" reads
export const last_played = (tracks: string[], counts: Record<string, Count>) => tracks.reduce((most, name) => Math.max(most, counts[name]?.last ?? 0), 0)

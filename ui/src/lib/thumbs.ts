import { useEffect, useReducer } from 'react'

/*
 * Covers come over as the whole picture off the file's tags - 1280x720 PNGs
 * of half a megabyte each, for a square that is drawn at forty pixels. Handed
 * to <img> as a data url, every one of them is decoded at full size, and the
 * url itself is a megabyte of string rebuilt and compared on every render.
 *
 * So each picture is shrunk, to a jpeg whose short side fits where it is
 * drawn (THUMB_EDGES: a list row, a card, the big ones), and every cover on
 * screen is drawn from that through an object url. They are keyed by the
 * base64 itself: the stores hold one string per track and hand the same one
 * back every time, so the lookup is a pointer compare.
 *
 * A size not made yet borrows whichever other one is: the picture is there at
 * once, a little soft or a little heavy, and is swapped for the right one when
 * that lands. The smaller ones are cut from a bigger one when there is one,
 * which is a fraction of the work of going back to the tags.
 */
import { workers_draw } from './engine'
import { shrink_to_blob, THUMB_EDGES, type ThumbSize } from './shrink'

const THUMB_LANES = 3

const SIZES = Object.keys(THUMB_EDGES) as ThumbSize[]

const thumbs = { sm: new Map<string, string>(), md: new Map<string, string>(), lg: new Map<string, string>() }
const jobs = { sm: new Map<string, Promise<string>>(), md: new Map<string, Promise<string>>(), lg: new Map<string, Promise<string>>() }
const waiting: (() => void)[] = []
// work nobody is looking at yet: only taken up when `waiting` is empty
const later: (() => void)[] = []
// which of those are waiting there, so one that is asked for can be pulled out
const parked_runs = { sm: new Map<string, () => void>(), md: new Map<string, () => void>(), lg: new Map<string, () => void>() }
let running = 0

// the worker the shrinking happens in. made on the first cover, and given up
// on for good if it cannot be started - the page does the work itself then
// never started on webkitgtk, where a canvas in a worker takes the page down
let worker: Worker | null | undefined = workers_draw ? undefined : null
const replies = new Map<number, (blob: Blob | null) => void>()
let next_id = 0

function shrinker() {
    if (worker !== undefined) return worker

    try {
        worker = typeof OffscreenCanvas !== 'undefined' ? new Worker(new URL('./thumbs.worker.ts', import.meta.url), { type: 'module' }) : null

        worker?.addEventListener('message', (event: MessageEvent<{ id: number; blob: Blob | null }>) => {
            replies.get(event.data.id)?.(event.data.blob)
            replies.delete(event.data.id)
        })

        // a worker that will not load: everything it was asked comes back to
        // be done on the page
        worker?.addEventListener('error', () => {
            worker = null
            for (const reply of replies.values()) reply(null)
            replies.clear()
        })
    } catch {
        worker = null
    }

    return worker
}

async function shrink(data: string, size: ThumbSize): Promise<string> {
    const edge = THUMB_EDGES[size]
    // a bigger cut of the same picture, if there is one, is a cheaper start
    const from = SIZES.filter((other) => THUMB_EDGES[other] > edge)
        .map((other) => thumbs[other].get(data))
        .find(Boolean) ?? data
    const off_thread = shrinker()

    if (off_thread) {
        const id = next_id++
        const blob = await new Promise<Blob | null>((resolve) => {
            replies.set(id, resolve)
            off_thread.postMessage({ id, data: from, edge })
        })

        if (blob) return URL.createObjectURL(blob)
    }

    return URL.createObjectURL(await shrink_to_blob(from, edge))
}

// a couple at a time, so a library arriving all at once does not hold the
// thread for every cover in it before the first one is on screen
export function thumb_of(data: string, size: ThumbSize = 'lg', { background = false } = {}) {
    const job = jobs[size].get(data)

    if (job) {
        // asked for in earnest while it sits at the back: it moves up front
        const parked = parked_runs[size].get(data)
        if (parked && !background) {
            parked_runs[size].delete(data)
            later.splice(later.indexOf(parked), 1)
            start(parked)
        }

        return job
    }

    const next = new Promise<string>((resolve) => {
        const run = () => {
            parked_runs[size].delete(data)
            running++

            void shrink(data, size).then((url) => {
                thumbs[size].set(data, url)
                resolve(url)

                running--
                ;(waiting.shift() ?? later.shift())?.()
            })
        }

        if (background && (running >= THUMB_LANES || waiting.length)) {
            parked_runs[size].set(data, run)
            later.push(run)
        } else start(run)
    })

    jobs[size].set(data, next)

    return next
}

function start(run: () => void) {
    if (running < THUMB_LANES && !waiting.length) run()
    else waiting.push(run)
}

/*
 * Every cover in the library, cut ahead for the lists and cards, behind
 * anything on screen. Without it a page's covers are shrunk the first time
 * that page opens - off the thread, so nothing stalls, but each one lands a
 * moment after the page does and the grid fills itself in square by square.
 * The card size goes first: the row size is cut from it.
 */
export function warm_thumbs(covers: string[]) {
    for (const data of covers) if (data) void thumb_of(data, 'md', { background: true })
    for (const data of covers) if (data) void thumb_of(data, 'sm', { background: true })
}

// the size asked for if it is made, else the nearest bigger one, else any
export function thumb_ready(data?: string, size: ThumbSize = 'lg') {
    if (!data) return undefined

    const order = [size, ...SIZES.filter((other) => THUMB_EDGES[other] > THUMB_EDGES[size]), ...SIZES.filter((other) => THUMB_EDGES[other] < THUMB_EDGES[size]).reverse()]

    for (const other of order) {
        const url = thumbs[other].get(data)
        if (url) return url
    }
}

export function useThumb(data?: string, size: ThumbSize = 'lg') {
    const [, landed] = useReducer((count: number) => count + 1, 0)

    useEffect(() => {
        if (!data || thumbs[size].has(data)) return

        let live = true
        void thumb_of(data, size).then(() => live && landed())

        return () => {
            live = false
        }
    }, [data, size])

    return thumb_ready(data, size)
}

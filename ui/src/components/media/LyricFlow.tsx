import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useClock } from '../../lib/clock'
import { cn } from '../../lib/cn'
import { next_frame, cancel_frame } from '../../lib/frames'
import type { Line } from '../../lib/lyrics'
import { seek_to } from '../../state/player'

/*
 * Timed lyrics that move like a sheet of paper on water.
 *
 * Every line is placed on its own, absolutely, and hangs on a spring of its
 * own. When the song moves on a line, each line is given its new place - the
 * line being sung at a fixed height in the box, everything else stacked above
 * and below it - but they do not all set off together: the line being sung
 * and those already gone go at once, and each line after it waits a little
 * longer than the one before. The column ripples into place from the top
 * down rather than sliding as one block, which is what makes the motion read
 * as fluid rather than mechanical. This is the technique the Apple Music-like
 * lyric players use (AMLL among them); it is written here rather than pulled
 * in, since AMLL is AGPL and this app is MIT.
 *
 * The springs are slightly under-damped, so a line arrives with a trace of
 * weight and settles. Only the vertical place is driven from here, written
 * straight into each line's transform; how sung, near and far lines look -
 * their light, their size, their blur - is css on a data attribute, so a line
 * turning over costs a class change and the compositor does the rest.
 *
 * The wheel takes the column away from the song for a moment, to read ahead
 * or back; a few seconds after the last notch it springs back to the line in
 * force. A click on any line goes there.
 *
 * Nothing runs while nothing moves.
 */
const STAGGER = 0.05
const MAX_STAGGER = 0.45
const OMEGA = 10
const ZETA = 0.82
// seconds after the last notch before the column goes back to the song
const RELEASE = 2.6
// where the line being sung sits, as a share of the box's height
const ANCHOR = 0.36
const GAP = 0.45

type Spring = { y: number; v: number; to: number; at: number; from: number }

/*
 * The column's motion, kept apart from react: the springs, where each line
 * belongs, and the frames that move them. The component hands it the box, the
 * lines' nodes and which line is sung, and it does the rest.
 */
function make_flow() {
    const flow = {
        box: null as HTMLDivElement | null,
        nodes: [] as (HTMLButtonElement | null)[],
        springs: [] as Spring[],
        tops: [] as number[],
        count: 0,
        live: -1,
        offset: 0,
        until: 0,
        frame: 0,
        last: 0,

        // the stack: each line's top as if they were laid one under the next
        measure() {
            let top = 0
            const em = parseFloat(getComputedStyle(flow.box ?? document.body).fontSize) || 16

            flow.tops = flow.nodes.slice(0, flow.count).map((node) => {
                const at = top
                top += (node?.offsetHeight ?? 0) + em * GAP
                return at
            })
        },

        // every line's place, given which one is sung and how far the wheel has
        // taken the column; `stagger` is false for a resize, which should not
        // ripple, and `entering` brings a new sheet up from below line by line
        place(stagger: boolean, entering = false) {
            const height = flow.box?.clientHeight ?? 0
            const at = flow.live
            const anchor_top = flow.tops[Math.max(at, 0)] ?? 0
            const now = performance.now() / 1000

            flow.springs = Array.from({ length: flow.count }, (_, i) => {
                const held = flow.springs[i] ?? { y: 0, v: 0, to: 0, at: 0, from: 0 }
                const to = height * ANCHOR + (flow.tops[i] ?? 0) - anchor_top - flow.offset
                const wait = stagger && i > at ? Math.min((i - Math.max(at, 0)) * STAGGER, MAX_STAGGER) : 0

                if (entering) return { y: to + 90, v: 0, to, at: now + Math.min(i * 0.035, 0.6), from: to + 90 }
                if (held.to === to) return held

                return { ...held, to, at: now + wait, from: held.y }
            })

            if (!flow.frame) flow.frame = next_frame(flow.tick)
        },

        // the wheel takes the column away from the song, no further than the
        // first line or the last, until a moment after the last notch
        wheel(delta: number) {
            const last = flow.tops[flow.tops.length - 1] ?? 0
            const anchor_top = flow.tops[Math.max(flow.live, 0)] ?? 0

            flow.offset = Math.min(Math.max(flow.offset + delta, -anchor_top), last - anchor_top)
            flow.until = performance.now() / 1000 + RELEASE
            flow.place(false)
        },

        tick() {
            flow.frame = 0

            const now = performance.now() / 1000
            // the first frame of a run is one frame long, never the gap since the last run
            const dt = flow.last ? Math.min(now - flow.last, 0.05) : 1 / 60
            flow.last = now

            let moving = false

            // the wheel lets go: the column goes back to the song
            if (flow.offset && now > flow.until) {
                flow.offset = 0
                flow.place(false)
            }

            flow.springs.forEach((s, i) => {
                // waiting its turn: held where it was
                if (now < s.at) {
                    moving = true
                    return
                }

                let left = dt
                while (left > 0) {
                    const h = Math.min(left, 1 / 240)
                    left -= h
                    s.v += (OMEGA * OMEGA * (s.to - s.y) - 2 * ZETA * OMEGA * s.v) * h
                    s.y += s.v * h
                }

                if (Math.abs(s.to - s.y) < 0.3 && Math.abs(s.v) < 4) {
                    s.y = s.to
                    s.v = 0
                } else moving = true

                // the translate property, not transform: css applies it outside the
                // scale a line is drawn at, so a smaller line is not also moved up
                const node = flow.nodes[i]
                if (node) node.style.translate = `0 ${s.y.toFixed(2)}px`
            })

            if (moving || flow.offset) flow.frame = next_frame(flow.tick)
            else flow.last = 0
        },

        stop() {
            cancel_frame(flow.frame)
            flow.frame = 0
        },
    }

    return flow
}

export function LyricFlow({ lines, className, size, soft }: { lines: Line[]; className?: string; size: string; soft: boolean }) {
    const engine = useRef<ReturnType<typeof make_flow> | null>(null)
    if (engine.current === null) engine.current = make_flow()
    const [active, set_active] = useState(-1)
    const inked = useRef(-1)

    // the line in force, and how far through it the voice is (the ink)
    useClock((seconds) => {
        let index = -1
        while (index + 1 < lines.length && lines[index + 1].at <= seconds + 0.2) index++

        if (index !== engine.current!.live) {
            engine.current!.live = index
            inked.current = -1
            set_active(index)
        }

        const node = index >= 0 ? engine.current!.nodes[index] : null
        if (!node) return

        const from = lines[index].at
        const to = lines[index + 1]?.at ?? from + 4
        const share = Math.round(Math.min(Math.max((seconds + 0.2 - from) / Math.max(to - from, 0.5), 0), 1) * 100)

        if (share !== inked.current) {
            inked.current = share
            node.style.setProperty('--ink', `${share}%`)
        }
    })

    // a new sheet comes in line by line from below
    useLayoutEffect(() => {
        engine.current!.count = lines.length
        engine.current!.springs = []
        engine.current!.measure()
        engine.current!.place(false, true)
    }, [lines, size])

    // a line turning over ripples the column into place
    useEffect(() => engine.current!.place(true), [active])

    // the box or the words changing size: a new stack, no ripple
    useEffect(() => {
        if (!engine.current!.box) return

        const sized = new ResizeObserver(() => {
            engine.current!.measure()
            engine.current!.place(false)
        })

        sized.observe(engine.current!.box)
        for (const line of engine.current!.nodes.slice(0, lines.length)) if (line) sized.observe(line)

        return () => sized.disconnect()
    }, [lines, size])

    useEffect(() => () => engine.current!.stop(), [])

    return (
        <div
            ref={(node) => {
                engine.current!.box = node
            }}
            data-soft={soft ? '' : undefined}
            className={cn('relative overflow-hidden', className)}
            onWheel={(e) => engine.current!.wheel(e.deltaY * (e.deltaMode === 1 ? 40 : 1))}
        >
            {lines.map((line, i) => {
                const d = active < 0 ? i + 1 : Math.abs(i - active)

                return (
                    <button
                        key={`${line.at}-${i}`}
                        ref={(node) => {
                            engine.current!.nodes[i] = node
                        }}
                        type='button'
                        data-at={i === active ? 'now' : i < active ? 'gone' : d <= 2 ? 'near' : 'far'}
                        // out of focus by how far away, up to a limit past which
                        // every line is equally far
                        data-focus={d > 0 ? 'soft' : undefined}
                        style={{ '--d': Math.min(d, 5) } as React.CSSProperties}
                        onClick={() => {
                            engine.current!.offset = 0
                            void seek_to(line.at)
                        }}
                        className={cn('flow-line block w-full text-left font-serif font-medium', size)}
                    >
                        <span className='lyric-words'>{line.text || '· · ·'}</span>
                    </button>
                )
            })}
        </div>
    )
}

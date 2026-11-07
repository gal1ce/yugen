import { useEffect, useRef } from 'react'
import { BANDS, spectrum, step_audio } from '../../lib/audio'
import { add_painter, fx, reduced } from '../../lib/fx'
import { useStore } from '../../lib/store'
import { player } from '../../state/player'
import { useActive } from '../../state/where'

/*
 * The sound as a wave: three soft hills of light standing on the floor of
 * whatever holds them, the low end on the left and the highs on the right.
 *
 * What made the old one look sharp was that it drew the bands nearly as they
 * came - 64 numbers that each jump on their own every 30 ms - so the outline
 * was a row of spikes eased a little. Here the sound goes through three steps
 * before anything is drawn:
 *
 * - across: the 64 bands are gathered into a couple of dozen points, each a
 *   gaussian-weighted mean of the bands around it, so neighbours move
 *   together and the outline is a landscape rather than a comb;
 * - in time: every point hangs on a critically damped spring (the same one
 *   the scrolling uses), so it has a speed - it swells into a kick and sinks
 *   out of it instead of stepping to each new answer;
 * - alive: a slow swell travels along the line on top of the sound, so even a
 *   held chord moves the way water does.
 *
 * The outline is a Catmull-Rom spline through the points, so it has no
 * corners anywhere. Three layers on springs of different stiffness give it
 * depth: the back ones are slower and lag the front one, the way a wave's
 * crest runs ahead of the water behind it. Each is filled with a gradient
 * that fades to nothing at the floor, and the front one has a fine line of
 * light along its top. All of it is drawn at the display's pixel density.
 */
type Props = {
    className?: string
    // how much of the box a full-scale band may take
    gain?: number
    // drawn on the lyrics page, so it keeps going while that covers the rest
    overlay?: boolean
}

const POINTS = 26
const SIGMA = 2.6

// each point's weights over the bands, worked out once
const WEIGHTS = Array.from({ length: POINTS }, (_, i) => {
    const at = (i / (POINTS - 1)) * (BANDS - 1)
    const w = new Float32Array(BANDS)
    let sum = 0

    for (let b = 0; b < BANDS; b++) {
        w[b] = Math.exp(-((b - at) ** 2) / (2 * SIGMA * SIGMA))
        sum += w[b]
    }
    for (let b = 0; b < BANDS; b++) w[b] /= sum

    return w
})

// the ends ease down to the floor, so the shape rises out of it rather than
// being cut off at the edge of the box
const TAPER = Float32Array.from({ length: POINTS }, (_, i) => {
    const e = Math.min(1, Math.min(i, POINTS - 1 - i) / 3.5)
    return Math.sin((e * Math.PI) / 2)
})

// back to front: how stiff each layer's springs are (rad/s), how tall it
// stands, and how much light it holds
const LAYERS = [
    { omega: 6.5, height: 1.06, fill: 0.16, phase: 1.7 },
    { omega: 10, height: 0.94, fill: 0.22, phase: 0.6 },
    { omega: 16, height: 0.82, fill: 0.4, phase: 0 },
]

type Spring = { pos: Float32Array; vel: Float32Array }

export function Wave({ className, gain = 1, overlay = false }: Props) {
    const ref = useRef<HTMLCanvasElement>(null)
    const motion = useStore(fx, (s) => s.motion)
    const palette = useStore(fx, (s) => s.palette)
    // on a phone's screen kept behind another, the wave holds still (state/where)
    const active = useActive()
    const shown = useRef(active)
    const gate = useRef<(() => void) | null>(null)

    useEffect(() => {
        const canvas = ref.current
        const ctx = canvas?.getContext('2d')
        if (!canvas || !ctx || motion === 'off' || reduced()) return

        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        let width = 0
        let height = 0
        let accent: [number, number, number] = [229, 101, 74]
        let frames = 0

        const read_accent = () => {
            accent = rgb_of(getComputedStyle(canvas).getPropertyValue('--accent').trim()) ?? accent
        }

        // the size from the observer, which hands it over once layout is done
        // anyway (and first right after observing), rather than asked of the
        // page here, inside whatever committed the effect: after a tap that
        // was a forced layout inside the tap
        const sized = new ResizeObserver(([entry]) => {
            const box = entry.contentRect
            if (box.width === width && box.height === height) return
            width = box.width
            height = box.height
            canvas.width = Math.max(1, Math.round(width * dpr))
            canvas.height = Math.max(1, Math.round(height * dpr))
        })
        sized.observe(canvas)
        read_accent()

        const target = new Float32Array(POINTS)
        const springs: Spring[] = LAYERS.map(() => ({ pos: new Float32Array(POINTS), vel: new Float32Array(POINTS) }))
        const xs = new Float32Array(POINTS)
        const ys = new Float32Array(POINTS)
        let clock = 0
        // an empty canvas is left alone: clearing it again is still a change,
        // and a change is a frame
        let blank = false

        // through every point, with no corners: each span of the spline as a cubic
        const trace = (base: number) => {
            ctx.moveTo(xs[0], base)
            ctx.lineTo(xs[0], ys[0])

            for (let i = 0; i < POINTS - 1; i++) {
                const p0 = Math.max(i - 1, 0)
                const p3 = Math.min(i + 2, POINTS - 1)

                ctx.bezierCurveTo(
                    xs[i] + (xs[i + 1] - xs[p0]) / 6,
                    ys[i] + (ys[i + 1] - ys[p0]) / 6,
                    xs[i + 1] - (xs[p3] - xs[i]) / 6,
                    ys[i + 1] - (ys[p3] - ys[i]) / 6,
                    xs[i + 1],
                    ys[i + 1],
                )
            }
        }

        const draw = (now: number, dt: number) => {
            step_audio(now, dt)

            // the accent follows the cover; asked again now and then, not every frame
            if (++frames % 45 === 0) read_accent()

            const { current, paused } = player.get()
            const quiet = !current || paused
            const live = spectrum.live

            clock += dt

            // the sound, gathered across
            for (let i = 0; i < POINTS; i++) {
                if (quiet) {
                    target[i] = 0
                    continue
                }

                const w = WEIGHTS[i]
                let v = 0
                for (let b = 0; b < BANDS; b++) v += spectrum.bands[b] * w[b]

                target[i] = v * (live ? 1 : 0.5)
            }

            // and the springs, sub-stepped so a long frame cannot shake them
            let moving = false
            for (let k = 0; k < LAYERS.length; k++) {
                const { omega } = LAYERS[k]
                const { pos, vel } = springs[k]
                let left = dt * 1000

                while (left > 0) {
                    const h = Math.min(left, 8) / 1000
                    left -= 8

                    for (let i = 0; i < POINTS; i++) {
                        vel[i] += (omega * omega * (target[i] - pos[i]) - 2 * omega * vel[i]) * h
                        pos[i] += vel[i] * h
                    }
                }

                for (let i = 0; i < POINTS; i++) {
                    if (Math.abs(target[i] - pos[i]) > 0.002 || Math.abs(vel[i]) > 0.01) moving = true
                }
            }

            if (!moving && quiet) {
                if (!blank) {
                    ctx.setTransform(1, 0, 0, 1, 0, 0)
                    ctx.clearRect(0, 0, canvas.width, canvas.height)
                    blank = true
                }
                // flat and silent: off the clock until something plays, rather
                // than woken every frame of the display to find it still flat
                sleep()
                return
            }

            blank = false
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            ctx.clearRect(0, 0, width, height)

            const scale = height * gain * 0.92
            const step = width / (POINTS - 1)
            // the swell along the line, as strong as the music is loud
            const swell = quiet ? 0 : 0.035 + spectrum.level * 0.08

            for (let k = 0; k < LAYERS.length; k++) {
                const layer = LAYERS[k]
                const { pos } = springs[k]
                let top = height

                for (let i = 0; i < POINTS; i++) {
                    const ripple = swell * (Math.sin(clock * 1.1 + i * 0.42 + layer.phase) * 0.6 + Math.sin(clock * 0.53 - i * 0.23 + layer.phase * 2) * 0.4 + 0.5)
                    const v = Math.max(0, pos[i] * layer.height + ripple) * TAPER[i]

                    xs[i] = i * step
                    ys[i] = height - Math.min(v, 1) * scale
                    if (ys[i] < top) top = ys[i]
                }

                // light at the crest, nothing at the floor
                const fill = ctx.createLinearGradient(0, top, 0, height)
                fill.addColorStop(0, color_at(accent, layer.fill))
                fill.addColorStop(1, color_at(accent, 0))

                ctx.beginPath()
                trace(height)
                ctx.lineTo(xs[POINTS - 1], height)
                ctx.closePath()
                ctx.fillStyle = fill
                ctx.fill()

                // the front one's edge: a fine line of light along the top
                if (k === LAYERS.length - 1) {
                    ctx.beginPath()
                    trace(height)
                    ctx.lineWidth = 1.5
                    ctx.lineJoin = 'round'
                    ctx.strokeStyle = color_at(accent, 0.75)
                    ctx.stroke()
                }
            }
        }

        // ninety a second: smooth on a fast screen, and half the work of every frame at 165 Hz
        let stop: (() => void) | null = shown.current ? add_painter(90, draw, { page: !overlay }) : null

        function sleep() {
            stop?.()
            stop = null
        }

        const wake = () => {
            const { current, paused } = player.get()
            if (shown.current && !stop && current && !paused) stop = add_painter(90, draw, { page: !overlay })
        }
        const off = player.subscribe(wake)
        gate.current = () => (shown.current ? wake() : sleep())

        return () => {
            off()
            sleep()
            sized.disconnect()
            gate.current = null
        }
    }, [motion, palette, gain, overlay])

    // a screen going behind another or coming back only stops or starts the
    // painter; the canvas, its size and its springs stay as they were
    useEffect(() => {
        shown.current = active
        gate.current?.()
    }, [active])

    return <canvas ref={ref} aria-hidden className={`pointer-events-none ${className ?? ''}`} />
}

// a css colour of any syntax as rgb: the canvas reads it and writes it back as hex
let scratch: CanvasRenderingContext2D | null = null

function rgb_of(color: string): [number, number, number] | null {
    if (!color) return null

    scratch ??= document.createElement('canvas').getContext('2d')
    if (!scratch) return null

    scratch.fillStyle = '#000'
    scratch.fillStyle = color
    const hex = String(scratch.fillStyle)
    if (!hex.startsWith('#')) return null

    return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

const color_at = ([r, g, b]: [number, number, number], alpha: number) => `rgb(${r} ${g} ${b} / ${alpha})`

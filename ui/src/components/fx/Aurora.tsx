import { useEffect, useRef } from 'react'
import { spectrum, step_audio } from '../../lib/audio'
import { add_painter, fx, reduced } from '../../lib/fx'
import { useStore } from '../../lib/store'

/*
 * The cover's colours as light that moves: a few soft blobs drifting on slow
 * orbits, swelling with the low end of the sound.
 *
 * It is drawn into a canvas a few dozen pixels across and stretched over the
 * whole surface. Scaling up is what makes it soft - there is no blur anywhere,
 * so a frame costs a handful of gradients at the size of a thumbnail, and the
 * stretch is the compositor's.
 */
const W = 72
const H = 44

// each blob's own orbit: how fast it goes round in x and y, and where it starts
const ORBITS = [
    [0.071, 0.053, 0.0, 1.3, 0.62],
    [0.047, 0.083, 2.1, 0.4, 0.55],
    [0.089, 0.041, 4.0, 2.7, 0.5],
    [0.037, 0.067, 1.1, 5.2, 0.58],
    [0.061, 0.029, 3.3, 3.9, 0.46],
]

// `overlay`: it is drawn on the lyrics page itself, so it keeps going while that covers the rest
export function Aurora({ className, speed = 1, base = '#0a0a0c', overlay = false }: { className?: string; speed?: number; base?: string; overlay?: boolean }) {
    const ref = useRef<HTMLCanvasElement>(null)
    const palette = useStore(fx, (s) => s.palette)
    const motion = useStore(fx, (s) => s.motion)

    useEffect(() => {
        const canvas = ref.current
        const ctx = canvas?.getContext('2d')
        if (!canvas || !ctx) return

        canvas.width = W
        canvas.height = H

        const colours = palette.length ? palette : ['hsl(330 70% 55%)', 'hsl(270 45% 40%)', 'hsl(200 50% 40%)']
        const still = motion === 'off' || reduced()
        let clock = 40

        const draw = (now: number, dt: number) => {
            step_audio(now, dt)

            const swell = spectrum.live ? spectrum.bass : spectrum.level * 0.3
            clock += dt * speed * (motion === 'calm' ? 0.5 : 1) * (1 + swell * 1.5)

            // on a dark base the colours add up as light; with no base (a light
            // page) they are laid over whatever is behind the canvas
            ctx.globalCompositeOperation = 'source-over'
            ctx.globalAlpha = 1

            if (base === 'transparent') ctx.clearRect(0, 0, W, H)
            else {
                ctx.fillStyle = base
                ctx.fillRect(0, 0, W, H)
                ctx.globalCompositeOperation = 'screen'
            }

            ORBITS.forEach(([fx_, fy, px, py, size], i) => {
                const x = W * (0.5 + 0.42 * Math.sin(clock * fx_ * 6 + px))
                const y = H * (0.5 + 0.46 * Math.cos(clock * fy * 6 + py))
                const r = W * size * (1 + swell * 0.35 + 0.08 * Math.sin(clock * 0.7 + i))
                const gradient = ctx.createRadialGradient(x, y, 0, x, y, r)

                gradient.addColorStop(0, colours[i % colours.length])
                gradient.addColorStop(1, 'transparent')

                ctx.globalAlpha = base === 'transparent' ? 0.5 : 0.85
                ctx.fillStyle = gradient
                ctx.fillRect(0, 0, W, H)
            })
        }

        if (still) {
            draw(performance.now(), 0)
            return
        }

        return add_painter(0, draw, { page: !overlay })
    }, [palette, motion, speed, base, overlay])

    return <canvas ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 size-full ${className ?? ''}`} />
}

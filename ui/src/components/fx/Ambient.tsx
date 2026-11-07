import { useEffect, useRef } from 'react'
import { add_painter, fx, reduced } from '../../lib/fx'
import { useStore } from '../../lib/store'
import { thumb_of } from '../../lib/thumbs'
import { library } from '../../state/library'
import { player } from '../../state/player'
import { ui } from '../../state/ui'
import { usePalette } from '../../hooks/dark'

/*
 * The cover's light: the artwork of what is playing, as the room the window
 * sits in.
 *
 * It is the cover itself, not a colour picked out of it - four copies of the
 * picture, each turning slowly about its own centre at its own speed and
 * blurred until only the light is left, the way the music apps on phones paint
 * the screen behind their lyrics. Because the copies turn, the colours of
 * the picture drift past one another, and because it is the picture, a cover
 * that is half red and half blue lights the room half red and half blue.
 *
 * It is drawn into a canvas a hundred-odd pixels across and stretched by the
 * compositor over the whole window. The stretch is what makes it soft, and a
 * frame costs eight blurred thumbnails at the size of a stamp. It turns at
 * thirty frames a second, which light this slow does not need more of; with
 * the drift switched off, or the music paused, it is drawn once and holds.
 *
 * A new track fades in over the old one; with nothing playing it is the
 * palette's own wall.
 */
const W = 144
const H = 90
const FADE = 1.4

// each copy: where it sits, how large, how fast it turns (rad/s) and from where
const PIECES = [
    { x: 0.28, y: 0.32, size: 1.25, spin: 0.05, phase: 0.0, alpha: 1 },
    { x: 0.76, y: 0.66, size: 1.1, spin: -0.042, phase: 1.9, alpha: 0.9 },
    { x: 0.7, y: 0.18, size: 0.8, spin: 0.068, phase: 3.6, alpha: 0.75 },
    { x: 0.2, y: 0.82, size: 0.85, spin: -0.058, phase: 5.1, alpha: 0.75 },
]

type Layer = { image: HTMLImageElement; born: number }

const load = (url: string) =>
    new Promise<HTMLImageElement | null>((resolve) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => resolve(null)
        image.src = url
    })

// a few percent of grain over the light, so a slow gradient stretched across
// a whole window does not band into steps. drawn once, tiled by the compositor
let grain = ''

function grain_url() {
    if (grain) return grain

    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 96
    const ctx = canvas.getContext('2d')
    if (!ctx) return ''

    const image = ctx.createImageData(96, 96)
    for (let i = 0; i < image.data.length; i += 4) {
        const v = Math.random() * 255
        image.data[i] = image.data[i + 1] = image.data[i + 2] = v
        image.data[i + 3] = 255
    }

    ctx.putImageData(image, 0, 0)
    grain = canvas.toDataURL()

    return grain
}

// the layers from the newest one fully shown up: everything under it is hidden
function shown_from(layers: Layer[], now: number) {
    let from = 0
    layers.forEach((l, i) => now - l.born >= FADE && (from = i))
    return from ? layers.slice(from) : layers
}

export function Ambient({ className, page = true, boost = 1 }: { className?: string; page?: boolean; boost?: number }) {
    const ref = useRef<HTMLCanvasElement>(null)
    const layers = useRef<Layer[]>([])
    const current = useStore(player, (s) => s.current)
    const cover = useStore(library, (s) => (current ? s.covers[current] : undefined))
    const drifting = useStore(ui, (s) => s.light_motion)
    const motion = useStore(fx, (s) => s.motion)
    // paused, the light holds where it is: a still room costs nothing at all
    const playing = useStore(player, (s) => !!s.current && !s.paused)
    const moving = drifting && playing && motion !== 'off' && !reduced()
    // a dark palette keeps its room dark: the light of a white sleeve, at full
    // strength, would otherwise turn every panel standing in it to grey fog
    const dark = usePalette() !== 'paper'
    // a still picture is drawn again only when something about it changes
    const redraw = useRef<() => void>(() => {})

    // the cover, shrunk, as the newest layer; the last cover stays up while a
    // track without one plays
    useEffect(() => {
        if (!cover) return

        let live = true

        void thumb_of(cover, 'sm')
            .then(load)
            .then((image) => {
                if (!live || !image) return

                const now = performance.now() / 1000
                // the new cover comes in over what is up now; only what is
                // already under a fully shown layer is let go. (keeping only
                // the layers still fading let go of the one on screen, and the
                // room went dark for each new track and came back in)
                layers.current = [...shown_from(layers.current, now), { image, born: now }].slice(-3)
                redraw.current()
            })

        return () => {
            live = false
        }
    }, [cover])

    useEffect(() => {
        const canvas = ref.current
        const ctx = canvas?.getContext('2d')
        if (!canvas || !ctx) return

        // a canvas given its size again is cleared, even the same size: done
        // on each play and pause, the room went dark until the next beat
        // drew it - a beat that waits for a still finger (lib/fx)
        if (canvas.width !== W) canvas.width = W
        if (canvas.height !== H) canvas.height = H

        // one clock for the turning, so stopping and starting the drift picks
        // up where it was rather than jumping
        let clock = 40
        let last = 0

        const draw = (seconds: number) => {
            const now = performance.now() / 1000

            ctx.globalCompositeOperation = 'source-over'
            ctx.globalAlpha = 1
            ctx.filter = 'none'
            ctx.clearRect(0, 0, W, H)

            // what a new cover has fully covered is not drawn under it again
            layers.current = shown_from(layers.current, now)

            for (const layer of layers.current) {
                const shown = Math.min((now - layer.born) / FADE, 1)
                // ease the fade so a new cover arrives like light changing, not a cut
                const alpha = shown * shown * (3 - 2 * shown)
                const { image } = layer

                ctx.filter = dark ? 'blur(9px) saturate(1.5) brightness(0.62)' : 'blur(9px) saturate(1.4)'

                for (const piece of PIECES) {
                    const size = Math.max(W, H) * piece.size
                    ctx.save()
                    ctx.globalAlpha = alpha * piece.alpha
                    ctx.translate(W * piece.x, H * piece.y)
                    ctx.rotate(piece.phase + seconds * piece.spin)
                    ctx.drawImage(image, -size / 2, -size / 2, size, size)
                    ctx.restore()
                }
            }

            ctx.filter = 'none'
        }

        const fading = () => layers.current.some((l) => performance.now() / 1000 - l.born < FADE)

        if (!moving) {
            // still: drawn once, and again for each frame of a fade
            let frame = 0
            const settle = () => {
                draw(clock)
                frame = fading() ? requestAnimationFrame(settle) : 0
            }

            redraw.current = () => {
                if (!frame) settle()
            }
            settle()

            return () => {
                cancelAnimationFrame(frame)
                redraw.current = () => {}
            }
        }

        redraw.current = () => {}
        draw(clock)

        // light this slow is smooth at thirty frames a second
        return add_painter(
            30,
            (now, dt) => {
                if (last) clock += dt
                last = now
                draw(clock)
            },
            { page },
        )
    }, [moving, page, dark])

    return (
        <div aria-hidden className={`pointer-events-none overflow-hidden ${className ?? ''}`}>
            {/* overscanned, so the blur has no edge to pull in from outside */}
            <canvas ref={ref} className='absolute -inset-[6%] h-[112%] w-[112%]' style={{ opacity: `calc(var(--light, 0.5) * ${boost})` }} />
            <div className='absolute inset-0 opacity-[0.03]' style={{ backgroundImage: `url(${grain_url()})`, backgroundSize: '96px' }} />
        </div>
    )
}

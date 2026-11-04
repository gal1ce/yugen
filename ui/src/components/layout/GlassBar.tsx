import { useEffect, useRef, type RefObject } from 'react'
import { cancel_frame, next_frame } from '../../lib/frames'
import { paced } from '../../lib/motion'
import { useStore } from '../../lib/store'
import { bar } from '../../state/bar'
import { ui } from '../../state/ui'

/*
 * The body of the bar over the page: nothing at the top of a page, one bar
 * once the page goes under it, and the way between the two is a tear.
 *
 * At the top the controls stand on the page itself, with nothing behind them.
 * As the page goes under, a sheet of the bar's material comes up behind them,
 * still one with the top edge of the page. Then it pulls away: its sides draw
 * in and round off, it drops a little, and what holds it to the edge narrows
 * to one strand in the middle that thins and snaps - and the bar floats on
 * its own, under a shadow. Back at the top the strand reaches up again, the
 * bar runs back into the edge and the sheet clears.
 *
 * How:
 * - the shape is two rounded rectangles - the bar, and what holds it to the
 *   top edge, narrowing from the sides in - drawn into an SVG with the gooey
 *   (metaball) filter, a blur cut at a hard alpha threshold, so wherever they
 *   are close they join with a smooth neck, and as they part it thins and
 *   breaks. That SVG, as a data url, is the glass element's mask;
 * - the same shape on black is the height map of the lens (#bar-lens): blurred
 *   into a bevel, its slope worked out with two Sobel kernels into a
 *   displacement map, so what is behind the glass is bent at the rim - in
 *   three passes a little apart, one per colour, which splits the colours
 *   where the bend is steepest - and lit by a specular light from the top
 *   left, which draws the bright rim. The map is read from a data url
 *   because chromium's feImage will not render an element of the page;
 * - the shadow is the same shape again, blurred, dropped and cut out of
 *   itself, as the mask of a layer of the theme's shadow colour - a
 *   box-shadow would be cut off by the mask;
 * - without liquid glass the same shape is filled solid: it still tears and
 *   joins, it is just not glass.
 *
 * Everything moves along one progress value, and the scroll drives it: while
 * the page is being scrolled through the first stretch under the bar, the
 * tear follows it closely, so it starts with the first pixel. Once the scroll
 * stops, or reaches either end of that stretch, it finishes on an
 * under-damped spring - all the way off if anything is under the bar, all the
 * way back if nothing is - and a jump (a new page, a key) goes on the spring
 * from the start. The controls ride with the bar's body, and the search field
 * gives up its own well as the bar comes up around it (--lift, index.css).
 * Frames are stepped from the page's beat, and only while it moves: at rest
 * the masks and the map are fixed and nothing here runs. With animations off,
 * or the system asking for less motion, it goes straight to where it is going.
 */
type Rect = { x: number; y: number; w: number; h: number; r: number }

// how high the bar's box is (room for the drop and the shadow), how far the
// floating bar stands in from the sides and down from the top, how far the
// edge drags it down before letting go, and how much lower than the bar at
// rest it is
const DEPTH = 96
const INSET = 12
const DROP = 8
const TUG = 12
const SHRINK = 16
// the spring it settles on, how closely it follows the scroll, and how long
// the scroll has to rest before it settles
const OMEGA = 9
const ZETA = 0.62
const FOLLOW = 30
const REST = 140
// what holds the bar to the top edge reaches this far above the box, so its
// own rounded ends never show
const OVER = 40

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const clamp = (t: number) => Math.min(Math.max(t, 0), 1)
const smooth = (a: number, b: number, t: number) => {
    const x = clamp((t - a) / (b - a))
    return x * x * (3 - 2 * x)
}

const GOO = `<filter id='g' x='-10%' y='-60%' width='120%' height='220%'><feGaussianBlur stdDeviation='9'/><feColorMatrix values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 30 -14'/></filter>`
// the shape, blurred and dropped, with the shape itself taken out of it
const SHADE = `<filter id='s' x='-10%' y='-60%' width='120%' height='220%'><feGaussianBlur stdDeviation='9' result='a'/><feColorMatrix in='a' values='1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 30 -14' result='shape'/><feGaussianBlur in='shape' stdDeviation='10'/><feOffset dy='7' result='drop'/><feComposite in='drop' in2='shape' operator='out'/></filter>`

function rects(pieces: Rect[]) {
    return pieces
        .filter((r) => r.w > 0.5 && r.h > 0.5)
        .map((r) => `<rect x='${r.x.toFixed(1)}' y='${r.y.toFixed(1)}' width='${r.w.toFixed(1)}' height='${r.h.toFixed(1)}' rx='${r.r.toFixed(1)}' fill='white'/>`)
        .join('')
}

function shape_svg(pieces: Rect[], width: number, height: number, ground: boolean) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'><defs>${GOO}</defs>${ground ? `<rect width='${width}' height='${height}' fill='black'/>` : ''}<g filter='url(#g)'>${rects(pieces)}</g></svg>`

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

function shade_svg(pieces: Rect[], width: number, height: number) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'><defs>${SHADE}</defs><g filter='url(#s)'>${rects(pieces)}</g></svg>`

    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

// the lens, once, in a hidden svg of its own; its map is set per shape
let lens: { filter: SVGFilterElement; image: SVGFEImageElement } | null = null

function make_lens() {
    if (lens) return lens

    const ns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('width', '0')
    svg.setAttribute('height', '0')
    svg.setAttribute('aria-hidden', 'true')
    svg.style.position = 'absolute'
    svg.innerHTML = `<filter id="bar-lens" x="0" y="0" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
        <feImage x="0" y="0" preserveAspectRatio="none" result="mask" />
        <feGaussianBlur in="mask" stdDeviation="5" result="soft" />
        <feConvolveMatrix in="soft" order="3" kernelMatrix="-1 0 1 -2 0 2 -1 0 1" divisor="0.6" bias="0.5" preserveAlpha="true" result="gx" />
        <feConvolveMatrix in="soft" order="3" kernelMatrix="-1 -2 -1 0 0 0 1 2 1" divisor="0.6" bias="0.5" preserveAlpha="true" result="gy" />
        <feColorMatrix in="gx" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0 1" result="rx" />
        <feColorMatrix in="gy" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 0 1" result="ry" />
        <feComposite in="rx" in2="ry" operator="arithmetic" k2="1" k3="1" result="map" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale="30" xChannelSelector="R" yChannelSelector="G" result="d1" />
        <feColorMatrix in="d1" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cr" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale="36" xChannelSelector="R" yChannelSelector="G" result="d2" />
        <feColorMatrix in="d2" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cg" />
        <feDisplacementMap in="SourceGraphic" in2="map" scale="42" xChannelSelector="R" yChannelSelector="G" result="d3" />
        <feColorMatrix in="d3" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="cb" />
        <feBlend in="cr" in2="cg" mode="screen" result="rg" />
        <feBlend in="rg" in2="cb" mode="screen" result="bent" />
        <feColorMatrix in="soft" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="height" />
        <feSpecularLighting in="height" surfaceScale="5" specularConstant="1.1" specularExponent="28" lighting-color="#fff" result="spec">
            <feDistantLight azimuth="235" elevation="38" />
        </feSpecularLighting>
        <feComposite in="spec" in2="bent" operator="arithmetic" k2="0.55" k3="1" />
    </filter>`
    document.body.appendChild(svg)

    const filter = svg.querySelector('filter')!
    lens = { filter, image: filter.querySelector('feImage')! }

    return lens
}

// the pieces at a moment of the tear: p 0 is one with the top edge, 1 floating.
// p runs a little past both ends on the spring; the drop follows it, the rest
// is held to the ends
function pieces(p: number, width: number, height: number): Rect[] {
    const q = clamp(p)
    // the sides draw in and round off over the whole way
    const d = smooth(0.05, 0.9, q)
    const h = lerp(height, height - SHRINK, d)
    // it drops to where it floats, and is dragged a little lower while the
    // edge still holds it, springing back up once it lets go
    const pull = TUG * smooth(0.15, 0.65, q) * (1 - smooth(0.7, 0.95, q))
    const y = DROP * Math.max(p, 0) * smooth(0.05, 0.5, q) + pull
    const body = { x: INSET * d, y, w: width - INSET * 2 * d, h, r: (h / 2) * d }

    // what holds it to the edge: the whole width at first, then it lets go
    // from the sides in, down to one strand in the middle, thinner than the
    // blur can hold - and the goo drops it
    const tear = smooth(0.15, 0.8, q)
    const hold = width * (1 - tear) ** 2
    const edge = { x: (width - hold) / 2, y: -OVER, w: hold, h: OVER + y + h / 2, r: Math.min(hold / 2, 24) }

    return [edge, body]
}

export function GlassBar({ row }: { row: RefObject<HTMLElement | null> }) {
    const glass = useStore(ui, (s) => s.glass)
    const body = useRef<HTMLDivElement>(null)
    const shade = useRef<HTMLDivElement>(null)
    // from the edge: a bar turned on below the top of a page tears off, rather than being there
    const motion = useRef({ p: 0, v: 0, frame: 0, last: 0, target: 0, follow: false, rest: 0 })
    // the box the shape is drawn in, and how tall the bar is at rest
    const layout = useRef({ width: 0, height: 0 })

    useEffect(() => {
        const node = body.current
        const under = shade.current
        if (!node || !under) return

        const lens = make_lens()
        const m = motion.current
        const less = window.matchMedia('(prefers-reduced-motion: reduce)')

        const paint = (p: number) => {
            const { width, height } = layout.current
            if (!width) return

            const q = clamp(p)
            const shapes = pieces(p, width, height)
            const body = shapes[shapes.length - 1]

            // the sheet comes up before it pulls away, and the shadow only
            // falls once it is off the edge
            node.style.opacity = `${smooth(0, 0.35, q)}`
            under.style.opacity = `${smooth(0.45, 1, q)}`
            // the controls go where the bar's middle goes - down as the edge
            // drags it, back as it lets go - and end where they started
            node.parentElement?.style.setProperty('--lift', `${q.toFixed(3)}`)
            if (row.current) row.current.style.transform = `translateY(${(body.y + body.h / 2 - height / 2).toFixed(2)}px)`

            // fully at the top there is nothing to draw
            if (q === 0) return

            const mask = `url("${shape_svg(shapes, width, DEPTH, false)}")`
            node.style.maskImage = mask
            node.style.setProperty('-webkit-mask-image', mask)

            const drop = `url("${shade_svg(shapes, width, DEPTH)}")`
            under.style.maskImage = drop
            under.style.setProperty('-webkit-mask-image', drop)

            if (glass) {
                lens.filter.setAttribute('width', `${width}`)
                lens.filter.setAttribute('height', `${DEPTH}`)
                lens.image.setAttribute('width', `${width}`)
                lens.image.setAttribute('height', `${DEPTH}`)
                lens.image.setAttribute('href', shape_svg(shapes, width, DEPTH, true))
            }
        }

        // the bar's box: as wide as the page, as tall as the header above it
        const measure = () => {
            const header = node.parentElement
            layout.current = {
                width: Math.round(node.getBoundingClientRect().width),
                height: Math.round(header?.getBoundingClientRect().height ?? 64),
            }
            paint(m.p)
        }

        measure()
        const sized = new ResizeObserver(measure)
        sized.observe(node)

        const tick = (now: number) => {
            m.frame = 0
            const dt = m.last ? Math.min((now - m.last) / 1000, 0.05) : 1 / 60
            m.last = now

            // following the scroll it is stiff and does not bounce; settling, it
            // is the spring, slower or faster with the pace picked in settings
            const omega = m.follow ? FOLLOW : OMEGA / paced(1)
            const zeta = m.follow ? 1 : ZETA
            let left = dt
            while (left > 0) {
                const h = Math.min(left, 1 / 240)
                left -= h
                m.v += (omega * omega * (m.target - m.p) - 2 * zeta * omega * m.v) * h
                m.p += m.v * h
            }

            if (Math.abs(m.target - m.p) < 0.002 && Math.abs(m.v) < 0.02) {
                m.p = m.target
                m.v = 0
                m.last = 0
                paint(m.p)
                return
            }

            paint(m.p)
            m.frame = next_frame(tick)
        }

        const run = () => {
            if (!m.frame && m.p !== m.target) {
                m.last = 0
                m.frame = next_frame(tick)
            }
        }

        // all the way off or all the way back, on the spring
        const settle = () => {
            clearTimeout(m.rest)
            m.follow = false
            m.target = bar.get().lift > 0 ? 1 : 0

            if (less.matches || document.documentElement.dataset.pace === 'off') {
                cancel_frame(m.frame)
                m.frame = 0
                m.p = m.target
                m.v = 0
                paint(m.p)
                return
            }

            run()
        }

        const on_lift = () => {
            const lift = bar.get().lift
            clearTimeout(m.rest)

            // at either end of the stretch, or after a jump, it settles at once;
            // in between it follows the scroll and settles when the scroll rests
            if (lift === 0 || lift === 1 || Math.abs(lift - m.p) > 0.5 || less.matches) return settle()

            m.follow = true
            m.target = lift
            m.rest = window.setTimeout(settle, REST)
            run()
        }

        settle()
        const off = bar.subscribe(on_lift)

        return () => {
            off()
            clearTimeout(m.rest)
            sized.disconnect()
            cancel_frame(m.frame)
            m.frame = 0
        }
    }, [glass, row])

    return (
        <>
            <div ref={shade} aria-hidden className='bar-shade pointer-events-none absolute inset-x-0 top-0 opacity-0' style={{ height: DEPTH }} />
            <div ref={body} aria-hidden className='bar-glass pointer-events-none absolute inset-x-0 top-0 opacity-0' style={{ height: DEPTH }} />
        </>
    )
}

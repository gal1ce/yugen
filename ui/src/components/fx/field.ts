/*
 * The glyph field's drawing, on its own so it can run on either side: in a
 * worker over an OffscreenCanvas when the engine allows it - which takes all of
 * it off the thread the ui lives on - and on the page itself when it does not.
 * See Glyphs.tsx for what it looks like and why.
 */
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas

// a canvas of this size, painted by `draw` if given: offscreen where the
// engine has that (in a worker it is the only kind), a page canvas otherwise
export function atlas_canvas(width: number, height: number, draw?: (ctx: Ctx) => void): AnyCanvas {
    const canvas = make_canvas(width, height)
    if (draw) draw(canvas.getContext('2d') as Ctx)

    return canvas
}

const make_canvas = (width: number, height: number): AnyCanvas => {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    return canvas
}

export const CELL_W = 11
export const CELL_H = 17
const FONT_SIZE = 11
export const GLYPHS = '0123456789abcdefghijkmnopqrstuvwxyz#%&*+=<>?/♪♫'
// the faintest cells show dots, brighter ones characters: it reads as depth
export const DOTS = '.:'

function atlas(chars: string, colour: string, dpr: number) {
    const canvas = make_canvas(chars.length * CELL_W * dpr, CELL_H * dpr)
    const ctx = canvas.getContext('2d') as Ctx
    ctx.scale(dpr, dpr)
    ctx.fillStyle = colour
    ctx.font = `${FONT_SIZE}px ui-monospace, 'DejaVu Sans Mono', monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    for (let i = 0; i < chars.length; i++) ctx.fillText(chars[i], i * CELL_W + CELL_W / 2, CELL_H / 2 + 0.5)

    return canvas
}

const smoothstep = (a: number, b: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)
}

// `fade`: it thins out towards the bottom, done here rather than with a css mask -
// a mask over a canvas that changes every frame is one more pass for webkit

export type FieldOptions = { dpr: number; base: string; ceiling: number; fade: boolean }

export function create_field(canvas: AnyCanvas, options: FieldOptions) {
    const ctx = canvas.getContext('2d') as Ctx
    const chars = DOTS + GLYPHS
    let { dpr, ceiling } = options
    const { fade } = options
    let base_atlas = atlas(chars, options.base, dpr)

    let width = 0
    let height = 0
    let cols = 0
    let rows = 0
    let glyphs = new Uint8Array(0)

    // the field's own time, which runs faster while the music is loud
    let clock = 12

    function resize(w: number, h: number, ratio = dpr) {
        width = w
        height = h
        dpr = ratio
        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(height * dpr)
        cols = Math.ceil(width / CELL_W) + 1
        rows = Math.ceil(height / CELL_H) + 1
        glyphs = new Uint8Array(cols * rows).map(() => Math.floor(Math.random() * GLYPHS.length))
    }

    function recolour(base: string, next_ceiling: number) {
        base_atlas = atlas(chars, base, dpr)
        ceiling = next_ceiling
    }

    // level: how loud it is, 0..1
    function frame(dt: number, level: number) {
        clock += dt * (1 + level * 2.2)

        const t = clock
        const glow = 1 + level * 0.9

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        ctx.clearRect(0, 0, width, height)

        for (let row = 0; row < rows; row++) {
            const y = row * CELL_H
            const falloff = fade ? smoothstep(height * 0.98, height * 0.35, y) : 1
            if (falloff < 0.02) continue

            for (let col = 0; col < cols; col++) {
                const x = col * CELL_W
                // two slow waves crossing: bright ridges where they agree, nothing between
                const w1 = Math.sin(x * 0.0072 + t * 0.32 + Math.sin(y * 0.0041 - t * 0.17) * 2.3)
                const w2 = Math.sin((x * 0.7 - y) * 0.0048 - t * 0.21)
                const wave = w1 * 0.62 + w2 * 0.38
                const band = smoothstep(0.12, 0.9, wave)
                const fringe = smoothstep(-0.45, 0.4, wave) * 0.13

                const lit = Math.min(1, (band * 0.6 + fringe) * glow)
                if (lit < 0.04) continue

                // a character changes now and then
                const cell = row * cols + col
                if (Math.random() < 0.002) glyphs[cell] = Math.floor(Math.random() * GLYPHS.length)

                const index = lit < 0.16 ? (lit < 0.09 ? 0 : 1) : DOTS.length + glyphs[cell]

                ctx.globalAlpha = lit * ceiling * falloff
                ctx.drawImage(base_atlas, index * CELL_W * dpr, 0, CELL_W * dpr, CELL_H * dpr, x, y, CELL_W, CELL_H)
            }
        }

        ctx.globalAlpha = 1
    }

    return { resize, recolour, frame }
}

export type Field = ReturnType<typeof create_field>

// what the page tells a field that lives in a worker
export type FieldMessage =
    | { kind: 'init'; canvas: OffscreenCanvas; width: number; height: number; options: FieldOptions }
    | { kind: 'resize'; width: number; height: number; dpr: number }
    | { kind: 'recolour'; base: string; ceiling: number }
    | { kind: 'frame'; dt: number; level: number }

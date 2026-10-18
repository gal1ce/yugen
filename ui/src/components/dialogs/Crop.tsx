import { useRef, useState } from 'react'
import { useStore } from '../../lib/store'
import { save_crop } from '../../state/images'
import { ui } from '../../state/ui'
import { Button } from '../ui/Button'
import { Range } from '../ui/Controls'
import { Dialog, DialogActions } from '../ui/Dialog'

// a picked photo is almost never square, so it stops here on the way in: the
// window below is what the picture will become, and the photo is dragged and
// zoomed behind it until the right part shows through
const VIEW = 256 // css px of the square crop window
const OUT = 512 // the square that is actually written back
const ZOOM = [1, 4] as const

const clamp = (value: number, [min, max]: readonly [number, number]) => Math.min(Math.max(value, min), max)

export function CropDialog() {
    const crop = useStore(ui, (s) => s.crop)
    const busy = useStore(ui, (s) => s.crop_busy)
    const [natural, set_natural] = useState<{ w: number; h: number } | null>(null)
    const [zoom, set_zoom] = useState(1)
    const [offset, set_offset] = useState({ x: 0, y: 0 })
    const image = useRef<HTMLImageElement>(null)
    const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

    if (!crop) return null

    const round = crop.for.kind === 'avatar'
    const close = () => ui.set({ crop: null })

    // whichever way the picture is long, it covers the window at zoom 1
    const base = natural ? VIEW / Math.min(natural.w, natural.h) : 1
    const shown = natural ? { w: natural.w * base * zoom, h: natural.h * base * zoom } : { w: 0, h: 0 }

    // it may never uncover a corner: the offsets stay inside whatever slack the
    // picture has over the window at this zoom
    const hold = (x: number, y: number, w: number, h: number) => ({
        x: Math.min(0, Math.max(VIEW - w, x)),
        y: Math.min(0, Math.max(VIEW - h, y)),
    })

    // zooming pulls towards the middle of the window, so whatever was framed
    // stays framed
    const rezoom = (next: number) => {
        if (!natural) return

        const step = next / zoom
        const grown = { w: natural.w * base * next, h: natural.h * base * next }
        const middle = VIEW / 2

        set_zoom(next)
        set_offset((o) => hold(middle - (middle - o.x) * step, middle - (middle - o.y) * step, grown.w, grown.h))
    }

    // the window and the drawn square are both square, so one drawImage with
    // the source rectangle the offsets describe is the whole crop
    const commit = () => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = OUT

        const ctx = canvas.getContext('2d')
        if (!image.current || !natural || !ctx) return

        const factor = base * zoom
        const side = VIEW / factor

        // jpeg has no alpha, so a transparent png would come out on black
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, OUT, OUT)
        ctx.drawImage(image.current, -offset.x / factor, -offset.y / factor, side, side, 0, 0, OUT, OUT)

        void save_crop(canvas.toDataURL('image/jpeg', 0.92))
    }

    return (
        <Dialog title={round ? 'Crop photo' : 'Crop cover'} sub='Drag the photo to move it, scroll or use the slider to zoom.' busy={busy} on_close={close} className='max-w-sm'>
            <div
                className='relative mx-auto cursor-grab touch-none overflow-hidden rounded-2xl bg-surface-3 active:cursor-grabbing'
                style={{ width: VIEW, height: VIEW }}
                onPointerDown={(e) => {
                    if (!natural || busy) return
                    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
                    e.currentTarget.setPointerCapture(e.pointerId)
                }}
                onPointerMove={(e) => {
                    const from = drag.current
                    if (from) set_offset(hold(from.ox + (e.clientX - from.x), from.oy + (e.clientY - from.y), shown.w, shown.h))
                }}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
                onWheel={(e) => rezoom(clamp(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08), ZOOM))}
            >
                <img
                    ref={image}
                    src={crop.src}
                    alt=''
                    draggable={false}
                    onLoad={(e) => {
                        const { naturalWidth: w, naturalHeight: h } = e.currentTarget
                        const fit = VIEW / Math.min(w, h)

                        set_natural({ w, h })
                        set_zoom(1)
                        set_offset({ x: (VIEW - w * fit) / 2, y: (VIEW - h * fit) / 2 })
                    }}
                    className='absolute top-0 left-0 max-w-none select-none'
                    style={{ width: shown.w, height: shown.h, transform: `translate(${offset.x}px, ${offset.y}px)` }}
                />
                {/* only a guide: painted over the picture, taking no clicks. a
                    circle dims what the avatar will not show */}
                {round && <div className='pointer-events-none absolute inset-0 bg-[radial-gradient(circle_closest-side,transparent_99%,rgb(0_0_0/0.55)_100%)]' />}
                <div className={`pointer-events-none absolute inset-0 border-2 border-white/80 ${round ? 'rounded-full' : 'rounded-2xl'}`} />
            </div>

            <Range value={zoom} min={ZOOM[0]} max={ZOOM[1]} step={0.01} disabled={!natural || busy} aria-label='Zoom' on_change={rezoom} className='mt-5 w-full' />

            <DialogActions>
                <Button variant='ghost' disabled={busy} onClick={close}>
                    Cancel
                </Button>
                <Button loading={busy} disabled={!natural} onClick={commit}>
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    )
}

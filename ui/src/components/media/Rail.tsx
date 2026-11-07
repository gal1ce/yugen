import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CaretDoubleLeft, ChevronLeft, ChevronRight } from '../ui/icons'
import { IconButton } from '../ui/Button'
import { cancel_frame, next_frame } from '../../lib/frames'
import { tip } from '../../lib/tip'
import { cn } from '../../lib/cn'
import { usePhone } from '../../hooks/phone'

// a heading, what it points at, and whatever sits under it
export function Section({ title, note, action, children, className }: { title: ReactNode; note?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section className={cn('offscreen-skip', className ?? 'mb-12')}>
            <div className='mb-4 flex items-end gap-3'>
                <div className='min-w-0'>
                    <h2 className='truncate text-[1.125rem] font-medium text-fg'>{title}</h2>
                    {note && <p className='mt-0.5 text-[0.8125rem] text-muted'>{note}</p>}
                </div>
                <div className='ml-auto flex shrink-0 items-center gap-1'>{action}</div>
            </div>
            {children}
        </section>
    )
}

export const SeeAll = ({ on_click }: { on_click: () => void }) => (
    <button type='button' onClick={on_click} className='flex h-8 items-center gap-1 rounded-md px-2 text-[0.8125rem] text-muted transition-colors hover:text-fg'>
        See all
        <ChevronRight size={14} />
    </button>
)

// a card is w-40 and the gap is gap-5: a page of the row is a whole number of
// these, so every press leaves a card sitting flush on the left edge
const CARD = 160 + 20
const PAGE_MS = 420
const HOME_MS = 340

type Reach = { left: boolean; right: boolean; far: boolean }

/*
 * A row of cards that runs sideways, moved only by the buttons in its heading.
 *
 * It used to take the wheel and turn it a quarter, which meant a page being
 * scrolled down caught on the first row that slid under the pointer and started
 * scrolling that instead. The row clips rather than scrolls, so the wheel and
 * a trackpad always belong to the page; the buttons ease it a page at a time,
 * and once it is well along a third one takes it back to the start quickly.
 */
export function Shelf({ title, note, action, children }: { title: ReactNode; note?: ReactNode; action?: ReactNode; children: ReactNode }) {
    const box = useRef<HTMLDivElement>(null)
    const frame = useRef(0)
    const phone = usePhone()
    const [reach, set_reach] = useState<Reach>({
        left: false,
        right: false,
        far: false,
    })

    useEffect(() => {
        const el = box.current
        if (!el) return

        const read = () => {
            const limit = el.scrollWidth - el.clientWidth
            const at = el.scrollLeft
            const next = {
                left: at > 1,
                right: at < limit - 1,
                // well along: a whole page in, or as far as a short row goes
                far: at > 1 && at >= Math.min(el.clientWidth, limit) - 1,
            }

            set_reach((prev) => (prev.left === next.left && prev.right === next.right && prev.far === next.far ? prev : next))
        }

        read()

        // a card focused from the keyboard is still scrolled into view by the
        // engine, so the buttons follow the row rather than their own presses
        const sizes = new ResizeObserver(read)
        sizes.observe(el)
        el.addEventListener('scroll', read, { passive: true })

        // cards arriving at the front of a snapping row (a shelf filled in as
        // the tags are read) are stepped over: the engine keeps the card it
        // had snapped to, and the row came up halfway along. until a finger
        // has moved it, the row starts at its start
        let touched = false
        const touch = () => (touched = true)
        el.addEventListener('pointerdown', touch, { passive: true })
        const cards = new MutationObserver(() => {
            if (!touched) el.scrollLeft = 0
        })
        cards.observe(el, { childList: true })

        return () => {
            el.removeEventListener('pointerdown', touch)
            cards.disconnect()
            sizes.disconnect()
            el.removeEventListener('scroll', read)
            if (frame.current) cancel_frame(frame.current)
        }
    }, [])

    const go = (to: number, ms: number) => {
        const el = box.current
        if (!el) return

        if (frame.current) cancel_frame(frame.current)

        const from = el.scrollLeft
        const target = Math.min(Math.max(to, 0), el.scrollWidth - el.clientWidth)
        if (Math.abs(target - from) < 1) return

        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            el.scrollLeft = target

            return
        }

        let start = 0

        const step = (now: number) => {
            if (!start) start = now

            const t = Math.min((now - start) / ms, 1)
            // ease out quint: off the mark at once, a long soft landing
            el.scrollLeft = from + (target - from) * (1 - (1 - t) ** 5)

            frame.current = t < 1 ? next_frame(step) : 0
        }

        frame.current = next_frame(step)
    }

    const page = (dir: 1 | -1) => {
        const el = box.current
        if (!el) return

        // a card as drawn - its width follows the cards' size setting
        const card = ((el.firstElementChild as HTMLElement | null)?.offsetWidth ?? CARD - 20) + 20
        const span = Math.max(Math.floor(el.clientWidth / card), 1) * card
        // from the card edge it is nearest, so a row the keyboard left half a
        // card off still lands flush
        const at = Math.round(el.scrollLeft / card) * card

        go(at + dir * span, PAGE_MS)
    }

    // a phone's row is swiped, as every row on a phone is: no buttons there
    const overflow = !phone && (reach.left || reach.right)

    return (
        <Section
            title={title}
            note={note}
            action={
                <>
                    {action}
                    {overflow && (
                        <div className='ml-1 flex items-center gap-1'>
                            {reach.far && (
                                <IconButton size='sm' {...tip('Back to start')} onClick={() => go(0, HOME_MS)} className='animate-fade-in'>
                                    <CaretDoubleLeft size={16} />
                                </IconButton>
                            )}
                            <IconButton size='sm' variant='outline' {...tip('Previous')} disabled={!reach.left} onClick={() => page(-1)}>
                                <ChevronLeft size={16} />
                            </IconButton>
                            <IconButton size='sm' variant='outline' {...tip('Next')} disabled={!reach.right} onClick={() => page(1)}>
                                <ChevronRight size={16} />
                            </IconButton>
                        </div>
                    )}
                </>
            }
        >
            {/* clipped, not scrollable: the padding keeps a card's shadow from
                being cut off at the edges */}
            <div
                ref={box}
                className={
                    phone
                        ? // under the thumb it scrolls on its own momentum and comes to rest on a card, edge to edge of the screen
                          '-mx-4 -mt-2 flex snap-x snap-mandatory scroll-px-4 gap-3.5 overflow-x-auto overscroll-x-contain px-4 pt-2 pb-4 [&>*]:w-[calc(9.25rem*var(--z-cards,1))] [&>*]:shrink-0 [&>*]:snap-start'
                        : '-mx-2 -mt-2 flex gap-4 overflow-hidden px-2 pt-2 pb-4 [&>*]:w-[calc(11.5rem*var(--z-cards,1))] [&>*]:shrink-0'
                }
            >
                {children}
            </div>
        </Section>
    )
}

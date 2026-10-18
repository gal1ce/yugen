import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CaretDoubleLeft, ChevronLeft, ChevronRight } from '../ui/icons'
import { IconButton } from '../ui/Button'
import { cancel_frame, next_frame } from '../../lib/frames'
import { tip } from '../../lib/tip'

// a heading, what it points at, and whatever sits under it
export function Section({ title, note, action, children, className }: { title: ReactNode; note?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section className={className ?? 'mb-10'}>
            <div className='mb-4 flex items-end gap-3'>
                <div className='min-w-0'>
                    <h2 className='truncate font-display text-[1.3rem] font-bold tracking-tight'>{title}</h2>
                    {note && <p className='mt-0.5 text-xs text-muted'>{note}</p>}
                </div>
                <div className='ml-auto flex shrink-0 items-center gap-1.5'>{action}</div>
            </div>
            {children}
        </section>
    )
}

export const SeeAll = ({ on_click }: { on_click: () => void }) => (
    <button type='button' onClick={on_click} className='group flex items-center gap-0.5 text-xs font-medium text-muted transition-colors hover:text-fg'>
        See all
        <ChevronRight size={14} className='transition-transform group-hover:translate-x-0.5' />
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

        return () => {
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

        const span = Math.max(Math.floor(el.clientWidth / CARD), 1) * CARD
        // from the card edge it is nearest, so a row the keyboard left half a
        // card off still lands flush
        const at = Math.round(el.scrollLeft / CARD) * CARD

        go(at + dir * span, PAGE_MS)
    }

    const overflow = reach.left || reach.right

    return (
        <Section
            title={title}
            note={note}
            action={
                <>
                    {action}
                    {overflow && (
                        <div className='ml-1.5 flex items-center gap-1'>
                            <AnimatePresence initial={false}>
                                {reach.far && (
                                    <motion.div
                                        key='home'
                                        initial={{ opacity: 0, width: 0, scale: 0.6 }}
                                        animate={{ opacity: 1, width: 'auto', scale: 1 }}
                                        exit={{ opacity: 0, width: 0, scale: 0.6 }}
                                        transition={{ type: 'spring', stiffness: 520, damping: 34 }}
                                        className='flex justify-center overflow-hidden'
                                    >
                                        <IconButton size='sm' variant='on' {...tip('Back to start')} onClick={() => go(0, HOME_MS)}>
                                            <CaretDoubleLeft size={14} />
                                        </IconButton>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            <IconButton size='sm' variant='outline' {...tip('Previous')} disabled={!reach.left} onClick={() => page(-1)}>
                                <ChevronLeft size={14} />
                            </IconButton>
                            <IconButton size='sm' variant='outline' {...tip('Next')} disabled={!reach.right} onClick={() => page(1)}>
                                <ChevronRight size={14} />
                            </IconButton>
                        </div>
                    )}
                </>
            }
        >
            {/* clipped, not scrollable: the padding keeps a card's hover lift
                and shadow from being cut off at the edges */}
            <div ref={box} className='-mx-2 -mt-2 flex gap-5 overflow-hidden px-2 pt-2 pb-2 [&>*]:w-40 [&>*]:shrink-0'>
                {children}
            </div>
        </Section>
    )
}

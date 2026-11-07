import { useEffect, useRef, useState } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useClock } from '../../lib/clock'
import { cn } from '../../lib/cn'
import { spring } from '../../lib/motion'
import { bridge } from '../../lib/bridge'
import { useStore } from '../../lib/store'
import { useQueue } from '../../state/derive'
import { artist_of, library, title_of } from '../../state/library'
import { player, skip, toggle_pause } from '../../state/player'
import { open_lyrics, open_page, open_view, ui } from '../../state/ui'
import { IconButton } from '../ui/Button'
import { Cover } from '../ui/Cover'
import { Heart, Home, LayoutGrid, Music2, Pause, Play, Search, SkipForward } from '../ui/icons'
import { root_of, to_top } from '../../state/screens'
import { press } from '../../hooks/press'

/*
 * The window on a phone: one page, and floating over its foot the player and
 * the sections, each a piece of the same glass as the desktop's dock. The
 * page runs on under them, so what scrolls by is seen through them.
 */

// how far into the track, as a hairline along the dock's floor: written into
// the dom by the clock, never a render - and only when it has moved a whole
// pixel, since every write is the window composited again, glass and all
function DockProgress() {
    const length = useStore(player, (s) => s.length)
    const fill = useRef<HTMLSpanElement>(null)
    const drawn = useRef(-1)

    useClock((seconds) => {
        const share = length ? Math.min(seconds / length, 1) : 0
        const step = Math.round(share * (fill.current?.parentElement?.clientWidth ?? 1))
        if (step === drawn.current) return

        drawn.current = step
        if (fill.current) fill.current.style.transform = `translateX(${share * 100 - 100}%)`
    })

    return (
        <span aria-hidden className='pointer-events-none absolute inset-x-7 bottom-[3px] h-0.5 overflow-hidden rounded-full bg-surface-3'>
            <span ref={fill} style={{ transform: 'translateX(-100%)' }} className='block size-full rounded-full bg-accent will-change-transform' />
        </span>
    )
}

// how far a finger has to carry the track, or how fast, before it goes
const SWIPE_FAR = 72
const SWIPE_FAST = 0.45

/*
 * The track in the dock, carried sideways by a finger: let go far enough
 * along, or quickly, and it slides off that way and the next (from the right)
 * or the previous (from the left) slides in after it - the same skip the
 * buttons make. A tap is the player opened; a drag that sets off more up or
 * down than across is nothing of the dock's.
 */
function useSwipe(enabled: boolean, open: () => void) {
    const x = useMotionValue(0)
    const fade = useTransform(x, [-140, 0, 140], [0.15, 1, 0.15])
    const from = useRef<{ x: number; y: number; t: number; axis: 'x' | 'y' | null; id: number } | null>(null)

    const settle = () => void animate(x, 0, spring.snappy)

    const handlers = {
        onPointerDown: (e: React.PointerEvent) => {
            from.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, axis: null, id: e.pointerId }
        },
        onPointerMove: (e: React.PointerEvent) => {
            const start = from.current
            if (!start || start.id !== e.pointerId) return

            const dx = e.clientX - start.x
            const dy = e.clientY - start.y
            if (!start.axis && Math.hypot(dx, dy) > 8) {
                start.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
                if (start.axis === 'x') e.currentTarget.setPointerCapture(e.pointerId)
            }
            // past either end of an empty queue it gives, but only a little
            if (start.axis === 'x') x.set(enabled ? dx : dx * 0.25)
        },
        onPointerUp: (e: React.PointerEvent) => {
            const start = from.current
            from.current = null
            if (!start) return
            if (!start.axis) return open()
            if (start.axis !== 'x') return

            const dx = e.clientX - start.x
            const speed = Math.abs(dx) / Math.max(e.timeStamp - start.t, 1)
            if (!enabled || (Math.abs(dx) < SWIPE_FAR && speed < SWIPE_FAST)) return settle()

            // left is onwards, as a page is turned
            const side = Math.sign(dx)
            const width = e.currentTarget.getBoundingClientRect().width
            void animate(x, side * width, { duration: 0.16, ease: [0.4, 0, 1, 1] }).then(() => {
                skip(side < 0 ? 1 : -1)
                x.set(-side * width * 0.5)
                settle()
            })
        },
        onPointerCancel: () => {
            from.current = null
            settle()
        },
    }

    return { x, fade, handlers }
}

// the player, folded into a capsule above the tabs. the sleeve and the names
// open it whole, or carry the track off sideways to the next; the transport
// answers from where it is
export function Dock() {
    const glass = useStore(ui, (s) => s.glass)
    const current = useStore(player, (s) => s.current)
    const paused = useStore(player, (s) => s.paused)
    const cover = useStore(library, (s) => (current ? s.covers[current] : undefined))
    useStore(library, (s) => (current ? s.meta[current] : undefined))
    const queue = useQueue()
    const swipe = useSwipe(queue.length > 0, () => open_lyrics('player'))

    if (!current) return null

    return (
        <div
            className={cn(
                'fixed inset-x-3 bottom-[calc(var(--safe-bottom)+5.125rem)] z-40 flex h-[3.625rem] items-center gap-0.5 overflow-hidden rounded-full pr-1 pl-[0.4375rem]',
                glass ? 'float thin lens-glass' : 'float',
            )}
        >
            <motion.div
                role='button'
                tabIndex={0}
                aria-label='Open the player'
                onKeyDown={(e) => e.key === 'Enter' && open_lyrics('player')}
                {...swipe.handlers}
                // inline, over the touch rule every [role=button] has
                // (index.css): sideways is the dock's, up and down the page's
                style={{ x: swipe.x, opacity: swipe.fade, touchAction: 'pan-y' }}
                className='flex min-w-0 flex-1 touch-pan-y items-center gap-3 pr-1 text-left'
            >
                <Cover data={cover} size='sm' round className='size-11 shrink-0' icon={16} />
                <span className='min-w-0'>
                    <span className='block truncate text-[0.875rem]'>{title_of(current)}</span>
                    <span className='block truncate text-[0.75rem] text-fg-2'>{artist_of(current)}</span>
                </span>
            </motion.div>
            {/* play and the next track, as every phone's mini player has it: the
                rest of the transport is a swipe away (sideways, the dock skips)
                or a tap away (the player) */}
            <IconButton size='lg' aria-label={paused ? 'Play' : 'Pause'} onClick={() => void toggle_pause()} className='text-fg'>
                {paused ? <Play size={24} /> : <Pause size={24} />}
            </IconButton>
            <IconButton size='lg' aria-label='Next' disabled={!queue.length} onClick={() => skip(1)} className='text-fg'>
                <SkipForward size={20} />
            </IconButton>
            <DockProgress />
        </div>
    )
}

type Tab = { label: string; icon: (props: { size?: number; className?: string }) => React.ReactNode; go: () => void }

// the way spotify orders them: where you start, where you look, what you keep,
// then the two lists of it
const TABS: Tab[] = [
    { label: 'Home', icon: Home, go: () => open_view('library') },
    { label: 'Search', icon: Search, go: () => open_page('search') },
    { label: 'Your library', icon: LayoutGrid, go: () => open_page('library') },
    { label: 'Songs', icon: Music2, go: () => open_view('songs') },
    { label: 'Liked songs', icon: Heart, go: () => open_view('liked') },
]

const SEARCH = 1

// which tab the page on screen belongs to; a playlist, an album or an artist
// is reached from the library, so it lights the library (a mix, from home,
// lights home). settings and the
// profile belong to none
function useTab() {
    return useStore(ui, (s) => {
        if (s.page === 'search') return 1
        if (s.page === 'library') return 2
        if (s.page) return -1
        if (s.view === 'songs') return 3
        if (s.view === 'liked') return 4
        if (s.view === 'library' && !s.selection) return 0
        // a mix is home's
        if (s.view === 'mix') return 0
        return 2
    })
}

/*
 * The sections, as one capsule of glass with the open one under a piece of
 * the glass (a filled button: btn-fill). Going to another tab the piece runs
 * there the way the sidebar's hover glass runs between rows: the edge it
 * travels towards on the quick spring, the one it leaves on the slow one, so
 * on the way it is drawn out long and then pulls itself in.
 */
// the two edges' curves, as a css transition: a spring of motion's was a
// script writing both edges into the style some thirty times over the half
// second after a press (seen on the phone), each one a frame of style and
// layout begun from script. the pace scales a transition as it does a spring
const LEAD = 0.26
const TRAIL = 0.5
const SPRING = 'cubic-bezier(0.3, 1.25, 0.5, 1)'
const SETTLE = 'cubic-bezier(0.25, 1, 0.4, 1)'

export function TabBar() {
    const glass = useStore(ui, (s) => s.glass)
    const at = useTab()

    // the screens are kept (layout/Screens), so a tab is gone to in the frame
    // of the press: no frame held back for the glass to set off first. the
    // tab already open, pressed again, goes back to its top. a press is taken
    // even while the page under the bar is still flung (hooks/press)
    const go = (i: number) => (i === at ? to_top() : TABS[i].go())
    // which way the piece last went: the tab before is kept as state and
    // moved on during the render that sees a new one
    const [last, set_last] = useState(at)
    const [towards, set_towards] = useState(0)
    if (at >= 0 && at !== last) {
        if (last >= 0) set_towards(Math.sign(at - last))
        set_last(at)
    }

    const share = 100 / TABS.length

    return (
        <nav
            aria-label='Sections'
            className={cn(
                'fixed inset-x-3 bottom-[calc(var(--safe-bottom)+0.75rem)] z-40 h-[3.875rem] rounded-full p-[0.3125rem]',
                glass ? 'float thin lens-glass' : 'float',
            )}
        >
            <div className='relative grid h-full grid-cols-5'>
                {at >= 0 && (
                    <span
                        aria-hidden
                        style={{
                            left: `${at * share}%`,
                            right: `${(TABS.length - 1 - at) * share}%`,
                            transitionProperty: 'left, right',
                            transitionDuration: towards > 0 ? `${TRAIL}s, ${LEAD}s` : `${LEAD}s, ${TRAIL}s`,
                            transitionTimingFunction: towards > 0 ? `${SETTLE}, ${SPRING}` : `${SPRING}, ${SETTLE}`,
                        }}
                        className='btn btn-fill pointer-events-none absolute inset-y-0 rounded-full bg-[color-mix(in_oklab,var(--fg)_10%,transparent)]'
                    />
                )}
                {TABS.map((tab, i) => {
                    const Glyph = tab.icon

                    return (
                        <button
                            key={tab.label}
                            type='button'
                            aria-label={tab.label}
                            aria-current={i === at ? 'page' : undefined}
                            {...press(() => go(i))}
                            className={cn('relative z-10 grid place-items-center rounded-full transition-colors', i === at ? 'text-fg' : 'text-fg-2')}
                        >
                            <Glyph size={24} className={cn(i === at && i !== SEARCH && 'fill-current')} />
                        </button>
                    )
                })}
            </div>
        </nav>
    )
}

/*
 * Android's back, which the app sends as escape: what is open over the page
 * closes first (a sheet, a dialog, the player - each listens for escape on
 * its own), and with nothing open the page goes back to the one before it,
 * as a phone's back does everywhere. Run in capture, before those close
 * themselves, so it sees whether anything was open.
 *
 * The tabs are not a history (Material's bottom navigation, and Spotify's and
 * YouTube Music's own): a tab is where the way back starts again, back on a
 * tab other than home goes home, and back on home leaves - the app goes to
 * the background, as Android puts a launcher's app away, and the music plays on.
 */
type Place = { page: string | null; view: string; selection: string | null }

export function Back() {
    useBack()
    return null
}

function useBack() {
    useEffect(() => {
        const trail: Place[] = []
        let last: Place = { page: ui.get().page, view: ui.get().view, selection: ui.get().selection }
        let going_back = false

        const stop = ui.subscribe(() => {
            const s = ui.get()
            const now = { page: s.page, view: s.view, selection: s.selection }
            if (now.page === last.page && now.view === last.view && now.selection === last.selection) return
            if (root_of(s)) trail.length = 0
            else if (!going_back) trail.push(last)
            if (trail.length > 50) trail.shift()
            last = now
        })

        const on_key = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return
            const s = ui.get()
            if (s.lyrics_open || s.menu || s.editing || s.retitling || s.picking || s.profile_edit || s.crop || s.info_open) return
            if (document.querySelector('[role="menu"], [role="dialog"]')) return
            // a section of settings goes back to the list of them first
            if (document.querySelector('[data-subpage]')) return

            const to = trail.pop()
            // nothing before this screen: home, or out of the app from home itself
            if (!to && root_of(s) === 'home') return void bridge().leave?.()
            going_back = true
            ui.set(to ? { page: to.page as never, view: to.view as never, selection: to.selection } : { page: null, view: 'library', selection: null })
            going_back = false
        }

        window.addEventListener('keydown', on_key, { capture: true })
        return () => {
            stop()
            window.removeEventListener('keydown', on_key, { capture: true })
        }
    }, [])
}

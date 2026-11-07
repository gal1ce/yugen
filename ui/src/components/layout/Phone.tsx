import { useEffect, useRef, useState } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'motion/react'
import { useClock } from '../../lib/clock'
import { cn } from '../../lib/cn'
import { spring } from '../../lib/motion'
import { useStore } from '../../lib/store'
import { useQueue } from '../../state/derive'
import { artist_of, library, title_of } from '../../state/library'
import { next_shuffle, player, shuffle_into, skip, toggle_pause } from '../../state/player'
import { SHUFFLES } from '../../lib/prefs'
import { open_lyrics, open_page, open_view, ui } from '../../state/ui'
import { IconButton } from '../ui/Button'
import { Cover } from '../ui/Cover'
import { Heart, Home, LayoutGrid, Music2, Pause, Play, Search, Shuffle, SkipBack, SkipForward } from '../ui/icons'
import { QuickLook } from './Look'
import { Brand, ProfileMenu, SearchBox } from './TopBar'

/*
 * The window on a phone: one page, and floating over its foot the player and
 * the sections, each a piece of the same glass as the desktop's dock. The
 * page runs on under them, so what scrolls by is seen through them.
 */

// the head of the page: the name, the look, and the profile (settings are in
// its menu, as on the desktop). the search is a section of its own down in the
// tabs. by default it is the top of the page and goes up with it; floating (a
// setting) it stays, and once the page is under it a ground comes up behind it
// - a smoke of the page's own colour, not a frost: on a phone every backdrop
// is another pass over the screen each frame the page moves
export function PhoneBar({ floating = false }: { floating?: boolean }) {
    return (
        <header
            data-floating={floating || undefined}
            className='phone-bar absolute inset-x-0 top-0 z-30 flex h-[calc(var(--safe-top)+4.25rem)] items-center justify-between px-3 pt-[calc(var(--safe-top)+0.5rem)]'
        >
            <Brand />
            <div className='flex items-center gap-1'>
                <QuickLook large />
                <ProfileMenu />
            </div>
        </header>
    )
}

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
    const shuffle = useStore(player, (s) => s.shuffle_mode)
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
            <IconButton
                size='md'
                aria-label={SHUFFLES.find((o) => o.id === shuffle)?.label}
                aria-pressed={shuffle !== 'off'}
                disabled={!queue.length}
                onClick={() => void shuffle_into(next_shuffle())}
                className={cn('relative', shuffle !== 'off' ? 'text-accent' : 'text-fg-2')}
            >
                <Shuffle size={17} />
                {shuffle === 'all' && <span className='absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-accent' />}
            </IconButton>
            <IconButton size='md' aria-label='Previous' disabled={!queue.length} onClick={() => skip(-1)} className='text-fg'>
                <SkipBack size={18} />
            </IconButton>
            <IconButton size='md' aria-label={paused ? 'Play' : 'Pause'} onClick={() => void toggle_pause()} className='text-fg'>
                {paused ? <Play size={20} /> : <Pause size={20} />}
            </IconButton>
            <IconButton size='md' aria-label='Next' disabled={!queue.length} onClick={() => skip(1)} className='text-fg'>
                <SkipForward size={18} />
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
// is reached from the library, so it lights the library. settings and the
// profile belong to none
function useTab() {
    return useStore(ui, (s) => {
        if (s.page === 'search') return 1
        if (s.page === 'library') return 2
        if (s.page) return -1
        if (s.view === 'songs') return 3
        if (s.view === 'liked') return 4
        if (s.view === 'library' && !s.selection) return 0
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
export function TabBar() {
    const glass = useStore(ui, (s) => s.glass)
    const shown = useTab()
    // the tab pressed, ahead of the page: the glass sets off under the finger
    // in the frame of the press, and the page is built in the one after
    const [pressed, set_pressed] = useState<number | null>(null)
    const at = pressed ?? shown
    useEffect(() => set_pressed(null), [shown])

    const go = (i: number) => {
        set_pressed(i)
        requestAnimationFrame(() => setTimeout(TABS[i].go, 0))
    }
    const last = useRef(at)
    const towards = at >= 0 && last.current >= 0 ? Math.sign(at - last.current) : 0
    if (at >= 0) last.current = at

    const share = 100 / TABS.length
    const lead = spring.snappy
    const trail = spring.sheet

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
                    <motion.span
                        aria-hidden
                        initial={false}
                        animate={{ left: `${at * share}%`, right: `${(TABS.length - 1 - at) * share}%` }}
                        transition={{ left: towards > 0 ? trail : lead, right: towards > 0 ? lead : trail }}
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
                            onClick={() => go(i)}
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

export { PhoneLibrary as LibraryPage } from '../pages/PhoneLibrary'

export function SearchPage() {
    return (
        <div>
            <h1 className='mb-5 font-serif text-[2.25rem] leading-tight font-medium'>Search</h1>
            <SearchBox inline />
        </div>
    )
}

/*
 * Android's back, which the app sends as escape: what is open over the page
 * closes first (a sheet, a dialog, the player - each listens for escape on
 * its own), and with nothing open the page goes back to the one before it,
 * as a phone's back does everywhere. Run in capture, before those close
 * themselves, so it sees whether anything was open.
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
            if (!going_back) trail.push(last)
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
            if (!to) return
            going_back = true
            ui.set({ page: to.page as never, view: to.view as never, selection: to.selection })
            going_back = false
        }

        window.addEventListener('keydown', on_key, { capture: true })
        return () => {
            stop()
            window.removeEventListener('keydown', on_key, { capture: true })
        }
    }, [])
}

import { useRef } from 'react'
import { motion } from 'motion/react'
import { useClock } from '../../lib/clock'
import { cn } from '../../lib/cn'
import { spring } from '../../lib/motion'
import { useStore } from '../../lib/store'
import { tip } from '../../lib/tip'
import { useQueue } from '../../state/derive'
import { artist_of, fetch_songs, library, title_of } from '../../state/library'
import { new_playlist } from '../../state/playlists'
import { player, skip, toggle_pause } from '../../state/player'
import { context, open_lyrics, open_page, open_view, ui } from '../../state/ui'
import { IconButton } from '../ui/Button'
import { Cover } from '../ui/Cover'
import { Heart, Home, LayoutGrid, Music2, Pause, Play, Plus, RefreshCw, Search, SkipForward } from '../ui/icons'
import { Spin } from '../ui/Spin'
import { QuickLook } from './Look'
import { Nav, Shelves } from './Sidebar'
import { Brand, ProfileMenu, SearchBox } from './TopBar'

/*
 * The window on a phone: one page, and floating over its foot the player and
 * the sections, each a piece of the same glass as the desktop's dock. The
 * page runs on under them, so what scrolls by is seen through them.
 */

// the head of the page: the name, the look, and the profile (settings are in
// its menu, as on the desktop). the search is a section of its own down in the tabs
export function PhoneBar() {
    return (
        <header className='absolute inset-x-0 top-0 z-30 flex h-[calc(var(--safe-top)+4.25rem)] items-center justify-between px-3 pt-[calc(var(--safe-top)+0.5rem)]'>
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

// the player, folded into a capsule above the tabs. the sleeve and the names
// open it whole; play and next answer from where they are
export function Dock() {
    const glass = useStore(ui, (s) => s.glass)
    const current = useStore(player, (s) => s.current)
    const paused = useStore(player, (s) => s.paused)
    const cover = useStore(library, (s) => (current ? s.covers[current] : undefined))
    useStore(library, (s) => (current ? s.meta[current] : undefined))
    const queue = useQueue()

    if (!current) return null

    return (
        <div
            className={cn(
                'fixed inset-x-3 bottom-[calc(var(--safe-bottom)+5.125rem)] z-40 flex h-[3.625rem] items-center gap-3 rounded-full pr-1.5 pl-[0.4375rem]',
                glass ? 'float thin lens-glass' : 'float',
            )}
            onContextMenu={context({ kind: 'song', song: current })}
        >
            <button type='button' onClick={() => open_lyrics('player')} className='flex min-w-0 flex-1 items-center gap-3 text-left' aria-label='Open the player'>
                <Cover data={cover} size='sm' round className='size-11 shrink-0' icon={16} />
                <span className='min-w-0'>
                    <span className='block truncate text-[0.875rem]'>{title_of(current)}</span>
                    <span className='block truncate text-[0.75rem] text-fg-2'>{artist_of(current)}</span>
                </span>
            </button>
            <IconButton size='lg' {...tip(paused ? 'Play' : 'Pause')} onClick={() => void toggle_pause()} className='text-fg'>
                {paused ? <Play size={18} /> : <Pause size={18} />}
            </IconButton>
            <IconButton size='lg' {...tip('Next')} disabled={!queue.length} onClick={() => skip(1)} className='text-fg'>
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
    const at = useTab()
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
                            onClick={tab.go}
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

// the sidebar, as a page: the four ways into the library, then the playlists,
// albums and artists
export function LibraryPage() {
    const loading = useStore(library, (s) => s.loading)

    return (
        <div onContextMenu={context({ kind: 'sidebar' })}>
            <h1 className='mb-5 font-serif text-[2.25rem] leading-tight font-medium'>Your library</h1>
            <Nav />

            <div className='mt-7 mb-2 flex items-center gap-1 pl-1'>
                <span className='flex-1 text-[0.8125rem] text-muted'>Collections</span>
                <IconButton {...tip('New playlist')} onClick={() => void new_playlist()}>
                    <Plus size={18} />
                </IconButton>
            </div>
            <div className='flex flex-col'>
                <Shelves />
            </div>

            <button
                type='button'
                onClick={() => void fetch_songs()}
                disabled={loading}
                className='mt-2 flex h-11 items-center gap-2.5 px-1 text-[0.875rem] text-muted transition-colors hover:text-fg disabled:opacity-60'
            >
                <Spin on={loading}><RefreshCw size={16} /></Spin>
                {loading ? 'Scanning' : 'Rescan library'}
            </button>
        </div>
    )
}

export function SearchPage() {
    return (
        <div>
            <h1 className='mb-5 font-serif text-[2.25rem] leading-tight font-medium'>Search</h1>
            <SearchBox inline />
        </div>
    )
}

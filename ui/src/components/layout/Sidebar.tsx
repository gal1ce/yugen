import { useCallback, useState, type ReactNode } from 'react'
import { Disc3, Heart, Home, LayoutGrid, ListMusic, Mic2, Music2, Pin, Plus, RefreshCw } from '../ui/icons'
import { useDismiss } from '../../hooks/dismiss'
import { cn } from '../../lib/cn'
import { collate } from '../../lib/names'
import { LIBRARY_VIEWS, SHELVES, save_pref, type LibraryView, type Shelf, type View } from '../../lib/prefs'
import { useStore } from '../../lib/store'
import { albums_of, artists_of, group_art, playlist_art, playlist_names_of, useAlbums, useArtists, useLikedSongs } from '../../state/derive'
import { fetch_songs, library } from '../../state/library'
import { new_playlist } from '../../state/playlists'
import { context, open_group, open_playlist, open_view, set_pref, ui } from '../../state/ui'
import { Scroll } from '../ui/Scroll'
import { spring } from '../../lib/motion'
import { motion } from 'motion/react'
import { IconButton } from '../ui/Button'
import { Cover } from '../ui/Cover'
import { MenuItem, MenuLabel, MenuPanel } from '../ui/Menu'
import { tip } from '../../lib/tip'
import { Spin } from '../ui/Spin'
import { HoverGlass } from '../ui/HoverGlass'
import { Brand, PanelToggle } from './TopBar'

type Row = { kind: Shelf; name: string; count: number; pinned: boolean }

function NavItem({ id, label, icon: Glyph, count }: { id: View; label: string; icon: (props: { size?: number }) => ReactNode; count: number }) {
    const active = useStore(ui, (s) => s.view === id && !s.page && !(s.selection && (id === 'albums' || id === 'artists')))

    return (
        <button
            type='button'
            data-hover
            aria-current={active ? 'page' : undefined}
            onClick={() => open_view(id)}
            className={cn('relative flex h-(--row-nav) w-full items-center gap-2.5 rounded-[min(var(--r-control),1.25rem)] px-3 text-[0.875rem] transition-colors', active ? 'text-fg' : 'text-fg-2 hover:text-fg')}
        >
            {/* one pill and its needle, sliding between the rows on a spring */}
            {active && <motion.span layoutId='nav-active' transition={spring.snappy} className='needle absolute inset-0 rounded-[min(var(--r-control),1.25rem)] bg-surface-2 shadow-[inset_0_0_0_1px_var(--line)]' />}
            <span className={cn('relative grid w-4 place-items-center', active ? 'text-fg' : 'text-muted')}>
                <Glyph size={16} />
            </span>
            <span className='relative flex-1 truncate text-left'>{label}</span>
            <span className='relative font-mono text-[0.6875rem] text-muted tabular-nums'>{count}</span>
        </button>
    )
}

export function Nav() {
    const songs = useStore(library, (s) => s.songs.length)
    const liked = useLikedSongs().length
    const albums = useAlbums().size
    const artists = useArtists().size

    return (
        <nav className='relative space-y-0.5'>
            {/* the hover: one piece of glass that peels off the open row */}
            <HoverGlass className='rounded-[min(var(--r-control),1.25rem)]' />
            <NavItem id='library' label='Home' icon={Home} count={songs} />
            <NavItem id='songs' label='Songs' icon={Music2} count={songs} />
            <NavItem id='liked' label='Liked songs' icon={Heart} count={liked} />
            <NavItem id='albums' label='Albums' icon={Disc3} count={albums} />
            <NavItem id='artists' label='Artists' icon={Mic2} count={artists} />
        </nav>
    )
}

// a playlist's own sleeve or the first cover inside it; an album's or an
// artist's off the first of its tracks that has one
function RowArt({ row, className }: { row: Row; className: string }) {
    const data = useStore(library, (s) => {
        if (row.kind === 'playlists') return playlist_art(row.name)

        const groups = row.kind === 'albums' ? albums_of(s.songs, s.meta) : artists_of(s.songs, s.meta)
        return group_art(groups.get(row.name) ?? [])
    })

    return <Cover data={data} size='sm' round={row.kind === 'artists'} className={className} icon={14} />
}

function RowButton({ row, view }: { row: Row; view: LibraryView }) {
    const active = useStore(ui, (s) => !s.page && s.selection === row.name && s.view === (row.kind === 'playlists' ? 'playlist' : row.kind))
    const open = () => (row.kind === 'playlists' ? open_playlist(row.name) : open_group(row.kind as 'albums' | 'artists', row.name))
    const menu = row.kind === 'playlists' ? context({ kind: 'playlist', playlist: row.name }) : undefined

    if (view === 'grid' || view === 'compact-grid') {
        return (
            <button type='button' {...tip(row.name)} onClick={open} onContextMenu={menu} className='group min-w-0 text-left'>
                <span className={cn('block rounded-(--r-cover) outline-2 outline-offset-2 transition-[outline-color]', active ? 'outline-accent' : 'outline-transparent group-hover:outline-line-strong', row.kind === 'artists' && 'rounded-full')}>
                    <RowArt row={row} className='aspect-square w-full' />
                </span>
                {view === 'grid' && <p className={cn('mt-1.5 truncate text-[0.75rem]', active ? 'text-fg' : 'text-muted')}>{row.name}</p>}
            </button>
        )
    }

    return (
        <button
            type='button'
            data-hover
            aria-current={active ? 'page' : undefined}
            onClick={open}
            onContextMenu={menu}
            className={cn(
                'relative flex w-full items-center gap-2.5 rounded-[min(var(--r-control),1.25rem)] text-left transition-colors',
                view === 'list' ? 'h-12 px-2' : 'h-(--row-nav) px-3',
                active ? 'needle bg-surface-2 text-fg' : 'text-fg-2 hover:text-fg',
            )}
        >
            {view === 'list' ? (
                <RowArt row={row} className='size-8' />
            ) : (
                <span className={cn('grid w-4 place-items-center', active ? 'text-fg' : 'text-muted')}>
                    {row.kind === 'albums' ? <Disc3 size={16} /> : row.kind === 'artists' ? <Mic2 size={16} /> : <ListMusic size={16} />}
                </span>
            )}
            <span className='min-w-0 flex-1'>
                <span className='block truncate text-[0.875rem]'>{row.name}</span>
                {view === 'list' && (
                    <span className='block truncate text-[0.75rem] text-muted'>
                        {row.kind === 'playlists' ? 'Playlist' : row.kind === 'albums' ? 'Album' : 'Artist'} · <span className='font-mono text-[0.6875rem]'>{row.count}</span>
                    </span>
                )}
            </span>
            {row.pinned && <Pin size={12} className='shrink-0 text-muted' />}
            {view === 'compact' && <span className='font-mono text-[0.6875rem] text-muted tabular-nums'>{row.count}</span>}
        </button>
    )
}

function ViewMenu() {
    const [open, set_open] = useState(false)
    const view = useStore(ui, (s) => s.library_view)
    const close = useCallback(() => set_open(false), [])

    useDismiss(open, close)

    return (
        <div className='relative'>
            <IconButton size='sm' {...tip('View as')} onClick={() => set_open(!open)} className={open ? 'bg-surface-2 text-fg' : ''}>
                <LayoutGrid size={16} />
            </IconButton>
            {open && (
                <MenuPanel className='absolute top-full right-0 mt-1'>
                    <MenuLabel>View as</MenuLabel>
                    {LIBRARY_VIEWS.map((option) => (
                        <MenuItem key={option.id} checked={view === option.id} onClick={() => set_pref('library_view', option.id)}>
                            {option.label}
                        </MenuItem>
                    ))}
                </MenuPanel>
            )}
        </div>
    )
}

export function Shelves() {
    const shelves = useStore(ui, (s) => s.shelves)
    const view = useStore(ui, (s) => s.library_view)
    const pins = useStore(ui, (s) => s.pins)
    const playlists = useStore(library, (s) => s.playlists)
    const albums = useAlbums()
    const artists = useArtists()

    // nothing ticked is the list this section has always been: playlists alone
    const shown = shelves.length ? shelves : (['playlists'] as Shelf[])

    const grouped = (kind: Shelf, groups: Map<string, string[]>): Row[] =>
        [...groups].sort(([a], [b]) => collate(a, b)).map(([name, tracks]) => ({ kind, name, count: tracks.length, pinned: false }))

    const rows: Row[] = [
        ...(shown.includes('playlists')
            ? playlist_names_of(playlists, pins).map((name) => ({ kind: 'playlists' as const, name, count: playlists[name].length, pinned: pins.includes(name) }))
            : []),
        ...(shown.includes('albums') ? grouped('albums', albums) : []),
        ...(shown.includes('artists') ? grouped('artists', artists) : []),
    ]

    const toggle = (id: Shelf) => {
        const next = shelves.includes(id) ? shelves.filter((s) => s !== id) : [...shelves, id]
        ui.set({ shelves: next })
        save_pref('shelves', next)
    }

    return (
        <>
            <div className='flex gap-1 px-1 pb-2'>
                {SHELVES.map((option) => (
                    <button
                        key={option.id}
                        type='button'
                        aria-pressed={shelves.includes(option.id)}
                        onClick={() => toggle(option.id)}
                        className={cn(
                            // on, a chip is a filled button (glass, with liquid glass on); off, it is just its word
                            'btn h-7 shrink-0 rounded-(--r-control) px-3 text-[0.8125rem] transition-colors',
                            shelves.includes(option.id) ? 'btn-fill bg-surface-3 text-fg' : 'text-muted hover:bg-surface-2 hover:text-fg',
                        )}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            <Scroll className='-mx-1 flex-1' inner='px-1 pb-2'>
                {rows.length ? (
                    <div className={view === 'grid' ? 'grid grid-cols-2 gap-3 p-1' : view === 'compact-grid' ? 'grid grid-cols-3 gap-2 p-1' : 'relative space-y-0.5'}>
                        {/* the rows' hover, as in the nav above; the covers of a grid keep their ring */}
                        {(view === 'list' || view === 'compact') && <HoverGlass className='rounded-[min(var(--r-control),1.25rem)]' />}
                        {rows.map((row) => <RowButton key={`${row.kind}:${row.name}`} row={row} view={view} />)}
                    </div>
                ) : (
                    <p className='px-3 py-6 text-[0.8125rem] text-muted'>
                        {shelves.length && !shelves.includes('playlists') ? 'Nothing to show yet' : 'No playlists yet. Make one with the + above.'}
                    </p>
                )}
            </Scroll>
        </>
    )
}

export function Sidebar() {
    const loading = useStore(library, (s) => s.loading)
    const hidden = useStore(ui, (s) => s.sidebar_hidden)

    return (
        <aside
            inert={hidden}
            onContextMenu={context({ kind: 'sidebar' })}
            className={cn('panel flex min-h-0 flex-col overflow-hidden rounded-(--r-panel) transition-opacity duration-200', hidden ? 'invisible p-0 opacity-0' : 'p-2.5')}
        >
            <div className='mb-3 flex h-11 shrink-0 items-center justify-between pr-0.5 pl-1'>
                <Brand />
                <PanelToggle side='sidebar' />
            </div>
            <Nav />

            <div className='mt-6 mb-2 flex items-center gap-1 pr-1 pl-3'>
                <span className='flex-1 text-[0.8125rem] text-muted'>Your library</span>
                <IconButton size='sm' {...tip('New playlist')} onClick={() => void new_playlist()}>
                    <Plus size={16} />
                </IconButton>
                <ViewMenu />
            </div>

            <Shelves />

            <button
                type='button'
                onClick={() => void fetch_songs()}
                disabled={loading}
                className='my-2 flex h-8 shrink-0 items-center gap-2.5 rounded-[min(var(--r-control),1.25rem)] px-3 text-[0.8125rem] text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-60'
            >
                <Spin on={loading}><RefreshCw size={16} /></Spin>
                {loading ? 'Scanning' : 'Rescan library'}
            </button>
        </aside>
    )
}

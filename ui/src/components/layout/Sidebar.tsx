import { useCallback, useState, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { Disc3, Heart, Home, LayoutGrid, ListMusic, Mic2, Music2, PanelLeftClose, Pin, Plus, RefreshCw } from '../ui/icons'
import { sideways } from '../../hooks/glide'
import { useDismiss } from '../../hooks/dismiss'
import { cn } from '../../lib/cn'
import { collate } from '../../lib/names'
import { LIBRARY_VIEWS, SHELVES, save_pref, type LibraryView, type Shelf, type View } from '../../lib/prefs'
import { useStore } from '../../lib/store'
import { albums_of, artists_of, group_art, playlist_art, playlist_names_of, useAlbums, useArtists, useLikedSongs } from '../../state/derive'
import { fetch_songs, library } from '../../state/library'
import { new_playlist } from '../../state/playlists'
import { context, open_group, open_playlist, open_view, set_pref, ui } from '../../state/ui'
import { IconButton } from '../ui/Button'
import { Cover } from '../ui/Cover'
import { MenuItem, MenuLabel, MenuPanel } from '../ui/Menu'
import { tip } from '../../lib/tip'

type Row = { kind: Shelf; name: string; count: number; pinned: boolean }

function NavItem({ id, label, icon: Glyph, count }: { id: View; label: string; icon: (props: { size?: number; weight?: 'regular' | 'duotone' }) => ReactNode; count: number }) {
    const active = useStore(ui, (s) => s.view === id && !s.page && !(s.selection && (id === 'albums' || id === 'artists')))

    return (
        <button
            type='button'
            onClick={() => open_view(id)}
            className={cn(
                'relative flex h-9 w-full items-center gap-3 rounded-xl px-3 text-[0.82rem] transition-colors',
                active ? 'text-fg' : 'text-muted hover:bg-surface-2/60 hover:text-fg',
            )}
        >
            {/* one pill, travelling between the rows rather than blinking on and off */}
            {active && (
                <motion.span layoutId='nav-pill' transition={{ type: 'spring', stiffness: 420, damping: 36 }} className='absolute inset-0 rounded-xl bg-surface-2'>
                    <span className='absolute top-2 bottom-2 left-0 w-[3px] rounded-full bg-accent' />
                </motion.span>
            )}
            <span className={cn('relative', active && 'text-accent')}>
                <Glyph size={17} weight={active ? 'duotone' : 'regular'} />
            </span>
            <span className='relative flex-1 truncate text-left'>{label}</span>
            <span className='relative text-[0.7rem] text-muted tabular-nums'>{count}</span>
        </button>
    )
}

function Nav() {
    const songs = useStore(library, (s) => s.songs.length)
    const liked = useLikedSongs().length
    const albums = useAlbums().size
    const artists = useArtists().size

    return (
        <nav className='space-y-0.5'>
            <NavItem id='library' label='Home' icon={Home} count={songs} />
            <NavItem id='songs' label='Songs' icon={Music2} count={songs} />
            <NavItem id='liked' label='Liked Songs' icon={Heart} count={liked} />
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
                <span className={cn('block rounded-xl ring-2 transition-[box-shadow]', active ? 'ring-accent' : 'ring-transparent group-hover:ring-line-strong', row.kind === 'artists' && 'rounded-full')}>
                    <RowArt row={row} className='aspect-square w-full' />
                </span>
                {view === 'grid' && <p className={cn('mt-1.5 truncate text-xs', active ? 'text-accent' : 'text-muted')}>{row.name}</p>}
            </button>
        )
    }

    return (
        <button
            type='button'
            onClick={open}
            onContextMenu={menu}
            className={cn(
                'flex w-full items-center gap-3 rounded-xl px-2 text-left transition-colors',
                view === 'list' ? 'h-12' : 'h-9 px-3',
                active ? 'bg-surface-2 text-fg' : 'text-muted hover:bg-surface-2/60 hover:text-fg',
            )}
        >
            {view === 'list' ? (
                <RowArt row={row} className='size-9' />
            ) : (
                <span className={active ? 'text-accent' : ''}>
                    {row.kind === 'albums' ? <Disc3 size={15} /> : row.kind === 'artists' ? <Mic2 size={15} /> : <ListMusic size={15} />}
                </span>
            )}
            <span className='min-w-0 flex-1'>
                <span className={cn('block truncate text-[0.82rem]', active && 'text-fg')}>{row.name}</span>
                {view === 'list' && (
                    <span className='block text-[0.7rem] text-muted'>
                        {row.kind === 'playlists' ? 'Playlist' : row.kind === 'albums' ? 'Album' : 'Artist'} · {row.count}
                    </span>
                )}
            </span>
            {row.pinned && <Pin size={12} className='shrink-0 fill-current text-accent' />}
            {view === 'compact' && <span className='text-[0.7rem] text-muted tabular-nums'>{row.count}</span>}
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
            <IconButton size='sm' variant={open ? 'on' : 'plain'} {...tip('View as')} onClick={() => set_open(!open)}>
                <LayoutGrid size={14} />
            </IconButton>
            {open && (
                <MenuPanel className='absolute top-full right-0 mt-2'>
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

function Shelves() {
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
            <div ref={sideways} className='flex gap-1.5 overflow-x-auto px-1 pb-3'>
                {SHELVES.map((option) => (
                    <button
                        key={option.id}
                        type='button'
                        onClick={() => toggle(option.id)}
                        className={cn(
                            'h-7 shrink-0 rounded-full border px-3 text-xs transition-colors',
                            shelves.includes(option.id) ? 'border-accent/40 bg-accent/12 text-accent' : 'border-line text-muted hover:border-line-strong hover:text-fg',
                        )}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            <div className='-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-2'>
                {rows.length ? (
                    <div className={view === 'grid' ? 'grid grid-cols-2 gap-3' : view === 'compact-grid' ? 'grid grid-cols-3 gap-2' : 'space-y-0.5'}>
                        {rows.map((row) => <RowButton key={`${row.kind}:${row.name}`} row={row} view={view} />)}
                    </div>
                ) : (
                    <p className='px-3 py-6 text-center text-xs text-muted'>
                        {shelves.length && !shelves.includes('playlists') ? 'Nothing to show here yet.' : 'No playlists yet. Make one with the + above.'}
                    </p>
                )}
            </div>
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
            className={cn('edge flex min-h-0 flex-col overflow-hidden rounded-2xl bg-surface transition-opacity duration-300', hidden ? 'invisible p-0 opacity-0' : 'p-3')}
        >
            <div className='mb-4 flex items-center justify-between px-1'>
                <span className='text-[0.68rem] font-medium tracking-wide text-muted uppercase'>Browse</span>
                <IconButton size='sm' {...tip('Hide sidebar')} onClick={() => set_pref('sidebar_hidden', true)}>
                    <PanelLeftClose size={15} />
                </IconButton>
            </div>

            <Nav />

            <div className='mt-6 mb-3 flex items-center gap-1 px-1'>
                <span className='flex-1 text-[0.68rem] font-medium tracking-wide text-muted uppercase'>Your library</span>
                <IconButton size='sm' {...tip('New playlist')} onClick={() => void new_playlist()}>
                    <Plus size={15} />
                </IconButton>
                <ViewMenu />
            </div>

            <Shelves />

            <button
                type='button'
                onClick={() => void fetch_songs()}
                disabled={loading}
                className='mt-2 flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-60'
            >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Scanning…' : 'Refresh library'}
            </button>
        </aside>
    )
}

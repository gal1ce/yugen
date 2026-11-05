import { useMemo, useState } from 'react'
import { cn } from '../../lib/cn'
import { collate } from '../../lib/names'
import { save_pref, stored_pref } from '../../lib/prefs'
import { useStore } from '../../lib/store'
import { group_art, playlist_art, useAlbums, useArtists, useLikedSongs } from '../../state/derive'
import { added_of, fetch_songs, library } from '../../state/library'
import { new_playlist } from '../../state/playlists'
import { open_group, open_playlist, open_view, ui } from '../../state/ui'
import { Cover } from '../ui/Cover'
import { More } from '../ui/More'
import { Spin } from '../ui/Spin'
import { ArrowsDownUp, Heart, LayoutGrid, ListMusic, Music2, Pin, Plus, RefreshCw, Rows, Search, X } from '../ui/icons'

/*
 * Your library, on a phone: everything kept, in one list that is narrowed
 * rather than navigated. The two collections every library has stand at the
 * head as tiles; under them the playlists, albums and artists run together,
 * filtered by the chips, sorted by the button beside them, searched by name,
 * as rows or as a wall of sleeves. Pinned playlists come first whatever the
 * sort says, the way the sidebar keeps them on a desktop.
 */

const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'playlists', label: 'Playlists' },
    { id: 'albums', label: 'Albums' },
    { id: 'artists', label: 'Artists' },
] as const
type Filter = (typeof FILTERS)[number]['id']

const SORTS = [
    { id: 'recent', label: 'Recently added' },
    { id: 'alpha', label: 'A to Z' },
    { id: 'size', label: 'Most tracks' },
] as const
type Sort = (typeof SORTS)[number]['id']

type Item = { kind: 'playlists' | 'albums' | 'artists'; name: string; tracks: string[]; pinned: boolean; recent: number }

const KIND_LABEL = { playlists: 'Playlist', albums: 'Album', artists: 'Artist' }

// the newest track in it stands for when it was last added to
const newest = (tracks: string[]) => tracks.reduce((most, track) => Math.max(most, added_of(track)), 0)

function useItems(filter: Filter, sort: Sort, query: string) {
    const playlists = useStore(library, (s) => s.playlists)
    useStore(library, (s) => s.meta)
    const pins = useStore(ui, (s) => s.pins)
    const albums = useAlbums()
    const artists = useArtists()

    return useMemo(() => {
        const items: Item[] = []
        const take = (kind: Filter) => filter === 'all' || filter === kind

        if (take('playlists')) {
            for (const [name, tracks] of Object.entries(playlists)) items.push({ kind: 'playlists', name, tracks, pinned: pins.includes(name), recent: newest(tracks) })
        }
        if (take('albums')) for (const [name, tracks] of albums) items.push({ kind: 'albums', name, tracks, pinned: false, recent: newest(tracks) })
        if (take('artists')) for (const [name, tracks] of artists) items.push({ kind: 'artists', name, tracks, pinned: false, recent: newest(tracks) })

        const needle = query.trim().toLocaleLowerCase()
        const found = needle ? items.filter((item) => item.name.toLocaleLowerCase().includes(needle)) : items

        const by = (a: Item, b: Item) => (sort === 'alpha' ? collate(a.name, b.name) : sort === 'size' ? b.tracks.length - a.tracks.length : b.recent - a.recent) || collate(a.name, b.name)

        return found.sort((a, b) => (a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : a.pinned ? pins.indexOf(a.name) - pins.indexOf(b.name) : by(a, b)))
    }, [playlists, pins, albums, artists, filter, sort, query])
}

const open = (item: Item) => (item.kind === 'playlists' ? open_playlist(item.name) : open_group(item.kind, item.name))

function Art({ item, className }: { item: Item; className: string }) {
    const data = useStore(library, () => (item.kind === 'playlists' ? playlist_art(item.name) : group_art(item.tracks)))
    return <Cover data={data} size='md' round={item.kind === 'artists'} icon={20} className={className} />
}

function Row({ item }: { item: Item }) {
    const n = item.tracks.length

    return (
        <div className='-mx-2 flex h-[4.6rem] items-center rounded-xl pl-2 active:bg-surface-2'>
            <button type='button' onClick={() => open(item)} className='flex min-w-0 flex-1 items-center gap-3.5 text-left'>
                <Art item={item} className='size-[3.6rem] shrink-0 shadow-[0_10px_20px_-14px_rgb(0_0_0/0.8)]' />
                <span className='min-w-0'>
                    <span className='block truncate text-[1.0625rem] text-fg'>{item.name}</span>
                    <span className='flex items-center gap-1.5 truncate text-[0.875rem] text-muted'>
                        {item.pinned && <Pin size={12} className='shrink-0 text-accent' />}
                        {KIND_LABEL[item.kind]} · {n} {n === 1 ? 'track' : 'tracks'}
                    </span>
                </span>
            </button>
            {item.kind === 'playlists' && <More target={{ kind: 'playlist', playlist: item.name }} />}
        </div>
    )
}

function Tile({ item }: { item: Item }) {
    return (
        <button type='button' onClick={() => open(item)} className='min-w-0 text-left'>
            <Art item={item} className='aspect-square w-full shadow-[0_16px_28px_-18px_rgb(0_0_0/0.8)]' />
            <span className='mt-2 flex items-center gap-1 truncate text-[0.9375rem] text-fg'>
                {item.pinned && <Pin size={12} className='shrink-0 text-accent' />}
                <span className='truncate'>{item.name}</span>
            </span>
            <span className='block truncate text-[0.8125rem] text-muted'>
                {KIND_LABEL[item.kind]} · {item.tracks.length}
            </span>
        </button>
    )
}

// Liked songs and All songs: the two every library has, kept at its head
function Collections() {
    const liked = useLikedSongs().length
    const songs = useStore(library, (s) => s.songs.length)
    const liked_art = useStore(library, (s) => s.view_covers.liked)
    const songs_art = useStore(library, (s) => s.view_covers.songs)

    const tile = 'float thin flex h-[4.25rem] min-w-0 items-center gap-3 rounded-2xl pr-3 pl-2 text-left active:scale-[0.98] transition-transform'

    return (
        <div className='grid grid-cols-2 gap-2.5'>
            <button type='button' onClick={() => open_view('liked')} className={tile}>
                {liked_art ? (
                    <Cover data={liked_art} size='sm' className='size-[3.25rem] shrink-0' />
                ) : (
                    <span className='grid size-[3.25rem] shrink-0 place-items-center rounded-(--r-cover) bg-[color-mix(in_oklab,var(--accent)_22%,transparent)]'>
                        <Heart size={22} className='fill-current text-accent' />
                    </span>
                )}
                <span className='min-w-0'>
                    <span className='block truncate text-[0.9375rem]'>Liked songs</span>
                    <span className='block font-mono text-[0.75rem] text-muted'>{liked}</span>
                </span>
            </button>
            <button type='button' onClick={() => open_view('songs')} className={tile}>
                {songs_art ? (
                    <Cover data={songs_art} size='sm' className='size-[3.25rem] shrink-0' />
                ) : (
                    <span className='grid size-[3.25rem] shrink-0 place-items-center rounded-(--r-cover) bg-surface-3'>
                        <Music2 size={22} className='text-fg-2' />
                    </span>
                )}
                <span className='min-w-0'>
                    <span className='block truncate text-[0.9375rem]'>All songs</span>
                    <span className='block font-mono text-[0.75rem] text-muted'>{songs}</span>
                </span>
            </button>
        </div>
    )
}

export function PhoneLibrary() {
    const loading = useStore(library, (s) => s.loading)
    const [filter, set_filter] = useState<Filter>(() => stored_pref('phone_library_filter', FILTERS.map((o) => o.id), 'all'))
    const [sort, set_sort] = useState<Sort>(() => stored_pref('phone_library_sort', SORTS.map((o) => o.id), 'recent'))
    const [grid, set_grid] = useState(() => stored_pref('phone_library_layout', ['list', 'grid'], 'list') === 'grid')
    const [searching, set_searching] = useState(false)
    const [query, set_query] = useState('')
    const items = useItems(filter, sort, query)

    const pick = (next: Filter) => {
        set_filter(next)
        save_pref('phone_library_filter', next)
    }
    const next_sort = () => {
        const next = SORTS[(SORTS.findIndex((o) => o.id === sort) + 1) % SORTS.length].id
        set_sort(next)
        save_pref('phone_library_sort', next)
    }
    const flip = () => {
        set_grid(!grid)
        save_pref('phone_library_layout', grid ? 'list' : 'grid')
    }

    return (
        <div>
            <div className='mb-4 flex items-center gap-1'>
                <h1 className='flex-1 font-serif text-[2.25rem] leading-tight font-medium'>Your library</h1>
                <button type='button' aria-label='Search your library' onClick={() => (set_searching(!searching), set_query(''))} className='grid size-11 place-items-center rounded-full text-fg active:bg-surface-2'>
                    {searching ? <X size={20} /> : <Search size={20} />}
                </button>
                <button type='button' aria-label='New playlist' onClick={() => void new_playlist()} className='grid size-11 place-items-center rounded-full text-fg active:bg-surface-2'>
                    <Plus size={22} />
                </button>
            </div>

            {searching && (
                <input
                    autoFocus
                    value={query}
                    onChange={(e) => set_query(e.target.value)}
                    placeholder='Find in your library'
                    className='search-field mb-4 h-11 w-full rounded-(--r-search) bg-surface-2 px-4 text-[0.9375rem] text-fg outline-none placeholder:text-muted'
                />
            )}

            <Collections />

            {/* the chips run off the edge and are swiped, as anything wider than a phone is */}
            <div role='tablist' aria-label='Show' className='-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1'>
                {FILTERS.map((option) => (
                    <button
                        key={option.id}
                        type='button'
                        role='tab'
                        aria-selected={filter === option.id}
                        onClick={() => pick(option.id)}
                        className={cn(
                            'btn h-9 shrink-0 rounded-(--r-control) px-4 text-[0.875rem] transition-colors',
                            filter === option.id ? 'btn-fill bg-surface-3 text-fg' : 'text-fg-2 shadow-[inset_0_0_0_1px_var(--line)]',
                        )}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            <div className='mt-3 mb-1 flex h-10 items-center'>
                <button type='button' onClick={next_sort} className='flex h-10 items-center gap-2 text-[0.875rem] text-fg-2 active:text-fg'>
                    <ArrowsDownUp size={16} />
                    {SORTS.find((o) => o.id === sort)?.label}
                </button>
                <span className='flex-1' />
                <button type='button' aria-label={grid ? 'Show as list' : 'Show as grid'} onClick={flip} className='grid size-10 place-items-center rounded-full text-fg-2 active:bg-surface-2'>
                    {grid ? <Rows size={18} /> : <LayoutGrid size={18} />}
                </button>
            </div>

            {items.length ? (
                grid ? (
                    <div className='grid grid-cols-2 gap-x-3.5 gap-y-5 pt-1'>
                        {items.map((item) => (
                            <Tile key={`${item.kind}:${item.name}`} item={item} />
                        ))}
                    </div>
                ) : (
                    <div>
                        {items.map((item) => (
                            <Row key={`${item.kind}:${item.name}`} item={item} />
                        ))}
                    </div>
                )
            ) : (
                <div className='grid place-items-center gap-3 py-12 text-center'>
                    <ListMusic size={28} className='text-muted' />
                    <p className='text-[0.9375rem] text-fg-2'>{query ? `Nothing called “${query}”` : filter === 'playlists' ? 'No playlists yet' : 'Nothing here yet'}</p>
                    {filter === 'playlists' && !query && (
                        <button type='button' onClick={() => void new_playlist()} className='btn btn-fill h-10 rounded-full bg-surface-3 px-5 text-[0.875rem]'>
                            New playlist
                        </button>
                    )}
                </div>
            )}

            <button
                type='button'
                onClick={() => void fetch_songs()}
                disabled={loading}
                className='mt-6 flex h-11 items-center gap-2.5 text-[0.875rem] text-muted active:text-fg disabled:opacity-60'
            >
                <Spin on={loading}><RefreshCw size={16} /></Spin>
                {loading ? 'Scanning' : 'Rescan library'}
            </button>
        </div>
    )
}

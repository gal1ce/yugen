import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Camera, Heart, ListFilter, Music2, Pencil, Play, Shuffle } from '../ui/icons'
import { useDismiss } from '../../hooks/dismiss'
import { cn } from '../../lib/cn'
import { format_span } from '../../lib/format'
import { LAYOUTS, SORTS } from '../../lib/prefs'
import { shallow, useStore } from '../../lib/store'
import { album_runs_of, group_art, layout_key, playlist_art, span_of, useListed } from '../../state/derive'
import { pick_image } from '../../state/images'
import { library, type ViewCover } from '../../state/library'
import { play_listing, play_music, player, shuffle_into } from '../../state/player'
import { nearby_key_of, nearby_named, show_nearby } from '../../state/suggest'
import { open_group, set_layout, set_pref, ui } from '../../state/ui'
import { Button, IconButton } from '../ui/Button'
import { Empty } from '../ui/Controls'
import { Cover } from '../ui/Cover'
import { MenuItem, MenuLabel, MenuPanel, MenuSep } from '../ui/Menu'
import { tip } from '../../lib/tip'
import { GroupCard, GroupRow } from '../media/Group'
import { NearbyShelf } from '../media/Suggest'
import { TrackCard, TrackLine, TrackRow, TrackRowHead, card_grid } from '../media/Track'

function SortMenu() {
    const [open, set_open] = useState(false)
    const sort = useStore(ui, (s) => s.sort)
    const view = useStore(ui, (s) => s.view)
    const selection = useStore(ui, (s) => s.selection)
    const key = layout_key(view, selection)
    const layout = useStore(ui, (s) => s.layouts[key])
    const close = useCallback(() => set_open(false), [])

    useDismiss(open, close)

    return (
        <div className='relative' onClick={(e) => e.stopPropagation()}>
            <Button variant='ghost' size='sm' icon={<ListFilter size={16} />} onClick={() => set_open(!open)} className={open ? 'bg-surface-2 text-fg' : ''}>
                {SORTS.find((option) => option.id === sort)?.label}
            </Button>
            {open && (
                <MenuPanel className='absolute top-full right-0 mt-1'>
                    <MenuLabel>Sort by</MenuLabel>
                    {SORTS.map((option) => (
                        <MenuItem key={option.id} checked={sort === option.id} onClick={() => set_pref('sort', option.id)}>
                            {option.label}
                        </MenuItem>
                    ))}
                    <MenuSep />
                    <MenuLabel>View as</MenuLabel>
                    {LAYOUTS.map((option) => (
                        <MenuItem key={option.id} checked={layout === option.id} onClick={() => set_layout(key, option.id)}>
                            {option.label}
                        </MenuItem>
                    ))}
                </MenuPanel>
            )}
        </div>
    )
}

// Liked Songs and All songs: their own sleeve if one was given, the drawn tile
// if not, and either way the click that picks a new one (through the crop)
const tile = 'size-44 rounded-md shadow-[0_24px_40px_-22px_rgb(0_0_0/0.75),0_2px_6px_rgb(0_0_0/0.3)]'

// Liked songs and All songs: their own sleeve if one was given, a plain one
// if not, and either way the click that picks a new one (through the crop)
function ViewTile({ view }: { view: ViewCover }) {
    const art = useStore(library, (s) => s.view_covers[view])

    return (
        <label {...tip('Change cover')} className='group relative shrink-0 cursor-pointer'>
            {art ? (
                <Cover data={art} size='md' icon={44} className={tile} />
            ) : (
                <span className={cn('grid place-items-center bg-surface-2 shadow-[inset_0_0_0_1px_var(--line)]', tile)}>
                    {view === 'liked' ? <Heart size={48} className='fill-current text-accent' /> : <Music2 size={48} className='text-muted' />}
                </span>
            )}
            <span className='absolute inset-0 grid place-items-center rounded-md bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100'>
                <Camera size={20} />
            </span>
            <input type='file' accept='image/png,image/jpeg' className='hidden' onChange={(e) => void pick_image(e, { kind: 'view', view })} />
        </label>
    )
}

// the head of a listing: what it is, what it holds, and the way to play it
function Head({ listed }: { listed: string[] }) {
    const view = useStore(ui, (s) => s.view)
    const selection = useStore(ui, (s) => s.selection)
    useStore(library, (s) => [s.covers, s.playlist_covers, s.playlists], shallow)
    const span = span_of(listed)

    const kind = view === 'playlist' ? 'Playlist' : view === 'albums' ? 'Album' : view === 'artists' ? 'Artist' : view === 'liked' ? 'Collection' : 'Library'
    const title = selection ?? (view === 'liked' ? 'Liked songs' : 'All songs')
    const art = view === 'playlist' && selection ? playlist_art(selection) : selection ? group_art(listed) : ''
    const editable = view === 'playlist' && !!selection
    const artist = view === 'artists'

    const sleeve =
        view === 'liked' || view === 'songs' ? (
            <ViewTile view={view} />
        ) : (
            <button
                type='button'
                disabled={!editable}
                {...(editable ? tip('Edit details') : {})}
                onClick={() => editable && ui.set({ editing: selection })}
                className='group relative shrink-0'
            >
                <Cover data={art} size='md' round={artist} icon={44} className={artist ? 'size-44 shadow-[0_24px_40px_-22px_rgb(0_0_0/0.75)]' : tile} />
                {editable && (
                    <span className='absolute inset-0 grid place-items-center rounded-md bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100'>
                        <Pencil size={20} />
                    </span>
                )}
            </button>
        )

    return (
        <section className='mb-10'>
            {selection && (view === 'albums' || view === 'artists') && (
                <button type='button' onClick={() => ui.set({ selection: null })} className='mb-4 flex h-8 items-center gap-1.5 rounded-md text-[0.8125rem] text-muted transition-colors hover:text-fg'>
                    <ArrowLeft size={16} /> All {view}
                </button>
            )}
            <div className='flex items-end gap-8'>
                {sleeve}
                <div className='min-w-0 flex-1 pb-1'>
                    <p className='text-[0.8125rem] text-muted'>{kind}</p>
                    <h1 className='mt-1 truncate font-serif text-[2.75rem] leading-[1.08] font-medium'>{title}</h1>
                    <p className='mt-2 text-[0.8125rem] text-muted'>
                        <span className='font-mono text-fg-2 tabular-nums'>{listed.length}</span> {listed.length === 1 ? 'track' : 'tracks'}
                        {span > 0 && <> · {format_span(span)}</>}
                    </p>

                    <div className='mt-6 flex flex-wrap items-center gap-2'>
                        <Button size='lg' disabled={!listed.length} icon={<Play size={16} />} onClick={() => void play_listing(listed)}>
                            Play
                        </Button>
                        <Button
                            size='lg'
                            variant='secondary'
                            disabled={!listed.length}
                            icon={<Shuffle size={16} />}
                            onClick={async () => {
                                player.set({ scope: null, manual_queue: null })
                                await shuffle_into('listing')
                                const order = player.get().shuffled
                                if (order?.length) void play_music(order[0])
                            }}
                        >
                            Shuffle
                        </Button>
                        {editable && (
                            <IconButton size='lg' variant='outline' {...tip('Edit details')} onClick={() => ui.set({ editing: selection })}>
                                <Pencil size={18} />
                            </IconButton>
                        )}
                    </div>
                </div>
            </div>
        </section>
    )
}

function Tracks({ listed }: { listed: string[] }) {
    const view = useStore(ui, (s) => s.view)
    const selection = useStore(ui, (s) => s.selection)
    const sort = useStore(ui, (s) => s.sort)
    const layout = useStore(ui, (s) => s.layouts[layout_key(s.view, s.selection)])
    const meta = useStore(library, (s) => s.meta)
    const runs = album_runs_of(listed, sort, view, selection, meta)

    // sorted by album, a listing is the albums themselves
    if (runs) {
        const open = (name: string) => open_group('albums', name)

        return layout === 'grid' ? (
            <div className={card_grid}>
                {[...runs].map(([name, tracks]) => (
                    <GroupCard key={name} name={name} tracks={tracks} on_open={() => open(name)} />
                ))}
            </div>
        ) : (
            <div>
                {[...runs].map(([name, tracks], i) => (
                    <GroupRow key={name} name={name} tracks={tracks} index={i} on_open={() => open(name)} />
                ))}
            </div>
        )
    }

    if (layout === 'grid') {
        return (
            <div className={card_grid}>
                {listed.map((name, i) => (
                    <TrackCard key={name} name={name} index={i} />
                ))}
            </div>
        )
    }

    if (layout === 'compact') {
        return (
            <div className='space-y-0.5'>
                {listed.map((name, i) => (
                    <TrackLine key={name} name={name} index={i} />
                ))}
            </div>
        )
    }

    return (
        <div>
            <TrackRowHead />
            {listed.map((name, i) => (
                <TrackRow key={name} name={name} index={i} />
            ))}
        </div>
    )
}

export function ListingPage() {
    const listed = useListed()
    const view = useStore(ui, (s) => s.view)
    const selection = useStore(ui, (s) => s.selection)
    const loading = useStore(library, (s) => s.loading)
    // the shelf's places are a setting, read through the key below
    useStore(ui, (s) => s.suggest_on)
    useStore(ui, (s) => s.places)
    const nearby_key = nearby_key_of(view, selection)

    // the shelf at the foot belongs to this listing: one already drawn for it
    // comes back, and only a listing with none yet costs a pass
    useEffect(() => {
        show_nearby(nearby_key, listed.length > 0)
    }, [nearby_key, listed.length])

    return (
        <>
            <Head listed={listed} />

            {listed.length > 0 && (
                <div className='mb-2 flex items-center justify-between'>
                    <h2 className='text-[0.8125rem] text-muted'>Tracks</h2>
                    <SortMenu />
                </div>
            )}

            {listed.length ? (
                <Tracks listed={listed} />
            ) : (
                <Empty icon={view === 'liked' ? <Heart size={20} /> : <Music2 size={20} />} title={loading ? 'Scanning your library' : view === 'liked' ? 'No liked songs yet' : view === 'playlist' ? 'This playlist is empty' : 'Nothing here yet'}>
                    {view === 'liked' ? 'Press the heart on any track and it lands here.' : view === 'playlist' ? 'Right-click a track and pick Add to playlist.' : null}
                </Empty>
            )}

            {!!nearby_key && listed.length > 0 && <NearbyShelf named={nearby_named(view, selection)} />}
        </>
    )
}

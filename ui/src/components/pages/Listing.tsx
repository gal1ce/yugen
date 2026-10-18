import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Heart, ListFilter, Music2, Pencil, Play, Shuffle } from '../ui/icons'
import { useDismiss } from '../../hooks/dismiss'
import { spotlight } from '../../hooks/spotlight'
import { cn } from '../../lib/cn'
import { format_span } from '../../lib/format'
import { LAYOUTS, SORTS } from '../../lib/prefs'
import { shallow, useStore } from '../../lib/store'
import { album_runs_of, group_art, layout_key, playlist_art, span_of, useListed } from '../../state/derive'
import { library } from '../../state/library'
import { play_listing, play_music, player, shuffle_into } from '../../state/player'
import { nearby_key_of, show_nearby } from '../../state/suggest'
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
            <Button variant='ghost' size='sm' icon={<ListFilter size={14} />} onClick={() => set_open(!open)} className={open ? 'bg-surface-2 text-fg' : ''}>
                {SORTS.find((option) => option.id === sort)?.label}
            </Button>
            {open && (
                <MenuPanel className='absolute top-full right-0 mt-2'>
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

// the head of a listing: what it is, what it holds, and the way to play it
function Head({ listed }: { listed: string[] }) {
    const view = useStore(ui, (s) => s.view)
    const selection = useStore(ui, (s) => s.selection)
    useStore(library, (s) => [s.covers, s.playlist_covers, s.playlists], shallow)
    const span = span_of(listed)

    const kind = view === 'playlist' ? 'Playlist' : view === 'albums' ? 'Album' : view === 'artists' ? 'Artist' : view === 'liked' ? 'Collection' : 'Library'
    const title = selection ?? (view === 'liked' ? 'Liked Songs' : 'All songs')
    const art = view === 'playlist' && selection ? playlist_art(selection) : selection ? group_art(listed) : ''
    const editable = view === 'playlist' && !!selection

    const tile =
        view === 'liked' ? (
            <span className='grid size-40 shrink-0 place-items-center rounded-2xl bg-linear-to-br from-accent to-[color-mix(in_oklab,var(--accent)_40%,#1a1030)] text-accent-fg shadow-soft'>
                <Heart size={56} className='fill-current' />
            </span>
        ) : view === 'songs' ? (
            <span className='grid size-40 shrink-0 place-items-center rounded-2xl bg-surface-3 text-muted shadow-soft'>
                <Music2 size={52} />
            </span>
        ) : (
            <button
                type='button'
                disabled={!editable}
                {...(editable ? tip('Edit details') : {})}
                onClick={() => editable && ui.set({ editing: selection })}
                className='group relative shrink-0'
            >
                <Cover data={art} size='md' round={view === 'artists'} icon={44} className={cn('size-40 shadow-soft', view === 'artists' ? '' : 'rounded-2xl')} />
                {editable && (
                    <span className='absolute inset-0 grid place-items-center rounded-2xl bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100'>
                        <Pencil size={22} />
                    </span>
                )}
            </button>
        )

    return (
        <section {...spotlight} className='spotlight edge relative mb-8 overflow-hidden rounded-3xl bg-surface p-6'>
            <div className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_oklab,var(--accent)_13%,transparent),transparent_60%)]' />

            <div className='relative flex items-end gap-6'>
                {tile}
                <div className='min-w-0 flex-1 pb-1'>
                    {selection && (view === 'albums' || view === 'artists') && (
                        <button type='button' onClick={() => ui.set({ selection: null })} className='mb-3 flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-fg'>
                            <ArrowLeft size={13} /> All {view}
                        </button>
                    )}
                    <p className='text-[0.68rem] font-medium tracking-wider text-accent uppercase'>{kind}</p>
                    <h1 className='mt-1 truncate font-display text-[2.6rem] leading-tight font-bold tracking-tight'>{title}</h1>
                    <p className='mt-1 text-sm text-muted'>
                        {listed.length} {listed.length === 1 ? 'track' : 'tracks'}
                        {span > 0 && ` · ${format_span(span)}`}
                    </p>

                    <div className='mt-5 flex flex-wrap items-center gap-2'>
                        <Button disabled={!listed.length} icon={<Play size={15} className='fill-current' />} onClick={() => void play_listing(listed)}>
                            Play
                        </Button>
                        <Button
                            variant='secondary'
                            disabled={!listed.length}
                            icon={<Shuffle size={15} />}
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
                            <IconButton variant='outline' {...tip('Edit details')} onClick={() => ui.set({ editing: selection })}>
                                <Pencil size={15} />
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
            <div className='space-y-0.5'>
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
                <div className='mb-4 flex items-center justify-between'>
                    <h2 className='text-sm font-medium text-muted'>Tracks</h2>
                    <SortMenu />
                </div>
            )}

            {listed.length ? (
                <Tracks listed={listed} />
            ) : (
                <Empty icon={view === 'liked' ? <Heart size={20} /> : <Music2 size={20} />} title={loading ? 'Scanning your library…' : view === 'liked' ? 'No liked songs yet.' : view === 'playlist' ? 'This playlist is empty.' : 'Nothing here yet.'}>
                    {view === 'liked' ? 'Tap the heart on any track and it lands here.' : view === 'playlist' ? 'Right-click a track and pick Add to.' : null}
                </Empty>
            )}

            {!!nearby_key && listed.length > 0 && <NearbyShelf named={view === 'playlist' && selection ? selection : 'your liked songs'} />}
        </>
    )
}

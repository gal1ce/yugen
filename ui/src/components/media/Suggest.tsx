import { memo, useEffect, useMemo, useState } from 'react'
import { Check, Download, LayoutGrid, LoaderCircle, RefreshCw, Waveform } from '../ui/icons'
import { useDismiss } from '../../hooks/dismiss'
import { cn } from '../../lib/cn'
import type { Suggestion } from '../../lib/lastfm'
import { SUGGESTION_VIEWS } from '../../lib/prefs'
import { shallow, useStore } from '../../lib/store'
import { library } from '../../state/library'
import { player } from '../../state/player'
import {
    download_suggestion,
    load_queue_suggestions,
    queue_suggest,
    load_more_nearby,
    load_more_similar,
    load_nearby,
    load_similar,
    suggest,
    suggestion_state,
    library_keys_now,
} from '../../state/suggest'
import { context, set_pref, ui } from '../../state/ui'
import { Button, IconButton } from '../ui/Button'
import { Empty } from '../ui/Controls'
import { MenuItem, MenuLabel, MenuPanel } from '../ui/Menu'
import { More } from '../ui/More'
import { tip } from '../../lib/tip'
import { card_grid } from './Track'
import { Section } from './Rail'
import { Spin } from '../ui/Spin'

// where a suggestion stands, read for one card. what it reads changes only
// when a download starts or lands, so the shelf is not rendered for it
const useSuggestionState = (track: Suggestion) => {
    useStore(library, (s) => s.songs)
    const s = useStore(suggest, (st) => ({ getting: st.getting, fetched: st.fetched, missing: st.missing }), shallow)

    return suggestion_state(track, { ...suggest.get(), ...s }, library_keys_now())
}

// the badge is the button: it fetches straight away. the question is one
// right-click away on the card
function Badge({ track, held, here, busy, className }: { track: Suggestion; held: boolean; here: boolean; busy: boolean; className?: string }) {
    return (
        <button
            type='button'
            disabled={held}
            {...tip(here ? 'Already in your library' : busy ? 'Downloading' : 'Download')}
            onClick={(e) => {
                e.stopPropagation()
                if (!held) void download_suggestion(track)
            }}
            className={cn('grid shrink-0 place-items-center rounded-md transition-[background-color,color,opacity,scale] active:scale-95 disabled:cursor-default', className)}
        >
            {here ? <Check size={16} /> : busy ? <Spin><LoaderCircle size={16} /></Spin> : <Download size={16} />}
        </button>
    )
}

const SuggestionCard = memo(function SuggestionCard({ track, index }: { track: Suggestion; index: number }) {
    const state = useSuggestionState(track)

    return (
        <div
            className={cn('group relative min-w-0 animate-rise', state.here && 'opacity-55')}
            style={{ animationDelay: `${Math.min(index, 6) * 50}ms` }}
            onContextMenu={(e) => !state.held && context({ kind: 'suggestion', track })(e)}
        >
            <div className='relative aspect-square overflow-hidden rounded-md bg-surface-2 shadow-[0_8px_20px_-12px_rgb(0_0_0/0.55)]'>
                <img
                    src={track.image}
                    alt=''
                    loading='lazy'
                    decoding='async'
                    // the url came from last.fm and the picture lives on whatever
                    // host it names: it can simply not be there
                    onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                    className='size-full object-cover'
                />
                <Badge
                    track={track}
                    {...state}
                    className={cn(
                        'absolute top-2 right-2 size-8 bg-black/55 text-white hover:bg-black/75',
                        state.held ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 max-sm:opacity-100',
                    )}
                />
            </div>
            <p className='mt-2 truncate text-[0.875rem] font-medium max-sm:pr-8'>{track.title}</p>
            <p className='truncate text-[0.8125rem] text-muted max-sm:pr-8'>{state.note}</p>
            {!state.held && <More target={{ kind: 'suggestion', track }} className='absolute right-[-0.5rem] bottom-[-0.25rem]' />}
        </div>
    )
})

const SuggestionRow = memo(function SuggestionRow({ track, index }: { track: Suggestion; index: number }) {
    const state = useSuggestionState(track)

    return (
        <div
            className={cn('group flex h-(--row) animate-rise items-center gap-3 rounded-lg px-3 transition-colors hover:bg-surface-2', state.here && 'opacity-55')}
            style={{ animationDelay: `${Math.min(index, 6) * 50}ms` }}
            onContextMenu={(e) => !state.held && context({ kind: 'suggestion', track })(e)}
        >
            <img src={track.image} alt='' loading='lazy' decoding='async' className='size-9 shrink-0 rounded-md bg-surface-3 object-cover' />
            <div className='min-w-0 flex-1'>
                <p className='truncate text-[0.875rem]'>{track.title}</p>
                <p className='truncate text-[0.8125rem] text-muted'>{state.note}</p>
            </div>
            <Badge track={track} {...state} className='size-8 text-muted hover:bg-surface-3 hover:text-fg' />
            {!state.held && <More target={{ kind: 'suggestion', track }} className='-mr-2' />}
        </div>
    )
})

const skeleton_cards = (count: number) =>
    Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden>
            <div className='aspect-square rounded-md bg-surface-2' />
            <div className='mt-2 h-3 w-4/5 rounded-sm bg-surface-2' />
            <div className='mt-2 h-2.5 w-1/2 rounded-sm bg-surface-2' />
        </div>
    ))

const skeleton_rows = (count: number) =>
    Array.from({ length: count }, (_, i) => (
        <div key={i} className='flex h-(--row) items-center gap-3 px-3' aria-hidden>
            <div className='size-9 rounded-md bg-surface-2' />
            <div className='flex-1'>
                <div className='h-3 w-2/5 rounded-sm bg-surface-2' />
                <div className='mt-2 h-2.5 w-1/5 rounded-sm bg-surface-2' />
            </div>
        </div>
    ))

function ViewMenu() {
    const [open, set_open] = useState(false)
    const view = useStore(ui, (s) => s.suggestion_view)
    const close = useMemo(() => () => set_open(false), [])

    useDismiss(open, close)

    return (
        <div className='relative'>
            <IconButton size='sm' {...tip('View as')} onClick={() => set_open(!open)} className={open ? 'bg-surface-2 text-fg' : ''}>
                <LayoutGrid size={16} />
            </IconButton>
            {open && (
                <MenuPanel className='absolute top-full right-0 mt-1'>
                    <MenuLabel>View as</MenuLabel>
                    {SUGGESTION_VIEWS.map((option) => (
                        <MenuItem key={option.id} checked={view === option.id} onClick={() => set_pref('suggestion_view', option.id)}>
                            {option.label}
                        </MenuItem>
                    ))}
                </MenuPanel>
            )}
        </div>
    )
}

// the last block of the library page: records like the ones above it, that are
// not here yet
export function DiscoverShelf() {
    const similar = useStore(suggest, (s) => s.similar)
    const busy = useStore(suggest, (s) => s.similar_busy)
    const shown = useStore(suggest, (s) => s.cards_shown)
    const view = useStore(ui, (s) => s.suggestion_view)
    const on_screen = similar.slice(0, shown)

    const body = () => {
        if (view === 'list') return <div className='grid gap-0.5 md:grid-cols-2'>{on_screen.map((track, i) => <SuggestionRow key={track.key} track={track} index={i} />)}</div>

        if (view === 'artist') {
            const groups = new Map<string, Suggestion[]>()
            for (const track of on_screen) {
                const name = track.artist || 'Unknown artist'
                groups.set(name, [...(groups.get(name) ?? []), track])
            }

            return (
                <div className='space-y-7'>
                    {[...groups.entries()]
                        .sort((a, b) => b[1].length - a[1].length)
                        .map(([name, tracks]) => (
                            <div key={name}>
                                <p className='mb-3 flex items-baseline gap-2 text-[0.875rem] font-medium'>
                                    <span className='truncate'>{name}</span>
                                    <span className='font-mono text-[0.6875rem] text-muted'>{tracks.length}</span>
                                </p>
                                <div className='grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-x-4 gap-y-6'>
                                    {tracks.map((track, i) => <SuggestionCard key={track.key} track={track} index={i} />)}
                                </div>
                            </div>
                        ))}
                </div>
            )
        }

        return (
            <div className={view === 'compact' ? 'grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-x-4 gap-y-6' : card_grid}>
                {on_screen.map((track, i) => <SuggestionCard key={track.key} track={track} index={i} />)}
            </div>
        )
    }

    return (
        <Section
            title='Not in your library yet'
            note={busy && !similar.length ? 'Asking last.fm' : 'Tracks last.fm puts next to the ones you like and star'}
            action={
                <>
                    <Button variant='ghost' size='sm' disabled={busy} icon={<Spin on={busy}><RefreshCw size={16} /></Spin>} {...tip('Ask again, for different tracks')} onClick={() => void load_similar('again')}>
                        Ask again
                    </Button>
                    <ViewMenu />
                </>
            }
        >
            {similar.length ? (
                <>
                    {body()}
                    <div className='mt-6 flex justify-center'>
                        <Button variant='secondary' size='sm' loading={busy && shown >= similar.length} onClick={load_more_similar}>
                            Load more
                        </Button>
                    </div>
                </>
            ) : busy ? (
                <div className={card_grid}>{skeleton_cards(6)}</div>
            ) : (
                <Empty icon={<Waveform size={20} />} title='Nothing to suggest yet'>
                    Like or star a few tracks, or ask again.
                </Empty>
            )}
        </Section>
    )
}

// the same idea one listing down: what else is like this playlist, or the liked songs
export function NearbyShelf({ named }: { named: string }) {
    const nearby = useStore(suggest, (s) => s.nearby)
    const busy = useStore(suggest, (s) => s.nearby_busy)
    const shown = useStore(suggest, (s) => s.nearby_shown)

    return (
        <Section
            className='mt-12 border-t border-line pt-8'
            title='More like this'
            note={busy && !nearby.length ? 'Asking last.fm' : `From last.fm, based on ${named}`}
            action={
                <Button variant='ghost' size='sm' disabled={busy} icon={<Spin on={busy}><RefreshCw size={16} /></Spin>} {...tip('Ask again, for different tracks')} onClick={() => void load_nearby('again')}>
                    Ask again
                </Button>
            }
        >
            {nearby.length ? (
                <>
                    <div className='grid gap-0.5 md:grid-cols-2'>
                        {nearby.slice(0, shown).map((track, i) => <SuggestionRow key={track.key} track={track} index={i} />)}
                    </div>
                    <div className='mt-5 flex justify-center'>
                        <Button variant='secondary' size='sm' loading={busy && shown >= nearby.length} onClick={load_more_nearby}>
                            Load more
                        </Button>
                    </div>
                </>
            ) : busy ? (
                <div className='grid gap-0.5 md:grid-cols-2'>{skeleton_rows(4)}</div>
            ) : (
                <Empty title='Nothing came back this time'>Ask again for a different set.</Empty>
            )}
        </Section>
    )
}

// a handful under the queue: what last.fm would play after the current track
export function QueueSuggestions() {
    const current = useStore(player, (s) => s.current)
    const tracks = useStore(queue_suggest, (s) => s.tracks)
    const busy = useStore(queue_suggest, (s) => s.busy)

    useEffect(() => {
        if (current) void load_queue_suggestions(current)
    }, [current])

    if (!current || (!busy && !tracks.length)) return null

    return (
        <div className='mt-6'>
            <p className='mb-1 px-2 text-[0.8125rem] text-muted'>{busy ? 'Asking last.fm' : 'You might add'}</p>
            {busy ? skeleton_rows(3) : tracks.map((track, i) => <SuggestionRow key={track.key} track={track} index={i} />)}
        </div>
    )
}

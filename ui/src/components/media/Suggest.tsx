import { memo, useMemo, useState } from 'react'
import { Check, Download, LayoutGrid, LoaderCircle, RefreshCw, Sparkles } from '../ui/icons'
import { useDismiss } from '../../hooks/dismiss'
import { cn } from '../../lib/cn'
import type { Suggestion } from '../../lib/lastfm'
import { SUGGESTION_VIEWS } from '../../lib/prefs'
import { shallow, useStore } from '../../lib/store'
import { library } from '../../state/library'
import {
    download_suggestion,
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
import { tip } from '../../lib/tip'
import { card_grid } from './Track'
import { Section } from './Rail'

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
            {...tip(here ? 'Already in your library' : busy ? 'Downloading…' : 'Download')}
            onClick={(e) => {
                e.stopPropagation()
                if (!held) void download_suggestion(track)
            }}
            className={cn('grid shrink-0 place-items-center rounded-lg transition-[background-color,color,opacity,scale] active:scale-90 disabled:cursor-default', className)}
        >
            {here ? <Check size={15} /> : busy ? <LoaderCircle size={15} className='animate-spin' /> : <Download size={15} />}
        </button>
    )
}

const SuggestionCard = memo(function SuggestionCard({ track, index }: { track: Suggestion; index: number }) {
    const state = useSuggestionState(track)

    return (
        <div
            className={cn('group relative min-w-0 animate-rise', state.here && 'opacity-55')}
            style={{ animationDelay: `${Math.min(index, 14) * 22}ms` }}
            onContextMenu={(e) => !state.held && context({ kind: 'suggestion', track })(e)}
        >
            <div className='edge relative aspect-square overflow-hidden rounded-xl bg-surface-2 transition-[translate,box-shadow] duration-500 ease-spring group-hover:-translate-y-1.5 group-hover:shadow-glow group-hover:after:opacity-100'>
                <img
                    src={track.image}
                    alt=''
                    loading='lazy'
                    decoding='async'
                    // the url came from last.fm and the picture lives on whatever
                    // host it names: it can simply not be there
                    onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                    className='size-full object-cover transition-transform duration-700 ease-soft group-hover:scale-[1.05]'
                />
                <Badge
                    track={track}
                    {...state}
                    className={cn(
                        'absolute top-2 right-2 size-8 bg-black/65 text-white hover:bg-accent hover:text-accent-fg',
                        state.held ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                    )}
                />
            </div>
            <p className='mt-2.5 truncate text-[0.82rem] font-medium'>{track.title}</p>
            <p className='truncate text-xs text-muted'>{state.note}</p>
        </div>
    )
})

const SuggestionRow = memo(function SuggestionRow({ track, index }: { track: Suggestion; index: number }) {
    const state = useSuggestionState(track)

    return (
        <div
            className={cn('group flex h-14 animate-rise items-center gap-3 rounded-xl px-3 transition-colors hover:bg-surface-2', state.here && 'opacity-55')}
            style={{ animationDelay: `${Math.min(index, 14) * 18}ms` }}
            onContextMenu={(e) => !state.held && context({ kind: 'suggestion', track })(e)}
        >
            <img src={track.image} alt='' loading='lazy' decoding='async' className='size-10 shrink-0 rounded-lg bg-surface-3 object-cover' />
            <div className='min-w-0 flex-1'>
                <p className='truncate text-[0.82rem] font-medium'>{track.title}</p>
                <p className='truncate text-xs text-muted'>{state.note}</p>
            </div>
            <Badge track={track} {...state} className='size-8 text-muted hover:bg-accent hover:text-accent-fg' />
        </div>
    )
})

const skeleton_cards = (count: number) =>
    Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden>
            <div className='skeleton aspect-square rounded-xl' />
            <div className='skeleton mt-2.5 h-3 w-4/5 rounded' />
            <div className='skeleton mt-1.5 h-2.5 w-1/2 rounded' />
        </div>
    ))

const skeleton_rows = (count: number) =>
    Array.from({ length: count }, (_, i) => (
        <div key={i} className='flex h-14 items-center gap-3 px-3' aria-hidden>
            <div className='skeleton size-10 rounded-lg' />
            <div className='flex-1'>
                <div className='skeleton h-3 w-2/5 rounded' />
                <div className='skeleton mt-1.5 h-2.5 w-1/5 rounded' />
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
            <IconButton size='sm' variant={open ? 'on' : 'plain'} {...tip('View as')} onClick={() => set_open(!open)}>
                <LayoutGrid size={15} />
            </IconButton>
            {open && (
                <MenuPanel className='absolute top-full right-0 mt-2'>
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
                                <p className='mb-3 flex items-baseline gap-2 text-sm font-medium'>
                                    <span className='truncate'>{name}</span>
                                    <span className='text-xs text-muted'>{tracks.length}</span>
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
            title={
                <span className='flex items-center gap-2'>
                    Suggested for you <Sparkles size={15} className='text-accent' />
                </span>
            }
            note={busy && !similar.length ? 'Asking around…' : 'Tracks like yours that are not in your library yet.'}
            action={
                <>
                    <Button variant='ghost' size='sm' disabled={busy} icon={<RefreshCw size={13} className={busy ? 'animate-spin' : ''} />} {...tip('Ask again, for different tracks')} onClick={() => void load_similar('again')}>
                        Another pass
                    </Button>
                    <ViewMenu />
                </>
            }
        >
            {similar.length ? (
                <>
                    {body()}
                    <div className='mt-7 flex justify-center'>
                        <Button variant='secondary' size='sm' loading={busy && shown >= similar.length} onClick={load_more_similar}>
                            Load more
                        </Button>
                    </div>
                </>
            ) : busy ? (
                <div className={card_grid}>{skeleton_cards(6)}</div>
            ) : (
                <Empty icon={<Sparkles size={20} />} title='Nothing to suggest yet (￣ヘ￣;)'>
                    Like or favourite a few tracks, or try another pass.
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
            note={busy && !nearby.length ? 'Asking around…' : `Based on ${named}`}
            action={
                <Button variant='ghost' size='sm' disabled={busy} icon={<RefreshCw size={13} className={busy ? 'animate-spin' : ''} />} {...tip('Ask again, for different tracks')} onClick={() => void load_nearby('again')}>
                    Another pass
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
                <Empty title='Nothing came back this time.'>Try another pass.</Empty>
            )}
        </Section>
    )
}

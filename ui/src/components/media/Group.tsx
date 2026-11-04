import { memo } from 'react'
import { cn } from '../../lib/cn'
import { format_span } from '../../lib/format'
import { useStore } from '../../lib/store'
import { span_of } from '../../state/derive'
import { artist_of, library } from '../../state/library'
import { Cover } from '../ui/Cover'

// an album or an artist: a cover off the first track that has one, a name, and
// how much is in it. an artist is a face, so it is round
export const GroupCard = memo(function GroupCard({
    name,
    tracks,
    round,
    on_open,
}: {
    name: string
    tracks: string[]
    round?: boolean
    on_open: () => void
}) {
    const art = useStore(library, (s) => {
        const found = tracks.find((track) => s.covers[track])
        return found ? s.covers[found] : ''
    })

    return (
        <button
            type='button'
            onClick={on_open}
            className='group min-w-0 text-left'
        >
            <div className={cn('relative aspect-square overflow-hidden bg-surface-2 shadow-[0_8px_20px_-12px_rgb(0_0_0/0.55)]', round ? 'rounded-full' : 'rounded-(--r-cover)')}>
                <Cover data={art} size='md' icon={28} round={round} className={cn('size-full', !round && 'rounded-none')} />
                <div className='absolute inset-0 bg-black/20 opacity-0 transition-opacity group-hover:opacity-100' />
            </div>
            <p className={cn('mt-2 truncate text-[0.875rem] font-medium', round && 'text-center')}>{name}</p>
            <p className={cn('truncate text-[0.8125rem] text-muted', round && 'text-center')}>
                {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
            </p>
        </button>
    )
})

export const GroupRow = memo(function GroupRow({ name, tracks, index, on_open }: { name: string; tracks: string[]; index: number; on_open: () => void }) {
    const art = useStore(library, (s) => {
        const found = tracks.find((track) => s.covers[track])
        return found ? s.covers[found] : ''
    })

    return (
        <button
            type='button'
            onClick={on_open}
            className='grid h-(--row) w-full grid-cols-[2rem_minmax(0,1fr)_6rem_4rem] items-center gap-3 rounded-lg px-3 text-left transition-colors hover:bg-surface-2'
        >
            <span className='text-center font-mono text-[0.75rem] text-muted tabular-nums'>{index + 1}</span>
            <div className='flex min-w-0 items-center gap-3'>
                <Cover data={art} size='sm' className='size-9' icon={14} />
                <div className='min-w-0'>
                    <p className='truncate text-[0.875rem]'>{name}</p>
                    <p className='truncate text-[0.8125rem] text-muted'>{artist_of(tracks[0])}</p>
                </div>
            </div>
            <span className='text-[0.8125rem] text-muted'>
                {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
            </span>
            <span className='text-right font-mono text-[0.75rem] text-muted tabular-nums'>{format_span(span_of(tracks))}</span>
        </button>
    )
})

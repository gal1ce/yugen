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
            <div
                className={cn(
                    'edge relative aspect-square overflow-hidden bg-surface-2 transition-[translate,box-shadow] duration-500 ease-spring group-hover:-translate-y-1.5 group-hover:shadow-glow group-hover:after:opacity-100',
                    round ? 'rounded-full' : 'rounded-xl',
                )}
            >
                <Cover data={art} size='md' icon={28} round={round} className={cn('size-full transition-transform duration-700 ease-soft group-hover:scale-[1.05]', !round && 'rounded-none')} />
            </div>
            <p className={cn('mt-2.5 truncate text-[0.82rem] font-medium', round && 'text-center')}>{name}</p>
            <p className={cn('truncate text-xs text-muted', round && 'text-center')}>
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
            className='grid h-14 w-full grid-cols-[2rem_minmax(0,1fr)_6rem_4rem] items-center gap-3 rounded-xl px-3 text-left transition-colors hover:bg-surface-2'
        >
            <span className='text-center text-xs text-muted tabular-nums'>{index + 1}</span>
            <div className='flex min-w-0 items-center gap-3'>
                <Cover data={art} size='sm' className='size-10' icon={15} />
                <div className='min-w-0'>
                    <p className='truncate text-[0.82rem] font-medium'>{name}</p>
                    <p className='truncate text-xs text-muted'>{artist_of(tracks[0])}</p>
                </div>
            </div>
            <span className='text-xs text-muted'>
                {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
            </span>
            <span className='text-right text-xs text-muted tabular-nums'>{format_span(span_of(tracks))}</span>
        </button>
    )
})

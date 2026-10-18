import { memo, useEffect, useRef } from 'react'
import { paced } from '../../lib/frames'
import { add_painter } from '../../lib/fx'
import { Play } from '../ui/icons'
import { cn } from '../../lib/cn'
import { format_date, format_time } from '../../lib/format'
import { useStore } from '../../lib/store'
import { added_of, album_of, artist_of, library, length_of, title_of, toggle_like } from '../../state/library'
import { play_from, player } from '../../state/player'
import { context } from '../../state/ui'
import { Heart } from '../ui/Controls'
import { Cover } from '../ui/Cover'

/*
 * One track, three ways: a card in a grid or a rail, a line in a compact list,
 * and a row in the full list. Each reads only what it draws - its own tags, its
 * own heart, whether it is the one playing - so a like or a track change
 * renders the rows it touches and nothing else.
 */
type TrackProps = {
    name: string
    // the run this track was drawn from, when it is a section of its own
    // rather than the listing on screen: next/prev stay inside it
    within?: string[]
    index?: number
}

const useTrack = (name: string) => {
    // the tags change on a rescan only, so this re-reads them then
    useStore(library, (s) => s.meta[name])
    const cover = useStore(library, (s) => s.covers[name])
    const liked = useStore(library, (s) => s.liked.has(name))

    return { cover, liked, title: title_of(name), artist: artist_of(name) }
}

const usePlaying = (name: string) => useStore(player, (s) => (s.current === name ? (s.paused ? 'paused' : 'playing') : null))

// the bars beside the track that is playing. normally a css animation; where
// the page keeps its own beat (lib/frames) they are moved from that instead,
// the same curve the keyframes draw
export function Bars({ still, className }: { still?: boolean; className?: string }) {
    const box = useRef<HTMLSpanElement>(null)

    useEffect(() => {
        if (!paced() || still) return

        return add_painter(0, (now) => {
            const bars = box.current?.children
            if (!bars) return

            for (let i = 0; i < bars.length; i++) {
                const phase = (now / 900 + i / 3) * Math.PI * 2
                ;(bars[i] as HTMLElement).style.transform = `scaleY(${0.65 - 0.35 * Math.cos(phase)})`
            }
        }, { page: true })
    }, [still])

    return (
        <span ref={box} className={cn('eq', still && 'still', className)} aria-hidden>
            <i />
            <i />
            <i />
        </span>
    )
}

export const TrackCard = memo(function TrackCard({ name, within, className }: TrackProps & { className?: string }) {
    const { cover, liked, title, artist } = useTrack(name)
    const playing = usePlaying(name)

    return (
        <div
            className={cn('group relative min-w-0', className)}
            onContextMenu={context({ kind: 'song', song: name, within })}
        >
            <button type='button' className='block w-full text-left' onClick={() => void play_from(name, within ?? null)}>
                <div className='edge relative aspect-square overflow-hidden rounded-xl bg-surface-2 transition-[translate,box-shadow] duration-500 ease-spring group-hover:-translate-y-1.5 group-hover:shadow-glow group-hover:after:opacity-100'>
                    <Cover data={cover} size='md' icon={28} className='size-full rounded-none transition-transform duration-700 ease-soft group-hover:scale-[1.05]' />
                    <div className='absolute inset-0 bg-linear-to-t from-black/55 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100' />

                    <span
                        className={cn(
                            'absolute right-2.5 bottom-2.5 grid size-10 place-items-center rounded-full bg-accent text-accent-fg shadow-glow transition-[opacity,translate] duration-300 ease-soft',
                            playing ? 'opacity-100' : 'translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100',
                        )}
                    >
                        {playing ? <Bars still={playing === 'paused'} className='on-accent' /> : <Play size={17} className='ml-0.5 fill-current' />}
                    </span>
                </div>

                <p className={cn('mt-2.5 truncate text-[0.82rem] font-medium', playing ? 'text-accent' : 'text-fg')}>{title}</p>
                <p className='truncate text-xs text-muted'>{artist}</p>
            </button>

            {/* outside the main button, so buttons are not nested. it lifts with the cover */}
            <Heart
                liked={liked}
                on_toggle={() => void toggle_like(name)}
                size={14}
                className={cn(
                    'absolute top-2 right-2 size-7 rounded-lg bg-black/65 text-white transition-all duration-500 ease-spring group-hover:-translate-y-1.5 hover:text-white',
                    liked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                )}
            />
        </div>
    )
})

export const TrackLine = memo(function TrackLine({ name, within, index = 0 }: TrackProps) {
    const { liked, title, artist } = useTrack(name)
    const playing = usePlaying(name)

    return (
        <div
            role='button'
            tabIndex={0}
            onClick={() => void play_from(name, within ?? null)}
            onKeyDown={(e) => e.key === 'Enter' && void play_from(name, within ?? null)}
            onContextMenu={context({ kind: 'song', song: name, within })}
            className='group flex h-11 items-center gap-3 rounded-xl px-3 transition-colors hover:bg-surface-2'
        >
            <span className='grid w-6 shrink-0 place-items-center text-xs text-muted tabular-nums'>
                {playing ? <Bars still={playing === 'paused'} /> : index + 1}
            </span>
            <div className='min-w-0 flex-1'>
                <p className={cn('truncate text-[0.82rem]', playing && 'text-accent')}>{title}</p>
            </div>
            <p className='hidden w-1/3 truncate text-xs text-muted md:block'>{artist}</p>
            <Heart liked={liked} on_toggle={() => void toggle_like(name)} size={15} className={cn('size-7', !liked && 'opacity-0 group-hover:opacity-100')} />
        </div>
    )
})

export const TrackRow = memo(function TrackRow({ name, within, index = 0 }: TrackProps) {
    const { cover, liked, title, artist } = useTrack(name)
    const playing = usePlaying(name)

    return (
        <div
            role='button'
            tabIndex={0}
            onClick={() => void play_from(name, within ?? null)}
            onKeyDown={(e) => e.key === 'Enter' && void play_from(name, within ?? null)}
            onContextMenu={context({ kind: 'song', song: name, within })}
            className='group grid h-14 grid-cols-[2rem_minmax(0,1fr)_2.25rem_3rem] items-center gap-3 rounded-xl px-3 transition-colors hover:bg-surface-2 md:grid-cols-[2rem_minmax(0,1.6fr)_minmax(0,1fr)_7rem_2.25rem_3rem]'
        >
            <span className='grid place-items-center text-xs text-muted tabular-nums'>
                {playing ? <Bars still={playing === 'paused'} /> : index + 1}
            </span>
            <div className='flex min-w-0 items-center gap-3'>
                <Cover data={cover} size='sm' className='size-10' icon={15} />
                <div className='min-w-0'>
                    <p className={cn('truncate text-[0.82rem] font-medium', playing && 'text-accent')}>{title}</p>
                    <p className='truncate text-xs text-muted'>{artist}</p>
                </div>
            </div>
            <p className='hidden truncate text-xs text-muted md:block'>{album_of(name)}</p>
            <p className='hidden text-xs text-muted md:block'>{format_date(added_of(name))}</p>
            <Heart liked={liked} on_toggle={() => void toggle_like(name)} size={15} className={cn('size-8', !liked && 'opacity-0 group-hover:opacity-100')} />
            <p className='text-right text-xs text-muted tabular-nums'>{format_time(length_of(name))}</p>
        </div>
    )
})

// the head over a full list: what each column is
export const TrackRowHead = () => (
    <div className='mb-1 grid grid-cols-[2rem_minmax(0,1fr)_2.25rem_3rem] gap-3 border-b border-line px-3 pb-2 text-[0.68rem] font-medium tracking-wide text-muted uppercase md:grid-cols-[2rem_minmax(0,1.6fr)_minmax(0,1fr)_7rem_2.25rem_3rem]'>
        <span className='text-center'>#</span>
        <span>Title</span>
        <span className='hidden md:block'>Album</span>
        <span className='hidden md:block'>Added</span>
        <span />
        <span className='text-right'>Time</span>
    </div>
)

export const card_grid = 'grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-x-5 gap-y-7'

import { memo, useEffect, useRef } from 'react'
import { paced } from '../../lib/frames'
import { add_painter } from '../../lib/fx'
import { Heart as HeartIcon, Play } from '../ui/icons'
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

// any track can be picked up and dropped on the drift in the queue panel
export const TRACK_DRAG = 'application/x-yugen-track'

const drag = (name: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
        e.dataTransfer.setData(TRACK_DRAG, name)
        e.dataTransfer.effectAllowed = 'copy'
    },
})

const usePlaying = (name: string) => useStore(player, (s) => (s.current === name ? (s.paused ? 'paused' : 'playing') : null))

// the bars beside the track that is playing. normally a css animation; where
// the page keeps its own beat (lib/frames) they are moved from that instead,
// the same curve the keyframes draw
export function Bars({ still, className }: { still?: boolean; className?: string }) {
    const box = useRef<HTMLSpanElement>(null)

    useEffect(() => {
        if (!paced() || still) return

        // thirty a second is plenty for a bob this slow, and every frame it
        // moves is a frame the whole window is composited again
        return add_painter(30, (now) => {
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

/*
 * A card: the sleeve, and the two lines under it. Under the pointer the whole
 * card stands on a piece of the same glass the rows are hovered with, the
 * sleeve darkens toward its foot and the play button comes up out of it; the
 * heart waits there too. A liked track says so beside its title rather than
 * with a badge over the picture, and the one playing is ringed in the accent.
 */
export const TrackCard = memo(function TrackCard({ name, within, className }: TrackProps & { className?: string }) {
    const { cover, liked, title, artist } = useTrack(name)
    const playing = usePlaying(name)

    return (
        <div className={cn('group relative min-w-0', className)} {...drag(name)} onContextMenu={context({ kind: 'song', song: name, within })}>
            <span aria-hidden className='hover-glass pointer-events-none absolute -inset-2 rounded-[calc(var(--r-cover)+0.5rem)] opacity-0 transition-opacity duration-200 group-hover:opacity-100' />

            <button type='button' className='relative block w-full text-left active:scale-[0.985] transition-[scale]' onClick={() => void play_from(name, within ?? null)}>
                <div
                    className={cn(
                        'relative aspect-square overflow-hidden rounded-(--r-cover) bg-surface-2 shadow-[0_18px_30px_-20px_rgb(0_0_0/0.75),0_2px_6px_-3px_rgb(0_0_0/0.35)]',
                        playing && 'outline-2 outline-offset-2 outline-accent',
                    )}
                >
                    <Cover data={cover} size='md' icon={28} className='size-full rounded-none' />
                    {/* a hairline of light round the sleeve, so a dark one still has an edge */}
                    <span aria-hidden className='pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.09)]' />
                    <span aria-hidden className='pointer-events-none absolute inset-0 bg-linear-to-t from-black/55 via-black/10 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100' />

                    <span
                        className={cn(
                            'absolute right-2.5 bottom-2.5 grid size-10 place-items-center rounded-full bg-accent text-accent-fg shadow-[0_8px_18px_-6px_rgb(0_0_0/0.6)] transition-[opacity,translate] duration-200',
                            playing ? 'translate-y-0 opacity-100' : 'translate-y-1.5 opacity-0 group-hover:translate-y-0 group-hover:opacity-100',
                        )}
                    >
                        {playing ? <Bars still={playing === 'paused'} className='on-accent' /> : <Play size={16} className='ml-0.5' />}
                    </span>
                </div>

                <p className={cn('mt-2.5 flex items-center gap-1.5 text-[0.875rem] font-medium', playing ? 'text-accent' : 'text-fg')}>
                    <span className='truncate'>{title}</span>
                    {liked && <HeartIcon size={12} aria-label='Liked' className='shrink-0 fill-current text-accent' />}
                </p>
                <p className='truncate text-[0.8125rem] text-muted'>{artist}</p>
            </button>

            {/* outside the main button, so buttons are not nested */}
            <Heart
                liked={liked}
                on_toggle={() => void toggle_like(name)}
                size={15}
                className='absolute top-2 right-2 size-8 rounded-full! bg-black/40 text-white! opacity-0 backdrop-blur-md transition-opacity group-hover:opacity-100 hover:bg-black/60'
            />
        </div>
    )
})

// a row's place in the list, and under the pointer what a click on it does
const Numbered = ({ index }: { index: number }) => (
    <>
        <span className='group-hover:hidden'>{index + 1}</span>
        <Play size={14} className='hidden text-fg group-hover:block' />
    </>
)

export const TrackLine = memo(function TrackLine({ name, within, index = 0 }: TrackProps) {
    const { liked, title, artist } = useTrack(name)
    const playing = usePlaying(name)

    return (
        <div
            role='button'
            tabIndex={0}
            {...drag(name)}
            onClick={() => void play_from(name, within ?? null)}
            onKeyDown={(e) => e.key === 'Enter' && void play_from(name, within ?? null)}
            onContextMenu={context({ kind: 'song', song: name, within })}
            data-hover
            className={cn('group relative flex h-(--row-line) items-center gap-3 rounded-lg px-3', playing && 'needle')}
        >
            <span className='grid w-7 shrink-0 place-items-center font-mono text-[0.75rem] text-muted tabular-nums'>{playing ? <Bars still={playing === 'paused'} /> : <Numbered index={index} />}</span>
            <p className={cn('min-w-0 flex-1 truncate text-[0.875rem]', playing ? 'font-medium text-fg' : 'text-fg')}>{title}</p>
            <p className='hidden w-1/3 truncate text-[0.8125rem] text-muted md:block'>{artist}</p>
            <Heart liked={liked} on_toggle={() => void toggle_like(name)} size={16} className={cn('size-8', !liked && 'opacity-0 group-hover:opacity-100')} />
        </div>
    )
})

const row_grid = 'grid-cols-[2rem_minmax(0,1fr)_2rem_3.5rem] md:grid-cols-[2rem_minmax(0,1.6fr)_minmax(0,1fr)_7rem_2rem_3.5rem]'

export const TrackRow = memo(function TrackRow({ name, within, index = 0 }: TrackProps) {
    const { cover, liked, title, artist } = useTrack(name)
    const playing = usePlaying(name)

    return (
        <div
            role='button'
            tabIndex={0}
            {...drag(name)}
            onClick={() => void play_from(name, within ?? null)}
            onKeyDown={(e) => e.key === 'Enter' && void play_from(name, within ?? null)}
            onContextMenu={context({ kind: 'song', song: name, within })}
            data-hover
            className={cn('group relative grid h-(--row) items-center gap-3 rounded-lg px-3', row_grid, playing && 'needle')}
        >
            <span className='grid place-items-center font-mono text-[0.75rem] text-muted tabular-nums'>{playing ? <Bars still={playing === 'paused'} /> : <Numbered index={index} />}</span>
            <div className='flex min-w-0 items-center gap-3'>
                <Cover data={cover} size='sm' className='size-9 in-[[data-density=compact]]:size-7' icon={14} />
                <div className='min-w-0'>
                    <p className={cn('truncate text-[0.875rem]', playing ? 'font-medium text-fg' : 'text-fg')}>{title}</p>
                    <p className='truncate text-[0.8125rem] text-muted in-[[data-density=compact]]:hidden'>{artist}</p>
                </div>
            </div>
            <p className='hidden truncate text-[0.8125rem] text-fg-2 md:block'>{album_of(name)}</p>
            <p className='hidden text-[0.8125rem] text-muted md:block'>{format_date(added_of(name))}</p>
            <Heart liked={liked} on_toggle={() => void toggle_like(name)} size={16} className={cn('size-8', !liked && 'opacity-0 group-hover:opacity-100')} />
            <p className='text-right font-mono text-[0.75rem] text-muted tabular-nums'>{format_time(length_of(name))}</p>
        </div>
    )
})

// the head over a full list: what each column is
export const TrackRowHead = () => (
    <div className={cn('mb-1 grid h-8 items-center gap-3 border-b border-line px-3 text-[0.75rem] text-muted', row_grid)}>
        <span className='text-center'>#</span>
        <span>Title</span>
        <span className='hidden md:block'>Album</span>
        <span className='hidden md:block'>Added</span>
        <span />
        <span className='text-right'>Time</span>
    </div>
)

export const card_grid = 'grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-x-5 gap-y-6'

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
import { More } from '../ui/More'

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

// a touch screen holds a finger down for the menu, and would start the drag
// instead: the card lifted out of its place under the finger
const COARSE = window.matchMedia('(pointer: coarse)').matches

const drag = (name: string) => COARSE ? {} : ({
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

export const TrackCard = memo(function TrackCard({ name, within, className }: TrackProps & { className?: string }) {
    const { cover, liked, title, artist } = useTrack(name)
    const playing = usePlaying(name)

    return (
        <div className={cn('group relative min-w-0', className)} {...drag(name)} onContextMenu={context({ kind: 'song', song: name, within })}>
            <button type='button' className='block w-full text-left' onClick={() => void play_from(name, within ?? null)}>
                <div className='relative aspect-square overflow-hidden rounded-(--r-cover) bg-surface-2 shadow-[0_14px_28px_-18px_rgb(0_0_0/0.7)]'>
                    <Cover data={cover} size='md' icon={28} className='size-full rounded-none' />
                    <div className='absolute inset-0 bg-black/25 opacity-0 transition-opacity group-hover:opacity-100' />

                    <span
                        className={cn(
                            'absolute right-2 bottom-2 grid size-9 place-items-center rounded-full bg-accent text-accent-fg transition-opacity',
                            playing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                        )}
                    >
                        {playing ? <Bars still={playing === 'paused'} className='on-accent' /> : <Play size={16} className='ml-0.5' />}
                    </span>
                </div>

                <p className='card-text mt-2 truncate text-[0.875rem] font-medium text-fg max-sm:pr-8'>{title}</p>
                <p className='card-text truncate text-[0.8125rem] text-muted max-sm:pr-8'>{artist}</p>
            </button>
            <More target={{ kind: 'song', song: name, within }} className='absolute right-[-0.5rem] bottom-[-0.25rem]' />

            {/* outside the main button, so buttons are not nested */}
            <Heart
                liked={liked}
                on_toggle={() => void toggle_like(name)}
                size={16}
                className={cn('absolute top-2 right-2 size-8 bg-black/55 text-white hover:text-white', liked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}
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
            className={cn('[zoom:var(--z-lists,1)] row-skip group relative flex h-(--row-line) items-center gap-3 rounded-lg px-3', playing && 'needle')}
        >
            <span className='grid w-7 shrink-0 place-items-center font-mono text-[0.75rem] text-muted tabular-nums'>{playing ? <Bars still={playing === 'paused'} /> : <Numbered index={index} />}</span>
            <p className={cn('min-w-0 flex-1 truncate text-[0.875rem]', playing ? 'font-medium text-fg' : 'text-fg')}>{title}</p>
            <p className='hidden w-1/3 truncate text-[0.8125rem] text-muted md:block'>{artist}</p>
            <Heart liked={liked} on_toggle={() => void toggle_like(name)} size={16} className={cn('size-8', !liked && 'opacity-0 group-hover:opacity-100 max-sm:hidden')} />
            <More target={{ kind: 'song', song: name, within }} className='-mr-2' />
        </div>
    )
})

const row_grid = 'grid-cols-[2rem_minmax(0,1fr)_2rem_3.5rem] md:grid-cols-[2rem_minmax(0,1.6fr)_minmax(0,1fr)_7rem_2rem_3.5rem] max-sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] max-sm:gap-2'

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
            className={cn('[zoom:var(--z-lists,1)] row-skip group relative grid h-(--row) items-center gap-3 rounded-lg px-3 max-sm:-mx-2 max-sm:pr-0 max-sm:pl-2', row_grid, playing && 'needle')}
        >
            <span className='grid place-items-center font-mono text-[0.75rem] text-muted tabular-nums max-sm:hidden'>{playing ? <Bars still={playing === 'paused'} /> : <Numbered index={index} />}</span>
            <div className='flex min-w-0 items-center gap-3'>
                <Cover data={cover} size='sm' className='size-9 sm:in-[[data-density=compact]]:size-7 max-sm:size-[3.15rem]' icon={14} />
                <div className='min-w-0'>
                    <p className={cn('truncate text-[0.875rem] max-sm:text-[1.0625rem]', playing ? 'font-medium text-fg max-sm:text-accent' : 'text-fg')}>{title}</p>
                    <p className='truncate text-[0.8125rem] text-muted sm:in-[[data-density=compact]]:hidden max-sm:text-[0.9375rem]'>{artist}</p>
                </div>
            </div>
            <p className='hidden truncate text-[0.8125rem] text-fg-2 md:block'>{album_of(name)}</p>
            <p className='hidden text-[0.8125rem] text-muted md:block'>{format_date(added_of(name))}</p>
            <Heart liked={liked} on_toggle={() => void toggle_like(name)} size={16} className={cn('size-8', !liked && 'opacity-0 group-hover:opacity-100 max-sm:hidden')} />
            <p className='text-right font-mono text-[0.75rem] text-muted tabular-nums max-sm:w-10 max-sm:text-[0.8125rem]'>{format_time(length_of(name))}</p>
            <More target={{ kind: 'song', song: name, within }} />
        </div>
    )
})

// the head over a full list: what each column is
export const TrackRowHead = () => (
    <div className={cn('mb-1 grid h-8 items-center gap-3 border-b border-line px-3 text-[0.75rem] text-muted max-sm:hidden', row_grid)}>
        <span className='text-center'>#</span>
        <span>Title</span>
        <span className='hidden md:block'>Album</span>
        <span className='hidden md:block'>Added</span>
        <span />
        <span className='text-right'>Time</span>
    </div>
)

export const card_grid = 'grid grid-cols-[repeat(auto-fill,minmax(calc(9.5rem*var(--z-cards,1)),1fr))] gap-x-5 gap-y-6 max-sm:gap-x-3.5'

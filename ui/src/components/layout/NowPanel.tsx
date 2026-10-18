import { useEffect, useRef, useState } from 'react'
import { useSheet } from '../../hooks/sheet'
import { ChevronDown, ChevronUp, ListMusic, MicVocal, PanelRightClose, X, Expand } from '../ui/icons'
import { cn } from '../../lib/cn'
import { useClock } from '../../lib/clock'
import { useStore } from '../../lib/store'
import { useQueue } from '../../state/derive'
import { artist_of, library, title_of } from '../../state/library'
import { clear_queue, move_in_queue, play_music, player, remove_from_queue, seek_to } from '../../state/player'
import { context, set_pref, ui } from '../../state/ui'
import { Button, IconButton } from '../ui/Button'
import { Empty, Segmented } from '../ui/Controls'
import { Cover } from '../ui/Cover'
import { tip } from '../../lib/tip'

export function Lyrics({ big }: { big?: boolean }) {
    const { sheet, timed, waiting } = useSheet()
    const [line, set_line] = useState(-1)
    const box = useRef<HTMLDivElement>(null)

    useClock((seconds) => {
        // the line in force is the last one whose stamp has passed
        let index = -1
        if (timed) while (index + 1 < timed.length && timed[index + 1].at <= seconds + 0.15) index++

        if (index !== line) set_line(index)
    })

    // centred inside its own box, without dragging whatever the box sits in
    useEffect(() => {
        const node = box.current
        const row = node?.children[line] as HTMLElement | undefined
        if (!node || !row) return

        node.scrollTo({ top: row.offsetTop - node.clientHeight / 2 + row.offsetHeight / 2, behavior: 'smooth' })
    }, [line])

    if (timed) {
        return (
            <div ref={box} className='relative min-h-0 flex-1 overflow-y-auto py-[40%] [mask-image:linear-gradient(transparent,#000_18%,#000_82%,transparent)]'>
                {timed.map((row, i) => (
                    <button
                        key={`${row.at}-${i}`}
                        type='button'
                        {...tip('Jump to this line')}
                        onClick={() => void seek_to(row.at)}
                        className={cn(
                            'block w-full rounded-lg px-2 py-1.5 text-left font-semibold tracking-tight transition-[color,opacity,scale] duration-500 ease-soft hover:text-fg',
                            big ? 'text-2xl' : 'text-[1.02rem]',
                            i === line ? 'text-fg' : Math.abs(i - line) === 1 ? 'text-fg/45' : 'text-fg/25',
                        )}
                    >
                        {row.text || '♪'}
                    </button>
                ))}
            </div>
        )
    }

    if (sheet) {
        // plain lyrics carry no timing: nothing to follow, nothing to click
        return <p className='min-h-0 flex-1 overflow-y-auto text-sm leading-relaxed whitespace-pre-line text-fg/80 select-text'>{sheet}</p>
    }

    return (
        <div className='grid flex-1 place-items-center'>
            <p className='text-xs text-muted'>{waiting ? 'Looking for lyrics…' : 'No lyrics for this track.'}</p>
        </div>
    )
}

function QueueRow({ name, index, manual, last }: { name: string; index: number; manual: boolean; last: number }) {
    const cover = useStore(library, (s) => s.covers[name])

    return (
        <div className='group flex h-13 items-center gap-3 rounded-xl px-2 transition-colors hover:bg-surface-2' onContextMenu={context({ kind: 'song', song: name })}>
            <Cover data={cover} size='sm' className='size-9' icon={14} />
            <button type='button' onClick={() => void play_music(name)} className='min-w-0 flex-1 text-left'>
                <p className='truncate text-[0.8rem]'>{title_of(name)}</p>
                <p className='truncate text-xs text-muted'>{artist_of(name)}</p>
            </button>
            {manual && (
                <div className='flex opacity-0 transition-opacity group-hover:opacity-100'>
                    <IconButton size='sm' {...tip('Move up')} disabled={index <= 1} onClick={() => move_in_queue(index, -1)}>
                        <ChevronUp size={14} />
                    </IconButton>
                    <IconButton size='sm' {...tip('Move down')} disabled={index >= last} onClick={() => move_in_queue(index, 1)}>
                        <ChevronDown size={14} />
                    </IconButton>
                    <IconButton size='sm' {...tip('Remove')} onClick={() => remove_from_queue(index)}>
                        <X size={14} />
                    </IconButton>
                </div>
            )}
        </div>
    )
}

// a hand-built queue repeats until it is stopped; anything else is the listing
// or the section the track came from
function Queue() {
    const current = useStore(player, (s) => s.current)
    const manual = useStore(player, (s) => s.manual_queue)
    const cover = useStore(library, (s) => (current ? s.covers[current] : undefined))
    const queue = useQueue()

    if (!current) return <Empty className='mt-4' icon={<ListMusic size={20} />} title='Nothing queued yet.'>Right-click a track and pick Play next or Add to queue.</Empty>

    const at = queue.indexOf(current)
    const upcoming = (at < 0 ? queue : queue.slice(at + 1)).slice(0, 80)

    return (
        <div className='min-h-0 flex-1 overflow-y-auto'>
            <p className='mb-2 px-2 text-[0.68rem] font-medium tracking-wide text-muted uppercase'>Now playing</p>
            <div className='mb-5 flex items-center gap-3 rounded-xl bg-surface-2 px-2 py-2'>
                <Cover data={cover} size='sm' className='size-10' icon={14} />
                <div className='min-w-0'>
                    <p className='truncate text-[0.8rem] font-medium text-accent'>{title_of(current)}</p>
                    <p className='truncate text-xs text-muted'>{artist_of(current)}</p>
                </div>
            </div>

            <div className='mb-2 flex items-center px-2'>
                <p className='flex-1 text-[0.68rem] font-medium tracking-wide text-muted uppercase'>{manual ? 'Your queue · repeats' : 'Up next'}</p>
                {manual && (
                    <Button variant='ghost' size='sm' onClick={clear_queue} className='-mr-2 h-6'>
                        Clear
                    </Button>
                )}
            </div>

            {upcoming.length ? (
                upcoming.map((name, i) => <QueueRow key={`${name}:${i}`} name={name} index={at + i + 1} manual={!!manual} last={queue.length - 1} />)
            ) : (
                <p className='px-2 py-4 text-xs text-muted'>That was the last one.</p>
            )}
        </div>
    )
}

// `open` is the app's call: the panel can be asked for and still have no room
export function NowPanel({ open }: { open: boolean }) {
    const hidden = !open
    const tab = useStore(ui, (s) => s.panel_tab)
    const current = useStore(player, (s) => s.current)
    const { sheet, timed } = useSheet()

    return (
        <aside inert={hidden} className={cn('edge flex min-h-0 flex-col overflow-hidden rounded-2xl bg-surface transition-opacity duration-300', hidden ? 'invisible p-0 opacity-0' : 'p-4')}>
            <div className='mb-4 flex items-center gap-2'>
                <Segmented
                    value={tab}
                    on_change={(next) => set_pref('panel_tab', next)}
                    options={[
                        { id: 'lyrics', label: <><MicVocal size={13} /> Lyrics</> },
                        { id: 'queue', label: <><ListMusic size={13} /> Queue</> },
                    ]}
                />
                {tab === 'lyrics' && sheet && !timed && <span className='text-[0.7rem] text-muted'>Not synced</span>}
                {tab === 'lyrics' && current && (
                    <IconButton size='sm' {...tip('Full screen')} onClick={() => ui.set({ lyrics_open: true })} className='ml-auto'>
                        <Expand size={14} />
                    </IconButton>
                )}
                <IconButton size='sm' {...tip('Hide panel')} onClick={() => set_pref('panel_hidden', true, 'rail_hidden')} className={tab === 'lyrics' && current ? '' : 'ml-auto'}>
                    <PanelRightClose size={15} />
                </IconButton>
            </div>

            {tab === 'queue' ? (
                <Queue />
            ) : current ? (
                <Lyrics />
            ) : (
                <Empty className='mt-4' icon={<MicVocal size={20} />} title='Nothing playing'>
                    The words to whatever you play show up here, and follow along when they are timed.
                </Empty>
            )}
        </aside>
    )
}

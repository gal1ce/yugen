import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { useSheet } from '../../hooks/sheet'
import { ChevronDown, ChevronUp, ListMusic, MicVocal, Waveform, X, Expand } from '../ui/icons'
import { cn } from '../../lib/cn'
import { spring } from '../../lib/motion'
import { useStore } from '../../lib/store'
import { useQueue } from '../../state/derive'
import { artist_of, library, title_of } from '../../state/library'
import { add_to_drift, clear_drift, clear_queue, keep_drift, move_in_queue, play_music, player, remove_from_drift, remove_from_queue } from '../../state/player'
import { context, set_pref, ui } from '../../state/ui'
import { Button, IconButton } from '../ui/Button'
import { Empty, Segmented } from '../ui/Controls'
import { Cover } from '../ui/Cover'
import { tip } from '../../lib/tip'
import { LyricFlow } from '../media/LyricFlow'
import { QueueSuggestions } from '../media/Suggest'
import { TRACK_DRAG } from '../media/Track'
import { Scroll } from '../ui/Scroll'

/*
 * The words of what is playing, small, beside the page. A timed sheet follows
 * along: the line in force is whole and carries the needle, the ones around it
 * fade back, and the box glides so that line sits in the middle. A click on
 * any line goes there.
 */
export function Lyrics() {
    const { sheet, timed, waiting } = useSheet()

    // small words beside the page are read at a glance: none of them out of focus
    if (timed) {
        return <LyricFlow lines={timed} size='text-[1.1875rem]' soft={false} className='-mx-1 flex-1 pl-1 [mask-image:linear-gradient(transparent,#000_14%,#000_80%,transparent)]' />
    }

    if (sheet) {
        // plain lyrics carry no timing: nothing to follow, nothing to click
        return (
            <Scroll className='flex-1' inner='pb-6'>
                <p className='font-serif text-[1rem] leading-relaxed whitespace-pre-line text-fg-2 select-text'>{sheet}</p>
            </Scroll>
        )
    }

    return (
        <div className='grid flex-1 place-items-center'>
            <p className='text-[0.8125rem] text-muted'>{waiting ? 'Looking for lyrics' : 'No lyrics for this track'}</p>
        </div>
    )
}

function QueueRow({ name, index, manual, last }: { name: string; index: number; manual: boolean; last: number }) {
    const cover = useStore(library, (s) => s.covers[name])

    return (
        <div className='group flex h-12 items-center gap-3 rounded-lg px-2 transition-colors hover:bg-surface-2' onContextMenu={context({ kind: 'song', song: name })}>
            <Cover data={cover} size='sm' className='size-8' icon={14} />
            <button type='button' onClick={() => void play_music(name)} className='min-w-0 flex-1 text-left'>
                <p className='truncate text-[0.8125rem]'>{title_of(name)}</p>
                <p className='truncate text-[0.75rem] text-muted'>{artist_of(name)}</p>
            </button>
            {manual && (
                <div className='flex opacity-0 transition-opacity group-hover:opacity-100'>
                    <IconButton size='sm' {...tip('Move up')} disabled={index <= 1} onClick={() => move_in_queue(index, -1)}>
                        <ChevronUp size={16} />
                    </IconButton>
                    <IconButton size='sm' {...tip('Move down')} disabled={index >= last} onClick={() => move_in_queue(index, 1)}>
                        <ChevronDown size={16} />
                    </IconButton>
                    <IconButton size='sm' {...tip('Remove')} onClick={() => remove_from_queue(index)}>
                        <X size={16} />
                    </IconButton>
                </div>
            )}
        </div>
    )
}

function DriftRow({ name, index, crossing }: { name: string; index: number; crossing?: boolean }) {
    const cover = useStore(library, (s) => s.covers[name])

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            // leaving the fence: it drifts off to the side and is gone
            exit={{ opacity: 0, x: 40, transition: { duration: 0.35 } }}
            transition={spring.smooth}
            className={cn('group relative flex h-11 items-center gap-3 rounded-lg px-2', crossing ? 'needle bg-surface-2' : 'hover:bg-surface-2')}
            onContextMenu={context({ kind: 'song', song: name })}
        >
            <Cover data={cover} size='sm' className='size-7' icon={12} />
            <div className='min-w-0 flex-1'>
                <p className='truncate text-[0.8125rem]'>{title_of(name)}</p>
                <p className='truncate text-[0.75rem] text-muted'>{crossing ? 'Crossing now' : artist_of(name)}</p>
            </div>
            {!crossing && (
                <IconButton size='sm' {...tip('Take it out')} onClick={() => remove_from_drift(index)} className='opacity-0 group-hover:opacity-100'>
                    <X size={14} />
                </IconButton>
            )}
        </motion.div>
    )
}

/*
 * The drift, drawn as what it is: a fenced stretch in front of the queue. A
 * track dropped in waits its turn; the one crossing carries the needle; once
 * it has played it drifts out of the fence and is gone. Empty, the fence is
 * still there as a place to drop things.
 */
function Drift() {
    const drift = useStore(player, (s) => s.drift)
    const crossing = useStore(player, (s) => s.crossing)
    const drifted = useStore(player, (s) => s.drifted)
    const [over, set_over] = useState(false)
    const [kept, set_kept] = useState('')
    const count = drift.length + (crossing ? 1 : 0)

    return (
        <section
            onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(TRACK_DRAG)) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
                set_over(true)
            }}
            onDragLeave={() => set_over(false)}
            onDrop={(e) => {
                set_over(false)
                const name = e.dataTransfer.getData(TRACK_DRAG)
                if (name) add_to_drift(name)
            }}
            className={cn(
                'mb-6 rounded-xl border border-dashed p-1.5 transition-colors',
                over ? 'border-accent bg-[color-mix(in_oklab,var(--accent)_8%,transparent)]' : 'border-line-strong',
            )}
        >
            <div className='flex h-8 items-center gap-2 px-1.5'>
                <Waveform size={14} className='text-accent' />
                <p className='flex-1 text-[0.8125rem]'>Drift</p>
                <span className='font-mono text-[0.6875rem] text-muted'>{count || ''}</span>
                {(drifted.length > 0 || count > 0) && (
                    <Button
                        variant='ghost'
                        size='sm'
                        className='h-7 px-2.5'
                        {...tip('Save everything that went through as a playlist')}
                        onClick={async () => set_kept((await keep_drift()) ?? '')}
                    >
                        Keep
                    </Button>
                )}
                {drift.length > 0 && (
                    <Button variant='ghost' size='sm' className='h-7 px-2.5' onClick={clear_drift}>
                        Clear
                    </Button>
                )}
            </div>

            <AnimatePresence initial={false} mode='popLayout'>
                {crossing && <DriftRow key={`crossing:${crossing}`} name={crossing} index={-1} crossing />}
                {drift.map((name, i) => (
                    <DriftRow key={`drift:${name}`} name={name} index={i} />
                ))}
            </AnimatePresence>

            {!count && (
                <p className='px-2 pt-1 pb-2 text-[0.75rem] leading-relaxed text-muted'>
                    {kept ? `Kept as ${kept}. ` : ''}Drop a track here, or pick Drift from its menu. It plays once, next, and then leaves.
                </p>
            )}
        </section>
    )
}

// a hand-built queue repeats until it is stopped; anything else is the listing
// or the section the track came from
function Queue() {
    const current = useStore(player, (s) => s.current)
    const crossing = useStore(player, (s) => s.crossing)
    const back = useStore(player, (s) => s.drift_return)
    const manual = useStore(player, (s) => s.manual_queue)
    const cover = useStore(library, (s) => (current ? s.covers[current] : undefined))
    const suggested = useStore(ui, (s) => s.suggest_on && s.places.includes('queue'))
    const queue = useQueue()

    // while a drifting track plays, up next is where the queue was left
    const anchor = crossing ? back : current
    const at = anchor ? queue.indexOf(anchor) : -1
    const upcoming = (at < 0 ? queue : queue.slice(at + 1)).slice(0, 80)

    return (
        <Scroll className='flex-1' inner='pb-4'>
            {current && !crossing && (
                <>
                    <p className='mb-2 px-2 text-[0.8125rem] text-muted'>Now playing</p>
                    <div className='needle relative mb-5 flex items-center gap-3 rounded-lg bg-surface-2 px-2 py-2'>
                        <Cover data={cover} size='sm' className='size-10' icon={14} />
                        <div className='min-w-0'>
                            <p className='truncate text-[0.875rem] font-medium'>{title_of(current)}</p>
                            <p className='truncate text-[0.75rem] text-muted'>{artist_of(current)}</p>
                        </div>
                    </div>
                </>
            )}

            <Drift />

            {current ? (
                <>
                    <div className='mb-2 flex h-6 items-center px-2'>
                        <p className='flex-1 text-[0.8125rem] text-muted'>{manual ? 'Your queue, on repeat' : crossing ? 'Then, back to' : 'Up next'}</p>
                        {manual && (
                            <Button variant='ghost' size='sm' onClick={clear_queue} className='-mr-2 h-7'>
                                Clear
                            </Button>
                        )}
                    </div>

                    {upcoming.length ? (
                        upcoming.map((name, i) => <QueueRow key={`${name}:${i}`} name={name} index={at + i + 1} manual={!!manual} last={queue.length - 1} />)
                    ) : (
                        <p className='px-2 py-4 text-[0.8125rem] text-muted'>That was the last one</p>
                    )}

                    {suggested && <QueueSuggestions />}
                </>
            ) : (
                <Empty icon={<ListMusic size={20} />} title='Nothing queued yet'>
                    Right-click a track and pick Play next, Add to queue or Drift.
                </Empty>
            )}
        </Scroll>
    )
}

// `open` is the app's call: the panel can be asked for and still have no room
export function NowPanel({ open }: { open: boolean }) {
    const hidden = !open
    const tab = useStore(ui, (s) => s.panel_tab)
    const current = useStore(player, (s) => s.current)
    const { sheet, timed } = useSheet()

    return (
        <aside inert={hidden} className={cn('panel flex min-h-0 flex-col overflow-hidden rounded-(--r-panel) transition-opacity duration-200', hidden ? 'invisible p-0 opacity-0' : 'p-3')}>
            <div className='mb-4 flex items-center gap-2'>
                <Segmented
                    value={tab}
                    on_change={(next) => set_pref('panel_tab', next)}
                    options={[
                        { id: 'lyrics', label: 'Lyrics' },
                        { id: 'queue', label: 'Queue' },
                    ]}
                />
                {tab === 'lyrics' && sheet && !timed && <span className='text-[0.75rem] text-muted'>Not synced</span>}
                {tab === 'lyrics' && current && (
                    <IconButton size='sm' {...tip('Full screen lyrics')} onClick={() => ui.set({ lyrics_open: true })} className='ml-auto'>
                        <Expand size={16} />
                    </IconButton>
                )}
            </div>

            {tab === 'queue' ? (
                <Queue />
            ) : current ? (
                <Lyrics />
            ) : (
                <Empty icon={<MicVocal size={20} />} title='Nothing playing'>
                    The words of whatever you play show up here, and follow along when they are timed.
                </Empty>
            )}
        </aside>
    )
}

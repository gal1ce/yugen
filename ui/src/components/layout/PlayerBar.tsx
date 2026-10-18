import { useCallback, useRef, useState } from 'react'
import { useDismiss } from '../../hooks/dismiss'
import { MenuItem, MenuLabel, MenuPanel } from '../ui/Menu'
import { Expand, ListMusic, MicVocal, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume, Volume1, Volume2, VolumeX } from '../ui/icons'
import { Discord } from '../ui/icons'
import { cn } from '../../lib/cn'
import { useClock } from '../../lib/clock'
import { format_time } from '../../lib/format'
import { SHUFFLES } from '../../lib/prefs'
import { useStore } from '../../lib/store'
import { useQueue } from '../../state/derive'
import { artist_of, library, title_of, toggle_like } from '../../state/library'
import {
    change_volume,
    hold_seek,
    next_shuffle,
    player,
    seek_to,
    set_sharing,
    shuffle_into,
    skip,
    toggle_loop,
    toggle_mute,
    toggle_pause,
} from '../../state/player'
import { context, set_pref, ui, type PanelTab } from '../../state/ui'
import { IconButton } from '../ui/Button'
import { Heart, Range } from '../ui/Controls'
import { Cover } from '../ui/Cover'
import { tip } from '../../lib/tip'

function NowPlaying() {
    const current = useStore(player, (s) => s.current)
    const cover = useStore(library, (s) => (current ? s.covers[current] : undefined))
    const liked = useStore(library, (s) => (current ? s.liked.has(current) : false))
    useStore(library, (s) => (current ? s.meta[current] : undefined))

    if (!current) {
        return (
            <div className='flex min-w-0 items-center gap-3'>
                <Cover className='size-12' />
                <p className='text-xs text-muted'>Nothing playing</p>
            </div>
        )
    }

    return (
        <div className='flex min-w-0 items-center gap-3' onContextMenu={context({ kind: 'song', song: current })}>
            {/* the sleeve opens the words, the lines open the card about the
                track: two things worth asking, one press each */}
            <button type='button' {...tip('Lyrics')} onClick={() => ui.set({ lyrics_open: true })} className='group relative shrink-0'>
                <Cover data={cover} size='sm' className='size-12 transition-transform duration-300 ease-spring group-hover:scale-105' />
                <span className='absolute inset-0 grid place-items-center rounded-lg bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100'>
                    <Expand size={15} />
                </span>
            </button>
            <button type='button' {...tip('Track info')} onClick={() => ui.set({ info_open: true, info_face: 'about' })} className='min-w-0 text-left'>
                <p className='truncate text-[0.82rem] font-medium hover:underline'>{title_of(current)}</p>
                <p className='truncate text-xs text-muted'>{artist_of(current)}</p>
            </button>
            <Heart liked={liked} on_toggle={() => void toggle_like(current)} className='size-8' />
        </div>
    )
}

export function Progress() {
    const length = useStore(player, (s) => s.length)
    const current = useStore(player, (s) => s.current)
    const fill = useRef<HTMLSpanElement>(null)
    const knob = useRef<HTMLSpanElement>(null)
    const elapsed = useRef<HTMLSpanElement>(null)
    const box = useRef<HTMLDivElement>(null)
    const dragging = useRef(false)

    // written into the dom once a frame while playing, and never a render
    useClock((seconds) => {
        const at = Math.min(seconds, length || Infinity)
        const share = length ? (at / length) * 100 : 0

        // moved rather than resized: a transform is no layout, a width is one a frame
        if (fill.current) fill.current.style.transform = `translateX(${share - 100}%)`
        if (knob.current) knob.current.style.transform = `translateX(${share}%)`

        const shown = format_time(at)
        if (elapsed.current && elapsed.current.textContent !== shown) elapsed.current.textContent = shown
    })

    const target = (e: React.PointerEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect()
        return Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1) * length
    }

    return (
        <div className='flex w-full items-center gap-2.5 text-[0.7rem] text-muted tabular-nums'>
            <span ref={elapsed} className='w-9 text-right'>
                0:00
            </span>
            <div
                ref={box}
                className={cn('group relative flex h-4 flex-1 items-center', current && length ? 'cursor-pointer' : 'pointer-events-none')}
                onPointerDown={(e) => {
                    if (!current || !length) return
                    e.currentTarget.setPointerCapture(e.pointerId)
                    dragging.current = true
                    box.current?.classList.add('dragging')
                    hold_seek(target(e))
                }}
                onPointerMove={(e) => dragging.current && hold_seek(target(e))}
                onPointerUp={(e) => {
                    if (!dragging.current) return
                    dragging.current = false
                    box.current?.classList.remove('dragging')

                    const at = target(e)
                    void seek_to(at).then(() => hold_seek(null))
                }}
                onPointerCancel={() => {
                    dragging.current = false
                    box.current?.classList.remove('dragging')
                    hold_seek(null)
                }}
            >
                <div className='h-1 w-full overflow-hidden rounded-full bg-surface-3 transition-[height] group-hover:h-1.5 group-[.dragging]:h-1.5'>
                    {/* parked off to the left by an inline transform, the same property the
                        clock writes. tailwind's translate-* classes are the separate
                        `translate` property, which would stack on top of it */}
                    <span ref={fill} style={{ transform: 'translateX(-100%)' }} className='block h-full w-full rounded-full bg-fg group-hover:bg-accent group-[.dragging]:bg-accent' />
                </div>
                {/* the rail is as wide as the track, so a percentage of its own
                    width is a percentage of the track */}
                <span ref={knob} className='pointer-events-none absolute inset-x-0 flex'>
                    <span className='size-3 -translate-x-1/2 scale-0 rounded-full bg-fg shadow transition-transform group-hover:scale-100 group-[.dragging]:scale-100' />
                </span>
            </div>
            <span className='w-9'>{format_time(length)}</span>
        </div>
    )
}

export function Controls() {
    const current = useStore(player, (s) => s.current)
    const paused = useStore(player, (s) => s.paused)
    const looped = useStore(player, (s) => s.looped)
    const shuffle = useStore(player, (s) => s.shuffle_mode)
    const queue = useQueue()

    const shuffle_label = SHUFFLES.find((option) => option.id === shuffle)?.label ?? ''
    const [picking, set_picking] = useState(false)
    const stop_picking = useCallback(() => set_picking(false), [])

    useDismiss(picking, stop_picking)

    return (
        <div className='flex items-center gap-2'>
            {/* a click steps to the next state, a right-click picks one outright -
                or deals the same one again, the only way to re-roll an order */}
            <div className='relative' onClick={(e) => e.stopPropagation()}>
                <IconButton
                    size='sm'
                    variant={shuffle !== 'off' ? 'on' : 'plain'}
                    {...tip(`${shuffle_label} · right-click to pick`)}
                    disabled={!queue.length}
                    onClick={() => void shuffle_into(next_shuffle())}
                    onContextMenu={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        set_picking(!picking)
                    }}
                    className='relative'
                >
                    <Shuffle size={16} />
                    {shuffle === 'all' && <span className='absolute top-0.5 right-0.5 size-1.5 rounded-full bg-accent' />}
                </IconButton>
                {picking && (
                    <MenuPanel className='absolute bottom-full left-1/2 mb-3 w-60 -translate-x-1/2'>
                        <MenuLabel>Shuffle</MenuLabel>
                        {SHUFFLES.map((option) => (
                            <MenuItem
                                key={option.id}
                                checked={shuffle === option.id}
                                hint={option.hint}
                                onClick={() => {
                                    set_picking(false)
                                    void shuffle_into(option.id)
                                }}
                            >
                                {option.label}
                            </MenuItem>
                        ))}
                    </MenuPanel>
                )}
            </div>
            <IconButton {...tip('Previous')} disabled={!queue.length} onClick={() => skip(-1)}>
                <SkipBack size={18} className='fill-current' />
            </IconButton>
            <button
                type='button'
                {...tip(paused ? 'Play' : 'Pause')}
                disabled={!current}
                onClick={() => void toggle_pause()}
                className='grid size-11 place-items-center rounded-full bg-fg text-bg transition-[scale,opacity] hover:scale-105 active:scale-95 disabled:opacity-40'
            >
                {paused || !current ? <Play size={19} className='ml-0.5 fill-current' /> : <Pause size={19} className='fill-current' />}
            </button>
            <IconButton {...tip('Next')} disabled={!queue.length} onClick={() => skip(1)}>
                <SkipForward size={18} className='fill-current' />
            </IconButton>
            <IconButton size='sm' variant={looped ? 'on' : 'plain'} {...tip(looped ? 'Stop repeating' : 'Repeat this track')} onClick={() => void toggle_loop()}>
                {looped ? <Repeat1 size={16} /> : <Repeat size={16} />}
            </IconButton>
        </div>
    )
}

function PanelButton({ tab, icon, label }: { tab: PanelTab; icon: React.ReactNode; label: string }) {
    const on = useStore(ui, (s) => !s.panel_hidden && s.panel_tab === tab)

    return (
        <IconButton
            size='sm'
            variant={on ? 'on' : 'plain'}
            {...tip(on ? `Hide ${label.toLowerCase()}` : label)}
            onClick={() => {
                if (on) return set_pref('panel_hidden', true, 'rail_hidden')
                set_pref('panel_tab', tab)
                set_pref('panel_hidden', false, 'rail_hidden')
            }}
        >
            {icon}
        </IconButton>
    )
}

function LyricsButton() {
    const open = useStore(ui, (s) => s.lyrics_open)
    const current = useStore(player, (s) => s.current)

    return (
        <IconButton size='sm' variant={open ? 'on' : 'plain'} disabled={!current} {...tip('Lyrics')} onClick={() => ui.set({ lyrics_open: !open })}>
            <MicVocal size={17} />
        </IconButton>
    )
}

function Extras() {
    const volume = useStore(player, (s) => s.volume)
    const share = useStore(ui, (s) => s.share_dc)
    const manual = useStore(player, (s) => s.manual_queue)
    const VolumeIcon = volume === 0 ? VolumeX : volume < 0.34 ? Volume : volume < 0.67 ? Volume1 : Volume2

    return (
        <div className='flex items-center justify-end gap-1'>
            <LyricsButton />
            <span className='relative'>
                <PanelButton tab='queue' icon={<ListMusic size={16} />} label='Queue' />
                {manual && <span className='pointer-events-none absolute top-0 right-0 size-1.5 rounded-full bg-accent' />}
            </span>
            <IconButton
                size='sm'
                variant={share ? 'on' : 'plain'}
                aria-pressed={share}
                {...tip(share ? 'Stop sharing on Discord' : 'Share what you play on Discord')}
                onClick={() => {
                    void set_sharing(!share)
                    set_pref('share_dc', !share)
                }}
            >
                <Discord size={16} />
            </IconButton>
            <IconButton size='sm' {...tip(volume === 0 ? 'Unmute' : 'Mute')} onClick={toggle_mute} className='ml-1'>
                <VolumeIcon size={16} />
            </IconButton>
            <Range value={volume} min={0} max={1} step={0.01} aria-label='Volume' on_change={change_volume} className='w-24' />
        </div>
    )
}

export function PlayerBar() {
    return (
        <footer className='relative grid h-20 shrink-0 grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-6 border-t border-line bg-surface px-5'>
            <NowPlaying />
            <div className='flex flex-col items-center gap-1.5'>
                <Controls />
                <Progress />
            </div>
            <Extras />
        </footer>
    )
}

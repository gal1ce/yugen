import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import { useDismiss } from '../../hooks/dismiss'
import { usePhone } from '../../hooks/phone'
import { usePull } from '../../hooks/pull'
import { AnimatePresence, LayoutGroup, motion, useDragControls, useMotionValue } from 'motion/react'
import { spring } from '../../lib/motion'
import { useSheet } from '../../hooks/sheet'
import { useClock } from '../../lib/clock'
import { hold_painters } from '../../lib/fx'
import { cn } from '../../lib/cn'
import type { LyricsSize } from '../../lib/prefs'
import { useStore } from '../../lib/store'
import { tip } from '../../lib/tip'
import { album_of, artist_of, library, title_of, toggle_like } from '../../state/library'
import { change_volume, clear_drift, player, remove_from_drift, skip, toggle_mute, toggle_pause } from '../../state/player'
import { useQueue } from '../../state/derive'
import { set_pref, ui, type SheetFace } from '../../state/ui'
import { Ambient } from '../fx/Ambient'
import { Wave } from '../fx/Wave'
import { Controls, Progress } from '../layout/PlayerBar'
import { Queue } from '../layout/NowPanel'
import { LyricFlow } from '../media/LyricFlow'
import { Button, IconButton } from '../ui/Button'
import { Heart, Range, Segmented } from '../ui/Controls'
import { Cover } from '../ui/Cover'
import { CaretDoubleDown, ChevronDown, Expand, Info, ListMusic, MicVocal, Pause, Play, SkipForward, Volume1, Volume2, VolumeX, Waveform, X } from '../ui/icons'
import { Scroll } from '../ui/Scroll'

const close = () => ui.set({ lyrics_open: false })

// the words are set at one of three sizes (settings, lyrics); each scales with
// the window between a floor and a ceiling
const SIZES: Record<LyricsSize, string> = {
    small: 'text-[clamp(1.5rem,2vw,2rem)]',
    medium: 'text-[clamp(1.875rem,2.6vw,2.75rem)]',
    large: 'text-[clamp(2.25rem,3.3vw,3.5rem)]',
}

/*
 * The words. Timed ones flow (media/LyricFlow); plain ones are a sheet to
 * read and scroll; none is said plainly, in the place the words would be.
 */
function Words() {
    const { sheet, timed, waiting } = useSheet()
    const size = useStore(ui, (s) => s.lyrics_size)
    const soft = useStore(ui, (s) => s.blur)

    if (timed) {
        return <LyricFlow lines={timed} size={SIZES[size]} soft={soft} className='h-full [mask-image:linear-gradient(transparent,#000_16%,#000_78%,transparent)]' />
    }

    if (sheet) {
        return (
            <Scroll className='h-full [mask-image:linear-gradient(transparent,#000_10%,#000_86%,transparent)]' inner='py-[14vh] pr-6'>
                <p className='mb-6 text-[0.8125rem] text-muted'>Not synced to the track</p>
                <p className={cn('font-serif leading-[1.3] font-medium whitespace-pre-line text-fg-2 select-text', SIZES[size === 'large' ? 'medium' : 'small'])}>{sheet}</p>
            </Scroll>
        )
    }

    return (
        <div className='grid h-full place-items-center'>
            <div className='text-center'>
                <MicVocal size={24} className='mx-auto text-muted' />
                <p className='mt-4 font-serif text-[1.75rem] text-fg'>{waiting ? 'Looking for the words' : 'No lyrics for this one'}</p>
                <p className='mt-1 text-[0.875rem] text-muted'>{waiting ? 'Asking lrclib' : 'lrclib had nothing for it'}</p>
            </div>
        </div>
    )
}

// the volume, out of the way: a button in the corner, and the slider in a
// small pane under it when it is wanted
function Volume() {
    const volume = useStore(player, (s) => s.volume)
    const [open, set_open] = useState(false)
    const close = useCallback(() => set_open(false), [])
    const Icon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

    useDismiss(open, close)

    return (
        <div className='relative' onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
            <IconButton {...tip('Volume')} aria-expanded={open} variant={open ? 'soft' : 'plain'} onClick={() => set_open(!open)} className={open ? 'text-fg' : 'text-fg-2'}>
                <Icon size={18} />
            </IconButton>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.94, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: -4, transition: { duration: 0.14 } }}
                        transition={spring.smooth}
                        className='float absolute top-full right-0 z-10 mt-2 flex w-64 origin-top-right items-center gap-3 rounded-(--r-menu) py-2 pr-4 pl-2'
                    >
                        <IconButton size='sm' {...tip(volume === 0 ? 'Unmute' : 'Mute')} onClick={toggle_mute}>
                            <Icon size={16} />
                        </IconButton>
                        <Range value={volume} min={0} max={1} step={0.01} aria-label='Volume' on_change={change_volume} className='range-accent flex-1' />
                        <span className='w-8 text-right font-mono text-[0.6875rem] text-muted tabular-nums'>{Math.round(volume * 100)}</span>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}

/*
 * The record: the sleeve as large as the column allows, its name and maker
 * under it, and everything that plays it. A new track's sleeve fades over the
 * old one rather than cutting to it.
 */
function Record({ alone, phone = false }: { alone: boolean; phone?: boolean }) {
    const current = useStore(player, (s) => s.current)
    const cover = useStore(library, (s) => (current ? s.covers[current] : undefined))
    const liked = useStore(library, (s) => (current ? s.liked.has(current) : false))
    useStore(library, (s) => (current ? s.meta[current] : undefined))

    if (!current) return null

    return (
        <motion.div layout='position' transition={spring.sheet} className={cn('flex w-full flex-col', alone ? 'max-w-[26rem] items-center text-center' : 'max-w-[24rem]')}>
            <div className={cn('relative aspect-square w-full', phone && 'mx-auto max-w-[min(100%,44vh)]')}>
                <AnimatePresence initial={false}>
                    <motion.div
                        key={current}
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={spring.smooth}
                        className='absolute inset-0'
                    >
                        <Cover data={cover} size='lg' icon={56} className='size-full rounded-[calc(var(--r-cover)*2)] shadow-[0_40px_80px_-30px_rgb(0_0_0/0.8),0_4px_12px_rgb(0_0_0/0.3)]' />
                    </motion.div>
                </AnimatePresence>
            </div>

            <div className={cn('mt-7 flex w-full items-start gap-3', alone && 'justify-center')}>
                {/* the heart's width on the other side, so a centred title is centred */}
                {alone && <span aria-hidden className='size-10 shrink-0' />}
                <div className='min-w-0 flex-1'>
                    <p className='truncate font-serif text-[1.75rem] leading-tight font-medium'>{title_of(current)}</p>
                    <p className='mt-1 truncate text-[0.9375rem] text-fg-2'>
                        {artist_of(current)} · {album_of(current)}
                    </p>
                </div>
                <Heart liked={liked} on_toggle={() => void toggle_like(current)} size={22} className='mt-1 size-10 rounded-full hover:bg-surface-2' />
            </div>

            <div className='mt-5 w-full'>
                <Progress />
            </div>
            <div className={cn('flex w-full justify-center', phone ? 'mt-6 mb-2 scale-[1.3]' : 'mt-3')}>
                <Controls />
            </div>
        </motion.div>
    )
}

// a press on the sheet's head starts a pull; one on a button there does not
const hold = (e: PointerEvent) => e.stopPropagation()

const face = (next: SheetFace) => ui.set({ sheet_face: next })

/*
 * A phone's player: the same room, given one face at a time. The player is
 * the record and everything that plays it, with the words and the queue a
 * press away right under the transport - the floor is the wave's. The words
 * fold the record into a row at the head, beside the play and the next, so
 * the screen is theirs. The queue is the desktop's queue column.
 */
// where a timed sheet is now: the line in force, read off the clock and
// rendered only when it changes
function useLineAt(lines: { at: number; text: string }[] | null) {
    const [at, set_at] = useState(-1)
    const last = useRef(-1)

    useClock((seconds) => {
        if (!lines) return
        let i = -1
        while (i + 1 < lines.length && lines[i + 1].at <= seconds) i++
        if (i !== last.current) {
            last.current = i
            set_at(i)
        }
    })

    return at
}

/*
 * The words, a few lines of them, on a card in the cover's colour under the
 * transport - the way the words are met on a phone: while the record plays,
 * a glance down. The corner button opens them whole.
 */
function LyricsPreview() {
    const { sheet, timed, waiting } = useSheet()
    const at = useLineAt(timed)

    const lines = timed
        ? // the line in force, then the next ones that have words: a gap in the
          // song is the line it is, not a row of notes down the card
          [timed[Math.max(at, 0)], ...timed.slice(Math.max(at, 0) + 1).filter((line) => line.text.trim())]
              .slice(0, 4)
              .map((line, i) => ({ text: line?.text.trim() || '♪', live: i === 0 && at >= 0 }))
        : (sheet ?? '')
              .split('\n')
              .filter((line) => line.trim())
              .slice(0, 5)
              .map((text) => ({ text, live: false }))

    return (
        <section className='lyrics-card relative overflow-hidden rounded-[calc(var(--r-cover)*2)] p-5'>
            <div className='mb-3 flex items-center justify-between'>
                <p className='text-[0.9375rem] font-medium text-fg'>Lyrics</p>
                <IconButton size='sm' variant='soft' {...tip('All the words')} onClick={() => face('lyrics')} className='rounded-full text-fg'>
                    <Expand size={16} />
                </IconButton>
            </div>
            {lines.length ? (
                <button type='button' onClick={() => face('lyrics')} className='block w-full text-left'>
                    {lines.map((line, i) => (
                        <p key={`${at}:${i}`} className={cn('font-serif text-[1.375rem] leading-snug font-medium transition-colors', line.live ? 'text-fg' : 'text-fg/45')}>
                            {line.text}
                        </p>
                    ))}
                </button>
            ) : (
                <p className='text-[0.9375rem] text-fg-2'>{waiting ? 'Looking for the words' : 'No lyrics for this one'}</p>
            )}
        </section>
    )
}

// the drift, where it can be seen: what is in it, and how to put more in
function DriftCard() {
    const drift = useStore(player, (s) => s.drift)
    const crossing = useStore(player, (s) => s.crossing)

    return (
        <section className='rounded-[calc(var(--r-cover)*2)] bg-[color-mix(in_oklab,var(--fg)_7%,transparent)] p-5'>
            <div className='flex items-center gap-2'>
                <Waveform size={16} className='text-accent' />
                <p className='flex-1 text-[0.9375rem] font-medium text-fg'>Drift</p>
                {drift.length > 0 && (
                    <Button variant='ghost' size='sm' onClick={clear_drift} className='-mr-2'>
                        Clear
                    </Button>
                )}
            </div>
            {crossing || drift.length ? (
                <div className='mt-2'>
                    {crossing && <p className='truncate py-1.5 text-[0.875rem] text-accent'>Now · {title_of(crossing)}</p>}
                    {drift.map((name, i) => (
                        <div key={name} className='flex items-center gap-2 py-1'>
                            <p className='min-w-0 flex-1 truncate text-[0.875rem] text-fg'>{title_of(name)}</p>
                            <IconButton size='sm' {...tip('Take it out')} onClick={() => remove_from_drift(i)} className='text-fg-2'>
                                <X size={14} />
                            </IconButton>
                        </div>
                    ))}
                </div>
            ) : (
                <p className='mt-1.5 text-[0.8125rem] leading-relaxed text-fg-2'>Tracks that play once, right after this one, and then leave. Swipe a track to the right, or pick Drift from its menu.</p>
            )}
        </section>
    )
}

// the next few, and the way to the whole queue
function NextCard() {
    const queue = useQueue()
    const current = useStore(player, (s) => s.current)
    const at = current ? queue.indexOf(current) : -1
    const next = (at < 0 ? queue : queue.slice(at + 1)).slice(0, 3)
    const covers = useStore(library, (s) => s.covers)

    if (!next.length) return null

    return (
        <section className='rounded-[calc(var(--r-cover)*2)] bg-[color-mix(in_oklab,var(--fg)_7%,transparent)] p-5'>
            <div className='mb-2 flex items-center justify-between'>
                <p className='text-[0.9375rem] font-medium text-fg'>Up next</p>
                <Button variant='ghost' size='sm' onClick={() => face('queue')} className='-mr-2'>
                    Open queue
                </Button>
            </div>
            {next.map((name) => (
                <div key={name} className='flex items-center gap-3 py-1.5'>
                    <Cover data={covers[name]} size='sm' className='size-10 shrink-0' icon={14} />
                    <div className='min-w-0'>
                        <p className='truncate text-[0.875rem] text-fg'>{title_of(name)}</p>
                        <p className='truncate text-[0.75rem] text-fg-2'>{artist_of(name)}</p>
                    </div>
                </div>
            ))}
        </section>
    )
}

/*
 * A phone's player: the record and everything that plays it fill the first
 * screen, and under them - a scroll down, as on any phone's player - the
 * words as they go by, the drift and what comes next, each opening whole.
 */
function PlayerFace() {
    return (
        <>
            {/* three columns, the outer two of one width, so the words sit on
                the screen's middle however many buttons the right holds */}
            <div className='grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-3'>
                <IconButton size='lg' {...tip('Close')} onPointerDown={hold} onClick={close} className='text-fg-2'>
                    <ChevronDown size={20} weight='bold' />
                </IconButton>
                <p className='text-[0.8125rem] text-fg-2'>Now playing</p>
                <div className='flex justify-end gap-1'>
                    <IconButton size='lg' {...tip('Queue')} onPointerDown={hold} onClick={() => face('queue')} className='text-fg-2'>
                        <ListMusic size={20} />
                    </IconButton>
                    <IconButton size='lg' {...tip('Track info')} onPointerDown={hold} onClick={() => ui.set({ info_open: true, info_face: 'about' })} className='text-fg-2'>
                        <Info size={20} />
                    </IconButton>
                </div>
            </div>
            <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-[calc(var(--safe-bottom)+2rem)]'>
                <div className='flex min-h-[calc(100dvh-var(--safe-top)-6rem)] flex-col justify-center pb-6' onPointerDown={hold}>
                    <Record alone={false} phone />
                </div>
                <div className='space-y-3' onPointerDown={hold}>
                    <LyricsPreview />
                    <DriftCard />
                    <NextCard />
                </div>
            </div>
        </>
    )
}

function WordsFace() {
    const current = useStore(player, (s) => s.current)
    const paused = useStore(player, (s) => s.paused)
    const cover = useStore(library, (s) => (current ? s.covers[current] : undefined))
    useStore(library, (s) => (current ? s.meta[current] : undefined))
    const queue = useQueue()

    if (!current) return null

    return (
        <>
            <div className='flex h-16 shrink-0 items-center gap-2.5 pr-3 pl-2' onPointerDown={hold}>
                <IconButton size='lg' {...tip('Back to the player')} onClick={() => face('player')} className='text-fg-2'>
                    <ChevronDown size={20} weight='bold' />
                </IconButton>
                <button type='button' onClick={() => face('player')} className='flex min-w-0 flex-1 items-center gap-3 text-left'>
                    <Cover data={cover} size='sm' className='size-12 shrink-0 shadow-[0_10px_22px_-10px_rgb(0_0_0/0.8)]' icon={16} />
                    <span className='min-w-0'>
                        <span className='block truncate font-serif text-[1.125rem] leading-tight font-medium'>{title_of(current)}</span>
                        <span className='block truncate text-[0.8125rem] text-fg-2'>{artist_of(current)}</span>
                    </span>
                </button>
                <IconButton size='lg' {...tip('Next')} disabled={!queue.length} onClick={() => skip(1)} className='text-fg'>
                    <SkipForward size={20} />
                </IconButton>
                <IconButton size='lg' variant='soft' {...tip(paused ? 'Play' : 'Pause')} onClick={() => void toggle_pause()} className='rounded-full text-fg'>
                    {paused ? <Play size={20} /> : <Pause size={20} />}
                </IconButton>
            </div>
            <div className='px-5 pt-2' onPointerDown={hold}>
                <Progress />
            </div>
            {/* the words end before the wave does: it has the floor */}
            <div className='min-h-0 flex-1 px-6 pb-[14vh]' onPointerDown={hold}>
                <Words />
            </div>
        </>
    )
}

function QueueFace() {
    return (
        <>
            <div className='flex h-16 shrink-0 items-center justify-between pr-3 pl-4'>
                <div onPointerDown={hold}>
                    <Segmented
                        value='queue'
                        on_change={(next) => face(next)}
                        options={[
                            { id: 'lyrics', label: 'Lyrics' },
                            { id: 'queue', label: 'Queue' },
                        ]}
                    />
                </div>
                <IconButton size='lg' {...tip('Back to the player')} onPointerDown={hold} onClick={() => face('player')} className='text-fg-2'>
                    <X size={20} />
                </IconButton>
            </div>
            <div className='flex min-h-0 flex-1 flex-col px-3 pb-[var(--safe-bottom)]' onPointerDown={hold}>
                <Queue />
            </div>
        </>
    )
}

function PhoneSheet() {
    const sheet_face = useStore(ui, (s) => s.sheet_face)

    return (
        <AnimatePresence mode='wait' initial={false}>
            <motion.div
                key={sheet_face}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.14 } }}
                transition={spring.smooth}
                className='flex min-h-0 flex-1 flex-col'
            >
                {sheet_face === 'lyrics' ? <WordsFace /> : sheet_face === 'queue' ? <QueueFace /> : <PlayerFace />}
            </motion.div>
        </AnimatePresence>
    )
}

function Toggle({ on, label, icon, on_toggle }: { on: boolean; label: string; icon: React.ReactNode; on_toggle: () => void }) {
    return (
        <IconButton {...tip(on ? `Hide ${label}` : `Show ${label}`)} aria-pressed={on} variant={on ? 'soft' : 'plain'} onPointerDown={(e) => e.stopPropagation()} onClick={on_toggle} className={on ? 'text-fg' : ''}>
            {icon}
        </IconButton>
    )
}

/*
 * The whole window given to what is playing.
 *
 * Its room is the cover's own light, turned up (fx/Ambient), with the wave of
 * the sound rising along the floor of the window. The record stands on the
 * left and the words flow on the right; with the words put away the record
 * moves to the middle on a spring, and the two toggles in the corner put
 * either the words or the wave away on their own (settings keeps them).
 *
 * It comes up the way a sheet does on a phone: the room fades in, the
 * contents rise into it on a spring, and it can be pulled back down by its
 * top edge - past a fifth of the window or flicked, it goes.
 */
export function LyricsPage() {
    const current = useStore(player, (s) => s.current)
    const words = useStore(ui, (s) => s.lp_lyrics)
    const wave = useStore(ui, (s) => s.lp_wave)
    const light_on = useStore(ui, (s) => s.aura_on)
    const sheet_face = useStore(ui, (s) => s.sheet_face)
    const phone = usePhone()
    const pull = useDragControls()
    const sheet = useRef<HTMLDivElement>(null)
    const pull_y = useMotionValue(0)
    usePull(sheet, pull_y, close, { enabled: phone })
    // the queue is read, not looked at: the wave stays under the player and the words
    const waved = wave && (!phone || sheet_face !== 'queue')

    useEffect(() => {
        const on_key = (e: KeyboardEvent) => e.key === 'Escape' && close()

        window.addEventListener('keydown', on_key)
        return () => window.removeEventListener('keydown', on_key)
    }, [])

    // a phone's gpu has the slide to draw and nothing else: the light and the
    // wave start once the sheet is up
    useEffect(() => {
        if (!phone) return
        hold_painters(true)
        const timer = setTimeout(() => hold_painters(false), 480)
        return () => {
            clearTimeout(timer)
            hold_painters(false)
        }
    }, [phone])

    return (
        <motion.div
            className='on-art fixed inset-0 z-55 overflow-hidden bg-bg'
            // on a phone the whole sheet slides up and away as one layer, which
            // a phone composites for nothing; a whole screen fading while its
            // contents move ran at thirty frames a second there
            initial={phone ? { y: '100%' } : { opacity: 0 }}
            animate={phone ? { y: 0 } : { opacity: 1 }}
            exit={phone ? { y: '100%', transition: { duration: 0.26, ease: [0.4, 0, 1, 1] } } : { opacity: 0, transition: { duration: 0.28 } }}
            transition={phone ? spring.sheet : { duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            onContextMenu={(e) => e.preventDefault()}
        >
            {/* the cover's light, stronger than behind the panels: here it is the
                whole room. on even with the setting off, softer then */}
            <Ambient page={false} boost={light_on ? 1.7 : 1.1} className='absolute inset-0 [--light:0.55]' />
            <div className='absolute inset-0 bg-[radial-gradient(110%_90%_at_30%_45%,rgb(10_9_8/0.35),rgb(10_9_8/0.78))]' />

            <AnimatePresence>
                {waved && current && (
                    <motion.div key='wave' initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className={cn('absolute inset-x-0 bottom-0', phone ? 'h-[17vh]' : 'h-[26vh]')}>
                        <Wave overlay gain={0.9} className='size-full [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)] opacity-70' />
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.div
                className='relative flex h-full flex-col'
                initial={phone ? false : { y: 48, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={phone ? undefined : { y: 64, opacity: 0, transition: { duration: 0.25, ease: [0.4, 0, 1, 1] } }}
                transition={spring.sheet}
                drag='y'
                dragControls={pull}
                dragListener={false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0, bottom: 0.7 }}
                onDragEnd={(_, info) => {
                    if (info.offset.y > window.innerHeight * 0.2 || info.velocity.y > 700) close()
                }}
            >
                {phone ? (
                    // pulled down from anywhere on it, not only the grabber (hooks/pull)
                    <motion.div ref={sheet} style={{ y: pull_y }} className='relative flex min-h-0 flex-1 flex-col pt-[calc(var(--safe-top)+0.75rem)]'>
                        <span aria-hidden className='absolute top-[calc(var(--safe-top)+0.5rem)] left-1/2 z-10 h-1 w-10 -translate-x-1/2 rounded-full bg-line-strong' />
                        {current ? <PhoneSheet /> : <div className='grid flex-1 place-items-center text-fg-2'>Nothing is playing</div>}
                    </motion.div>
                ) : (
                    <>
                        <header className='relative flex h-16 shrink-0 cursor-grab touch-none items-center justify-between px-5 active:cursor-grabbing' onPointerDown={(e) => pull.start(e)}>
                            {/* the handle: where the sheet is pulled down from */}
                            <span className='absolute top-2.5 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-line-strong' />
                            <IconButton {...tip('Close')} onPointerDown={(e) => e.stopPropagation()} onClick={close} className='text-fg-2'>
                                <CaretDoubleDown size={18} />
                            </IconButton>
                            <div className='flex items-center gap-1'>
                                <Volume />
                                <Toggle on={words} label='lyrics' icon={<MicVocal size={18} />} on_toggle={() => set_pref('lp_lyrics', !words)} />
                                <Toggle on={wave} label='the wave' icon={<Waveform size={18} />} on_toggle={() => set_pref('lp_wave', !wave)} />
                                <IconButton {...tip('Track info')} onPointerDown={(e) => e.stopPropagation()} onClick={() => ui.set({ info_open: true, info_face: 'about' })} className='text-fg-2'>
                                    <Info size={18} />
                                </IconButton>
                            </div>
                        </header>

                        {current ? (
                            <LayoutGroup>
                                <div className={cn('mx-auto flex min-h-0 w-full max-w-[90rem] flex-1 items-center gap-[6vw] px-[6vw] pb-[8vh]', !words && 'justify-center')}>
                                    <Record alone={!words} />
                                    <AnimatePresence>
                                        {words && (
                                            <motion.div
                                                key='words'
                                                initial={{ opacity: 0, x: 24 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                exit={{ opacity: 0, x: 24 }}
                                                transition={spring.smooth}
                                                className='h-full min-w-0 flex-1'
                                            >
                                                <Words />
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </LayoutGroup>
                        ) : (
                            <div className='grid flex-1 place-items-center text-fg-2'>Nothing is playing</div>
                        )}
                    </>
                )}
            </motion.div>
        </motion.div>
    )
}

import { useCallback, useEffect, useState } from 'react'
import { useDismiss } from '../../hooks/dismiss'
import { AnimatePresence, LayoutGroup, motion, useDragControls } from 'motion/react'
import { spring } from '../../lib/motion'
import { useSheet } from '../../hooks/sheet'
import { cn } from '../../lib/cn'
import type { LyricsSize } from '../../lib/prefs'
import { useStore } from '../../lib/store'
import { tip } from '../../lib/tip'
import { album_of, artist_of, library, title_of, toggle_like } from '../../state/library'
import { change_volume, player, toggle_mute } from '../../state/player'
import { set_pref, ui } from '../../state/ui'
import { Ambient } from '../fx/Ambient'
import { Wave } from '../fx/Wave'
import { Controls, Progress } from '../layout/PlayerBar'
import { LyricFlow } from '../media/LyricFlow'
import { IconButton } from '../ui/Button'
import { Heart, Range } from '../ui/Controls'
import { Cover } from '../ui/Cover'
import { CaretDoubleDown, Info, MicVocal, Volume1, Volume2, VolumeX, Waveform } from '../ui/icons'
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
function Record({ alone }: { alone: boolean }) {
    const current = useStore(player, (s) => s.current)
    const cover = useStore(library, (s) => (current ? s.covers[current] : undefined))
    const liked = useStore(library, (s) => (current ? s.liked.has(current) : false))
    useStore(library, (s) => (current ? s.meta[current] : undefined))

    if (!current) return null

    return (
        <motion.div layout='position' transition={spring.sheet} className={cn('flex w-full flex-col', alone ? 'max-w-[26rem] items-center text-center' : 'max-w-[24rem]')}>
            <div className='relative aspect-square w-full'>
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
            <div className='mt-3 flex w-full justify-center'>
                <Controls />
            </div>
        </motion.div>
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
    const pull = useDragControls()

    useEffect(() => {
        const on_key = (e: KeyboardEvent) => e.key === 'Escape' && close()

        window.addEventListener('keydown', on_key)
        return () => window.removeEventListener('keydown', on_key)
    }, [])

    return (
        <motion.div
            className='on-art fixed inset-0 z-55 overflow-hidden bg-bg'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.28 } }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            onContextMenu={(e) => e.preventDefault()}
        >
            {/* the cover's light, stronger than behind the panels: here it is the
                whole room. on even with the setting off, softer then */}
            <Ambient page={false} boost={light_on ? 1.7 : 1.1} className='absolute inset-0 [--light:0.55]' />
            <div className='absolute inset-0 bg-[radial-gradient(110%_90%_at_30%_45%,rgb(10_9_8/0.35),rgb(10_9_8/0.78))]' />

            <AnimatePresence>
                {wave && current && (
                    <motion.div key='wave' initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5 }} className='absolute inset-x-0 bottom-0 h-[26vh]'>
                        <Wave overlay gain={0.9} className='size-full [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)] opacity-70' />
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.div
                className='relative flex h-full flex-col'
                initial={{ y: 48, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 64, opacity: 0, transition: { duration: 0.25, ease: [0.4, 0, 1, 1] } }}
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
            </motion.div>
        </motion.div>
    )
}

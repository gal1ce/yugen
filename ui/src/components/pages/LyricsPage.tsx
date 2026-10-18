import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { useSheet } from '../../hooks/sheet'
import { spectrum } from '../../lib/audio'
import { useClock } from '../../lib/clock'
import { add_painter, fx } from '../../lib/fx'
import { useStore } from '../../lib/store'
import { tip } from '../../lib/tip'
import { album_of, artist_of, library, title_of, toggle_like } from '../../state/library'
import { player, seek_to } from '../../state/player'
import { ui } from '../../state/ui'
import { grain_url } from '../../lib/grain'
import { Aurora } from '../fx/Aurora'
import { Wave } from '../fx/Wave'
import { Controls, Progress } from '../layout/PlayerBar'
import { IconButton } from '../ui/Button'
import { Heart } from '../ui/Controls'
import { Cover } from '../ui/Cover'
import { CaretDoubleDown, Info, MicVocal, Quotes } from '../ui/icons'
import { glide_to } from '../../hooks/glide'

const close = () => ui.set({ lyrics_open: false })

// the sleeve, nudged by the low end: a beat is a small push outwards that
// settles back. written straight onto the element, never a render
function Sleeve({ data }: { data?: string }) {
    const box = useRef<HTMLDivElement>(null)
    const motion_pref = useStore(fx, (s) => s.motion)

    useEffect(() => {
        if (motion_pref !== 'full') return

        let push = 0

        return add_painter(0, (_, dt) => {
            if (spectrum.beat) push = 1
            push *= Math.exp(-dt * 6)

            const scale = 1 + push * 0.018 + (spectrum.live ? spectrum.level * 0.02 : 0)
            if (box.current) box.current.style.transform = `scale(${scale})`
        })
    }, [motion_pref])

    return (
        <div ref={box} className='will-change-transform'>
            <Cover data={data} icon={64} className='aspect-square w-full rounded-[1.75rem] shadow-[0_40px_90px_-30px_rgb(0_0_0/0.85)]' />
        </div>
    )
}

/*
 * The sheet, large. A timed one follows along: the line being sung is whole,
 * the next ones are there to be read ahead, the ones gone fade back - and the
 * box glides so the line in force sits a third of the way down, where the eye
 * already is. A click on any line goes there.
 */
function Sheet() {
    const { sheet, timed, waiting } = useSheet()
    const [line, set_line] = useState(-1)
    const box = useRef<HTMLDivElement>(null)

    useClock((seconds) => {
        let index = -1
        if (timed) while (index + 1 < timed.length && timed[index + 1].at <= seconds + 0.25) index++

        if (index !== line) set_line(index)
    })

    useEffect(() => {
        const node = box.current
        const row = node?.children[Math.max(line, 0)] as HTMLElement | undefined
        if (!node || !row) return

        // through the glide, so a wheel turned while it follows is the same movement
        glide_to(node, row.offsetTop - node.clientHeight * 0.34)
    }, [line, timed])

    if (timed) {
        return (
            <div
                ref={box}
                className='h-full overflow-y-auto pt-[30vh] pb-[55vh] [mask-image:linear-gradient(transparent,#000_14%,#000_70%,transparent)]'
            >
                {timed.map((row, i) => {
                    const at = i === line ? 'now' : i < line ? 'gone' : i <= line + 2 ? 'next' : 'later'

                    return (
                        <button
                            key={`${row.at}-${i}`}
                            type='button'
                            data-at={at}
                            onClick={() => void seek_to(row.at)}
                            className='lyric-line block w-full py-2.5 text-left font-display text-[clamp(1.6rem,2.6vw,2.6rem)] leading-[1.15] font-bold tracking-tight text-white'
                        >
                            {row.text ? (
                                row.text
                            ) : (
                                <span className='lyric-dots inline-flex py-3' aria-label='Instrumental'>
                                    <span />
                                    <span />
                                    <span />
                                </span>
                            )}
                        </button>
                    )
                })}
            </div>
        )
    }

    if (sheet) {
        return (
            <div className='h-full overflow-y-auto py-[12vh] [mask-image:linear-gradient(transparent,#000_10%,#000_85%,transparent)]'>
                <p className='mb-6 flex items-center gap-2 text-xs font-medium tracking-wider text-white/50 uppercase'>
                    <Quotes size={14} /> Not synced
                </p>
                <p className='font-display text-[clamp(1.2rem,1.7vw,1.7rem)] leading-relaxed font-semibold whitespace-pre-line text-white/85 select-text'>{sheet}</p>
            </div>
        )
    }

    return (
        <div className='grid h-full place-items-center'>
            <div className='text-center'>
                <MicVocal size={40} weight='duotone' className='mx-auto text-white/40' />
                <p className='mt-4 font-display text-2xl font-semibold text-white/80'>{waiting ? 'Looking for the words…' : 'No lyrics for this one'}</p>
                <p className='mt-1 text-sm text-white/45'>{waiting ? 'Asking lrclib.' : 'Let the music talk.'}</p>
            </div>
        </div>
    )
}

export function LyricsPage() {
    const current = useStore(player, (s) => s.current)
    const cover = useStore(library, (s) => (current ? s.covers[current] : undefined))
    const liked = useStore(library, (s) => (current ? s.liked.has(current) : false))
    useStore(library, (s) => (current ? s.meta[current] : undefined))

    useEffect(() => {
        const on_key = (e: KeyboardEvent) => e.key === 'Escape' && close()

        window.addEventListener('keydown', on_key)
        return () => window.removeEventListener('keydown', on_key)
    }, [])

    // a panel of its own, standing off the window's edges by the same gutter as
    // the rest of the app: full bleed, its corners were the vignette's ellipse
    // against a square window, which read as a radius that did not fit
    return (
        <motion.div
            className='fixed inset-0 z-55 bg-bg p-3'
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.3, delay: 0.12 } }}
            transition={{ duration: 0.22 }}
            onContextMenu={(e) => e.preventDefault()}
        >
            <motion.div
                className='on-art edge relative h-full overflow-hidden rounded-2xl bg-[#09090b]'
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '105%' }}
                transition={{ type: 'spring', stiffness: 260, damping: 32, mass: 0.9 }}
            >
                <Aurora overlay className='scale-110 opacity-90' />
                {/* the light is for colour, not for reading on: a scrim keeps the
                words above it legible whatever the cover is */}
                <div className='absolute inset-0 bg-[radial-gradient(ellipse_at_70%_40%,rgb(0_0_0/0.25),rgb(0_0_0/0.62))]' />
                <div className='absolute inset-0 opacity-60' style={{ backgroundImage: `url(${grain_url()})` }} />

                <Wave overlay className='absolute inset-x-0 bottom-0 h-[18vh] w-full opacity-60' gain={0.75} />

                <div className='relative flex h-full flex-col'>
                    <header className='flex h-16 shrink-0 items-center justify-between px-6'>
                        <IconButton {...tip('Close')} onClick={close} className='text-white/80 hover:bg-white/10 hover:text-white'>
                            <CaretDoubleDown size={18} />
                        </IconButton>
                        <span className='text-[0.68rem] font-medium tracking-[0.2em] text-white/50 uppercase'>Now playing</span>
                        <IconButton {...tip('Track info')} onClick={() => ui.set({ info_open: true, info_face: 'about' })} className='text-white/80 hover:bg-white/10 hover:text-white'>
                            <Info size={18} />
                        </IconButton>
                    </header>

                    {current ? (
                        <div className='mx-auto grid min-h-0 w-full max-w-[1500px] flex-1 grid-cols-[minmax(0,26rem)_minmax(0,1fr)] gap-[6vw] px-[6vw] pb-[16vh]'>
                            <div className='flex min-w-0 flex-col justify-center gap-7'>
                                <motion.div
                                    initial={{ opacity: 0, y: 30, scale: 0.94 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    transition={{ delay: 0.12, type: 'spring', stiffness: 200, damping: 24 }}
                                >
                                    <Sleeve data={cover} />
                                </motion.div>

                                <div className='flex items-start gap-3'>
                                    <div className='min-w-0 flex-1'>
                                        <h1 className='truncate font-display text-[2rem] leading-tight font-bold tracking-tight'>{title_of(current)}</h1>
                                        <p className='mt-1 truncate text-base text-white/60'>
                                            {artist_of(current)} · {album_of(current)}
                                        </p>
                                    </div>
                                    <Heart liked={liked} on_toggle={() => void toggle_like(current)} size={22} className='mt-1.5 size-10 rounded-full hover:bg-white/10' />
                                </div>

                                <div className='space-y-3'>
                                    <Progress />
                                    <div className='flex justify-center'>
                                        <Controls />
                                    </div>
                                </div>
                            </div>

                            <div className='min-h-0 min-w-0'>
                                <Sheet />
                            </div>
                        </div>
                    ) : (
                        <div className='grid flex-1 place-items-center text-white/60'>Nothing is playing.</div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    )
}

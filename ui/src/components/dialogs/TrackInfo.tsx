import { useCallback, useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { spring } from '../../lib/motion'
import { FileText, Heart, ListPlus, MicVocal, Pause, Play, Star, X } from '../ui/icons'
import { useDismiss } from '../../hooks/dismiss'
import { counted, format_date, format_time } from '../../lib/format'
import { useStore } from '../../lib/store'
import { added_of, album_of, artist_of, is_favorite, length_of, library, title_of, toggle_favorite, toggle_like } from '../../state/library'
import { player, toggle_pause } from '../../state/player'
import { ui } from '../../state/ui'
import { Button, IconButton } from '../ui/Button'
import { Cover } from '../ui/Cover'
import { MenuPanel } from '../ui/Menu'
import { Scroll } from '../ui/Scroll'
import { tip } from '../../lib/tip'
import { Lyrics } from '../layout/NowPanel'
import { PlaylistTargets } from '../layout/ContextMenu'

/*
 * The card the player bar opens into: the record on the left, everything known
 * about it on the right. Only what is actually known goes on it - the file's
 * tags are always there, last.fm fills in the rest when it has an entry, and a
 * row it cannot answer for is left off rather than printed blank.
 */
export function TrackInfo() {
    const song = useStore(player, (s) => s.current)
    const paused = useStore(player, (s) => s.paused)
    const info_for = useStore(player, (s) => s.info_for)
    const face = useStore(ui, (s) => s.info_face)
    const cover = useStore(library, (s) => (song ? s.covers[song] : undefined))
    const liked = useStore(library, (s) => (song ? s.liked.has(song) : false))
    const starred = useStore(library, () => (song ? is_favorite(song) : false))
    const [adding, set_adding] = useState(false)
    const stop_adding = useCallback(() => set_adding(false), [])
    const close = useCallback(() => ui.set({ info_open: false }), [])

    useDismiss(adding, stop_adding)

    // the scrim takes the click that closes it, so escape is all that is left -
    // and the list of playlists, when it is up, is what escape is aimed at
    useEffect(() => {
        const on_key = (e: KeyboardEvent) => e.key === 'Escape' && !adding && close()

        window.addEventListener('keydown', on_key)
        return () => window.removeEventListener('keydown', on_key)
    }, [adding, close])

    if (!song) return null

    // an answer is this track's while it names this track, and undefined until
    // one has arrived at all
    const info = info_for?.song === song ? info_for.info : undefined
    const album = album_of(song)
    // the tag off the file wins: it is what the library is sorted by
    const on_sleeve = album === 'Unknown album' && info?.album ? info.album : album

    return (
        <div
            className='fixed inset-0 z-60 grid animate-fade-in place-items-center bg-[var(--scrim)] p-8'
            onClick={close}
            onContextMenu={(e) => e.preventDefault()}
        >
            <motion.div
                role='dialog'
                initial={{ opacity: 0, scale: 0.95, y: 14 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={spring.smooth}
                onClick={(e) => {
                    e.stopPropagation()
                    set_adding(false)
                }}
                className='[zoom:var(--z-menus,1)] float relative flex max-h-[85vh] w-full max-w-4xl gap-8 overflow-hidden rounded-(--r-menu) p-8'>
                <IconButton size='sm' {...tip('Close')} onClick={close} className='absolute top-4 right-4 z-10'>
                    <X size={16} />
                </IconButton>

                <div className='relative flex w-72 shrink-0 flex-col gap-4'>
                    {/* the whole sleeve is the like: a heart in the corner of a
                        picture this size is a target nobody aims at */}
                    <button type='button' {...tip(liked ? 'Remove from liked songs' : 'Add to liked songs')} onClick={() => void toggle_like(song)} className='group relative'>
                        <Cover data={cover} icon={56} className='aspect-square w-full rounded-(--r-cover) shadow-[0_24px_40px_-22px_rgb(0_0_0/0.75),0_2px_6px_rgb(0_0_0/0.3)]' />
                        <span className='absolute inset-0 grid place-items-center rounded-(--r-cover) bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100'>
                            <Heart size={48} className={liked ? 'fill-current' : ''} />
                        </span>
                    </button>

                    <div className='grid grid-cols-2 gap-2'>
                        <Button icon={paused ? <Play size={16} /> : <Pause size={16} />} onClick={() => void toggle_pause()}>
                            {paused ? 'Play' : 'Pause'}
                        </Button>
                        <Button variant='secondary' icon={face === 'lyrics' ? <FileText size={16} /> : <MicVocal size={16} />} onClick={() => ui.set({ info_face: face === 'lyrics' ? 'about' : 'lyrics' })}>
                            {face === 'lyrics' ? 'About' : 'Lyrics'}
                        </Button>
                        <Button variant='secondary' icon={<Star size={16} className={starred ? 'fill-current text-accent' : ''} />} onClick={() => void toggle_favorite(song)}>
                            {starred ? 'Favorited' : 'Favorite'}
                        </Button>
                        <div className='relative' onClick={(e) => e.stopPropagation()}>
                            <Button variant='secondary' icon={<ListPlus size={16} />} onClick={() => set_adding(!adding)} className='w-full'>
                                Add to
                            </Button>
                            {adding && (
                                <MenuPanel className='absolute bottom-full left-0 mb-1 w-56'>
                                    <PlaylistTargets song={song} />
                                </MenuPanel>
                            )}
                        </div>
                    </div>
                </div>

                <div className='relative flex min-w-0 flex-1 flex-col'>
                    <h2 className='pr-10 font-serif text-[2.25rem] leading-[1.1] font-medium'>{title_of(song)}</h2>
                    <p className='mt-2 truncate text-[1rem] text-fg-2'>{artist_of(song)}</p>

                    {!!info?.tags.length && (
                        <div className='mt-4 flex flex-wrap gap-1.5'>
                            {info.tags.map((tag) => (
                                <span key={tag} className='rounded-md px-2 py-0.5 text-[0.75rem] text-fg-2 shadow-[inset_0_0_0_1px_var(--line-strong)]'>
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}

                    <p className='mt-3 font-mono text-[0.75rem] text-muted'>{[length_of(song) ? format_time(length_of(song)) : '', info?.year].filter(Boolean).join(' · ')}</p>

                    <div className='mt-6 flex min-h-0 flex-1 flex-col border-t border-line pt-5'>
                        {face === 'lyrics' ? (
                            <Lyrics />
                        ) : (
                            <>
                                <dl className='grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 text-[0.875rem]'>
                                    <dt className='text-muted'>Album</dt>
                                    <dd className='truncate'>{on_sleeve}</dd>
                                    {!!info?.listeners && (
                                        <>
                                            <dt className='text-muted'>Listeners</dt>
                                            <dd className='font-mono text-[0.8125rem] tabular-nums'>{counted.format(info.listeners)}</dd>
                                        </>
                                    )}
                                    {!!info?.playcount && (
                                        <>
                                            <dt className='text-muted'>Scrobbles</dt>
                                            <dd className='font-mono text-[0.8125rem] tabular-nums'>{counted.format(info.playcount)}</dd>
                                        </>
                                    )}
                                    <dt className='text-muted'>Added</dt>
                                    <dd>{format_date(added_of(song))}</dd>
                                </dl>

                                <Scroll className='mt-6 flex-1'>
                                    {info === undefined ? (
                                        <div className='space-y-3' aria-hidden>
                                            <div className='h-3 w-full rounded-sm bg-surface-2' />
                                            <div className='h-3 w-11/12 rounded-sm bg-surface-2' />
                                            <div className='h-3 w-3/5 rounded-sm bg-surface-2' />
                                        </div>
                                    ) : info?.summary ? (
                                        <p className='max-w-prose text-[0.9375rem] leading-relaxed text-fg-2 select-text'>{info.summary}</p>
                                    ) : (
                                        <p className='text-[0.875rem] text-muted'>last.fm has nothing written about this one</p>
                                    )}
                                </Scroll>
                            </>
                        )}
                    </div>
                </div>
            </motion.div>
        </div>
    )
}

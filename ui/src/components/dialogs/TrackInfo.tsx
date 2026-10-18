import { useCallback, useEffect, useState } from 'react'
import { FileText, Heart, ListPlus, MicVocal, Pause, Play, Star, X } from '../ui/icons'
import { useDismiss } from '../../hooks/dismiss'
import { cn } from '../../lib/cn'
import { counted, format_date, format_time } from '../../lib/format'
import { useStore } from '../../lib/store'
import { added_of, album_of, artist_of, is_favorite, length_of, library, title_of, toggle_favorite, toggle_like } from '../../state/library'
import { player, toggle_pause } from '../../state/player'
import { ui } from '../../state/ui'
import { Button, IconButton } from '../ui/Button'
import { Cover } from '../ui/Cover'
import { MenuPanel } from '../ui/Menu'
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
            <div
                role='dialog'
                onClick={(e) => {
                    e.stopPropagation()
                    set_adding(false)
                }}
                className='edge relative flex max-h-[85vh] w-full max-w-4xl animate-pop-in gap-8 overflow-hidden rounded-3xl bg-surface p-7 shadow-soft'>
                <div className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_oklab,var(--accent)_14%,transparent),transparent_55%)]' />

                <IconButton size='sm' {...tip('Close')} onClick={close} className='absolute top-4 right-4 z-10'>
                    <X size={16} />
                </IconButton>

                <div className='relative flex w-72 shrink-0 flex-col gap-4'>
                    {/* the whole sleeve is the like: a heart in the corner of a
                        picture this size is a target nobody aims at */}
                    <button type='button' {...tip(liked ? 'Remove from liked songs' : 'Add to liked songs')} onClick={() => void toggle_like(song)} className='group relative'>
                        <Cover data={cover} icon={56} className='aspect-square w-full rounded-2xl shadow-soft' />
                        <span className={cn('absolute inset-0 grid place-items-center rounded-2xl bg-black/45 text-white transition-opacity', liked ? 'opacity-0 group-hover:opacity-100' : 'opacity-0 group-hover:opacity-100')}>
                            <Heart size={60} className={liked ? 'fill-current' : ''} />
                        </span>
                    </button>

                    <div className='grid grid-cols-2 gap-2'>
                        <Button icon={paused ? <Play size={15} className='fill-current' /> : <Pause size={15} className='fill-current' />} onClick={() => void toggle_pause()}>
                            {paused ? 'Play' : 'Pause'}
                        </Button>
                        <Button variant='secondary' icon={face === 'lyrics' ? <FileText size={15} /> : <MicVocal size={15} />} onClick={() => ui.set({ info_face: face === 'lyrics' ? 'about' : 'lyrics' })}>
                            {face === 'lyrics' ? 'About' : 'Lyrics'}
                        </Button>
                        <Button variant='secondary' icon={<Star size={15} className={starred ? 'fill-current text-accent' : ''} />} onClick={() => void toggle_favorite(song)}>
                            {starred ? 'Favorited' : 'Favorite'}
                        </Button>
                        <div className='relative' onClick={(e) => e.stopPropagation()}>
                            <Button variant='secondary' icon={<ListPlus size={15} />} onClick={() => set_adding(!adding)} className='w-full'>
                                Add to
                            </Button>
                            {adding && (
                                <MenuPanel className='absolute bottom-full left-0 mb-2 w-56'>
                                    <PlaylistTargets song={song} />
                                </MenuPanel>
                            )}
                        </div>
                    </div>
                </div>

                <div className='relative flex min-w-0 flex-1 flex-col'>
                    <h2 className='pr-10 font-display text-[2.2rem] leading-tight font-bold tracking-tight'>{title_of(song)}</h2>
                    <p className='mt-1 truncate text-base text-muted'>{artist_of(song)}</p>

                    {!!info?.tags.length && (
                        <div className='mt-4 flex flex-wrap gap-1.5'>
                            {info.tags.map((tag) => (
                                <span key={tag} className='rounded-full border border-line px-2.5 py-0.5 text-xs text-muted'>
                                    {tag}
                                </span>
                            ))}
                        </div>
                    )}

                    <p className='mt-3 text-xs text-muted'>{[length_of(song) ? format_time(length_of(song)) : '', info?.year, paused ? '' : 'Playing'].filter(Boolean).join(' · ')}</p>

                    <div className='mt-6 flex min-h-0 flex-1 flex-col border-t border-line pt-5'>
                        {face === 'lyrics' ? (
                            <Lyrics big />
                        ) : (
                            <>
                                <dl className='grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[0.82rem]'>
                                    <dt className='text-muted'>Album</dt>
                                    <dd className='truncate'>{on_sleeve}</dd>
                                    {!!info?.listeners && (
                                        <>
                                            <dt className='text-muted'>Listeners</dt>
                                            <dd>{counted.format(info.listeners)}</dd>
                                        </>
                                    )}
                                    {!!info?.playcount && (
                                        <>
                                            <dt className='text-muted'>Scrobbles</dt>
                                            <dd>{counted.format(info.playcount)}</dd>
                                        </>
                                    )}
                                    <dt className='text-muted'>Added</dt>
                                    <dd>{format_date(added_of(song))}</dd>
                                </dl>

                                <div className='mt-6 min-h-0 flex-1 overflow-y-auto'>
                                    {info === undefined ? (
                                        <div className='space-y-2.5' aria-hidden>
                                            <div className='skeleton h-3 w-full rounded' />
                                            <div className='skeleton h-3 w-11/12 rounded' />
                                            <div className='skeleton h-3 w-3/5 rounded' />
                                        </div>
                                    ) : info?.summary ? (
                                        <p className='text-sm leading-relaxed text-fg/80 select-text'>{info.summary}</p>
                                    ) : (
                                        <p className='text-sm text-muted'>Nothing written about this one (´･_･`)</p>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

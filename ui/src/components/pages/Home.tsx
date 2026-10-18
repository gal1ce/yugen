import { useEffect } from 'react'
import { DotsThree, FolderOpen, Info, LoaderCircle, MicVocal, Pause, Play, Shuffle } from '../ui/icons'
import { useDark } from '../../hooks/dark'
import { tip } from '../../lib/tip'
import { Aurora } from '../fx/Aurora'
import { Wave } from '../fx/Wave'
import { spotlight } from '../../hooks/spotlight'
import { cn } from '../../lib/cn'
import { format_date, format_span } from '../../lib/format'
import { useStore } from '../../lib/store'
import { arrivals_of, span_of, useAlbums, useArtists, useFavoriteSongs, useLikedSongs, useQueue } from '../../state/derive'
import { added_of, album_of, artist_of, library, title_of } from '../../state/library'
import { play_listing, play_music, player, shuffle_into, toggle_pause } from '../../state/player'
import { want_similar } from '../../state/suggest'
import { context, open_menu, open_page, open_view, ui } from '../../state/ui'
import { Button, IconButton } from '../ui/Button'
import { Empty } from '../ui/Controls'
import { Cover } from '../ui/Cover'
import { SeeAll, Shelf } from '../media/Rail'
import { DiscoverShelf } from '../media/Suggest'
import { TrackCard } from '../media/Track'

const SHELF = 12

function greeting() {
    const hour = new Date().getHours()
    return hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

function Greeting() {
    const username = useStore(library, (s) => s.username)
    const songs = useStore(library, (s) => s.songs)
    useStore(library, (s) => s.meta)
    const albums = useAlbums()
    const artists = useArtists()
    const liked = useLikedSongs()
    const span = span_of(songs)

    const fact = (label: string, count: number, go: () => void) => (
        <button type='button' onClick={go} className='rounded-full border border-line px-3 py-1 transition-colors hover:border-line-strong hover:text-fg'>
            <b className='font-semibold text-fg'>{count}</b> {label}
        </button>
    )

    return (
        <div className='mb-7'>
            <h1 className='font-display text-[2.4rem] leading-tight font-bold tracking-tight'>
                {greeting()}
                {username && <span className='text-muted'>, {username}</span>}
            </h1>
            {songs.length > 0 && (
                <div className='mt-3 flex flex-wrap items-center gap-2 text-xs text-muted'>
                    {fact('songs', songs.length, () => open_view('songs'))}
                    {fact('albums', albums.size, () => open_view('albums'))}
                    {fact('artists', artists.size, () => open_view('artists'))}
                    {fact('liked', liked.length, () => open_view('liked'))}
                    {span > 0 && <span className='pl-1'>{format_span(span)} of music</span>}
                </div>
            )}
        </div>
    )
}

// what is playing, as big as the page allows - or, with nothing cued, the way
// to start
function Hero() {
    const current = useStore(player, (s) => s.current)
    const paused = useStore(player, (s) => s.paused)
    const cover = useStore(library, (s) => (current ? s.covers[current] : undefined))
    const songs = useStore(library, (s) => s.songs)
    useStore(library, (s) => (current ? s.meta[current] : undefined))
    const queue = useQueue()
    const dark = useDark()

    if (!current) {
        if (!songs.length) return null

        return (
            <section {...spotlight} className='spotlight edge mb-10 flex items-center gap-6 overflow-hidden rounded-3xl bg-surface p-7'>
                <div className='min-w-0 flex-1'>
                    <p className='text-[0.68rem] font-medium tracking-wider text-accent uppercase'>Your library</p>
                    <h2 className='mt-1.5 font-display text-[1.9rem] font-bold tracking-tight'>Pick up anywhere.</h2>
                    <p className='mt-1 text-sm text-muted'>{songs.length} tracks waiting. Start from the top, or let it shuffle.</p>
                    <div className='mt-5 flex gap-2'>
                        <Button icon={<Play size={15} className='fill-current' />} onClick={() => void play_listing(songs)}>
                            Play all
                        </Button>
                        <Button
                            variant='secondary'
                            icon={<Shuffle size={15} />}
                            onClick={async () => {
                                await shuffle_into('all')
                                const order = player.get().shuffled
                                if (order?.length) void play_music(order[0])
                            }}
                        >
                            Shuffle everything
                        </Button>
                    </div>
                </div>
            </section>
        )
    }

    const at = queue.indexOf(current)
    const next = (at < 0 ? queue : queue.slice(at + 1)).slice(0, 3)

    return (
        <section className='edge relative mb-10 overflow-hidden rounded-3xl bg-surface p-6'>
            {/* the cover's own colours, moving, with the sound along the floor */}
            <Aurora base={dark ? '#111113' : 'transparent'} speed={0.7} className={dark ? 'opacity-55' : 'opacity-40'} />
            <div className='pointer-events-none absolute inset-0 bg-linear-to-r from-surface via-surface/70 to-transparent' />
            <Wave className='absolute inset-x-0 bottom-0 h-20 w-full opacity-50' gain={0.8} />

            <div className='relative flex items-center gap-7'>
                <button
                    type='button'
                    {...tip('Lyrics')}
                    onClick={() => ui.set({ lyrics_open: true })}
                    onContextMenu={context({ kind: 'song', song: current })}
                    className='group shrink-0'
                >
                    <Cover data={cover} icon={40} className='size-44 rounded-2xl shadow-soft transition-transform duration-500 ease-spring group-hover:scale-[1.03]' />
                </button>

                <div className='min-w-0 flex-1'>
                    <p className='flex items-center gap-2 text-[0.68rem] font-medium tracking-wider text-accent uppercase'>{paused ? 'Paused' : 'Now playing'}</p>
                    <h2 className='mt-1.5 truncate font-display text-[2.3rem] leading-tight font-bold tracking-tight'>{title_of(current)}</h2>
                    <p className='mt-1 truncate text-sm text-muted'>
                        {artist_of(current)} · {album_of(current)}
                    </p>

                    <div className='mt-5 flex flex-wrap gap-2'>
                        <Button icon={paused ? <Play size={15} className='fill-current' /> : <Pause size={15} className='fill-current' />} onClick={() => void toggle_pause()}>
                            {paused ? 'Resume' : 'Pause'}
                        </Button>
                        <Button variant='secondary' icon={<MicVocal size={15} />} onClick={() => ui.set({ lyrics_open: true })}>
                            Lyrics
                        </Button>
                        <IconButton variant='outline' {...tip('Track info')} onClick={() => ui.set({ info_open: true, info_face: 'about' })}>
                            <Info size={17} />
                        </IconButton>
                        <IconButton
                            variant='outline'
                            {...tip('More')}
                            onClick={(e) => {
                                e.stopPropagation()
                                const rect = e.currentTarget.getBoundingClientRect()
                                open_menu({ kind: 'song', song: current }, rect.left, rect.bottom + 6)
                            }}
                        >
                            <DotsThree size={20} />
                        </IconButton>
                    </div>
                </div>

                {next.length > 0 && (
                    <div className='hidden w-64 shrink-0 xl:block'>
                        <p className='mb-2 text-[0.68rem] font-medium tracking-wide text-muted uppercase'>Up next</p>
                        {next.map((name) => (
                            <UpNext key={name} name={name} />
                        ))}
                    </div>
                )}
            </div>
        </section>
    )
}

function UpNext({ name }: { name: string }) {
    const cover = useStore(library, (s) => s.covers[name])

    return (
        <button
            type='button'
            onClick={() => void play_music(name)}
            onContextMenu={context({ kind: 'song', song: name })}
            className='flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-2'
        >
            <Cover data={cover} size='sm' className='size-9' icon={14} />
            <div className='min-w-0'>
                <p className='truncate text-[0.8rem]'>{title_of(name)}</p>
                <p className='truncate text-xs text-muted'>{artist_of(name)}</p>
            </div>
        </button>
    )
}

function Shelves() {
    const favorites = useFavoriteSongs()
    const liked = useLikedSongs()
    const songs = useStore(library, (s) => s.songs)
    const meta = useStore(library, (s) => s.meta)
    const arrivals = arrivals_of(songs, meta)

    return (
        <>
            {favorites.length > 0 && (
                <Shelf title='Favorites' note='The ones you starred.' action={<SeeAll on_click={() => open_page('profile')} />}>
                    {favorites.slice(0, SHELF).map((name, i) => (
                        <TrackCard key={name} name={name} within={favorites} index={i} />
                    ))}
                </Shelf>
            )}

            {liked.length > 0 && (
                <Shelf title='Liked songs' note={`${liked.length} tracks with a heart on them.`} action={<SeeAll on_click={() => open_view('liked')} />}>
                    {liked.slice(0, SHELF).map((name, i) => (
                        <TrackCard key={name} name={name} within={liked} index={i} />
                    ))}
                </Shelf>
            )}

            {arrivals.length >= 4 && (
                <Shelf title='New arrivals' note={`Last added ${format_date(added_of(arrivals[0])).toLowerCase()}.`} action={<SeeAll on_click={() => open_view('songs')} />}>
                    {arrivals.map((name, i) => (
                        <TrackCard key={name} name={name} within={arrivals} index={i} />
                    ))}
                </Shelf>
            )}
        </>
    )
}

export function HomePage() {
    const songs = useStore(library, (s) => s.songs.length)
    const loading = useStore(library, (s) => s.loading)
    const error = useStore(library, (s) => s.scan_error)
    const folder = useStore(library, (s) => s.folder)

    // the first pass waits for this page: it is a round trip per seed
    useEffect(() => {
        if (songs) want_similar()
    }, [songs])

    return (
        <>
            <Greeting />
            <Hero />

            {songs ? (
                <>
                    <Shelves />
                    <DiscoverShelf />
                </>
            ) : (
                <Empty
                    icon={loading ? <LoaderCircle size={22} className='animate-spin' /> : <FolderOpen size={22} />}
                    title={loading ? 'Scanning your library…' : error ? 'Could not read your library' : 'No music here yet'}
                    className={cn('mt-2')}
                >
                    {loading ? null : error ? error : `Drop some mp3 files into ${folder || '~/Music'}, or search for a song above to download it.`}
                </Empty>
            )}
        </>
    )
}

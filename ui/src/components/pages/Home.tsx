import { useEffect } from 'react'
import { DotsThree, FolderOpen, Info, LoaderCircle, MicVocal, Pause, Play, Shuffle } from '../ui/icons'
import { tip } from '../../lib/tip'
import { Wave } from '../fx/Wave'
import { format_date, format_span } from '../../lib/format'
import { useStore } from '../../lib/store'
import { arrivals_of, span_of, useAlbums, useArtists, useFavoriteSongs, useLikedSongs, useQueue } from '../../state/derive'
import { added_of, album_of, artist_of, library, title_of } from '../../state/library'
import { play_listing, play_music, player, shuffle_into, toggle_pause } from '../../state/player'
import { want_similar } from '../../state/suggest'
import { context, open_lyrics, open_menu, open_page, open_view, ui } from '../../state/ui'
import { Button, IconButton } from '../ui/Button'
import { Empty } from '../ui/Controls'
import { Cover } from '../ui/Cover'
import { SeeAll, Shelf } from '../media/Rail'
import { DiscoverShelf } from '../media/Suggest'
import { Bars, TrackCard } from '../media/Track'
import { Spin } from '../ui/Spin'
import { usePhone } from '../../hooks/phone'
import { group_art, playlist_art, playlist_names_of } from '../../state/derive'
import { open_group, open_playlist } from '../../state/ui'
import { Heart, Music2 } from '../ui/icons'

const SHELF = 12

// the page's own title, and what the library holds, each figure a way into it.
// a phone has the library a tab away, and starts the page at what is playing
function Head() {
    const songs = useStore(library, (s) => s.songs)
    useStore(library, (s) => s.meta)
    const albums = useAlbums()
    const artists = useArtists()
    const liked = useLikedSongs()
    const span = span_of(songs)

    const fact = (count: number, label: string, go: () => void) => (
        <button type='button' onClick={go} className='transition-colors hover:text-fg'>
            <span className='font-mono text-fg-2 tabular-nums'>{count}</span> {label}
        </button>
    )

    return (
        <div className='mb-8 max-sm:hidden'>
            <h1 className='font-serif text-[2.25rem] leading-tight font-medium'>Library</h1>
            {songs.length > 0 && (
                <div className='mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] text-muted'>
                    {fact(songs.length, 'songs', () => open_view('songs'))}
                    {fact(albums.size, 'albums', () => open_view('albums'))}
                    {fact(artists.size, 'artists', () => open_view('artists'))}
                    {fact(liked.length, 'liked', () => open_view('liked'))}
                    {span > 0 && <span>{format_span(span)} in all</span>}
                </div>
            )}
        </div>
    )
}

// what is playing, as the sleeve itself - or, with nothing cued, the way to start
function Hero() {
    const current = useStore(player, (s) => s.current)
    const paused = useStore(player, (s) => s.paused)
    const cover = useStore(library, (s) => (current ? s.covers[current] : undefined))
    const songs = useStore(library, (s) => s.songs)
    useStore(library, (s) => (current ? s.meta[current] : undefined))
    const queue = useQueue()
    const wave = useStore(ui, (s) => s.home_wave)

    if (!current) {
        if (!songs.length) return null

        return (
            <section className='mb-12 flex flex-wrap items-center gap-x-6 gap-y-4 py-4'>
                <div className='min-w-0 flex-1'>
                    <h2 className='text-[1.125rem] font-medium'>Nothing playing</h2>
                    <p className='mt-1 text-[0.875rem] text-fg-2'>
                        {songs.length} tracks, from the top or in any order
                    </p>
                </div>
                <div className='flex gap-2'>
                    <Button size='lg' icon={<Play size={16} />} onClick={() => void play_listing(songs)}>
                        Play all
                    </Button>
                    <Button
                        size='lg'
                        variant='secondary'
                        icon={<Shuffle size={16} />}
                        onClick={async () => {
                            await shuffle_into('all')
                            const order = player.get().shuffled
                            if (order?.length) void play_music(order[0])
                        }}
                    >
                        Shuffle
                    </Button>
                </div>
            </section>
        )
    }

    const at = queue.indexOf(current)
    const next = (at < 0 ? queue : queue.slice(at + 1)).slice(0, 3)

    /*
     * The sleeve and its words on the page's own ground, held by a hairline
     * rather than a filled card, with the sound rising behind them from the
     * floor of that frame and fading out at both ends.
     */
    return (
        <section className='@container relative mb-14 overflow-hidden rounded-(--r-panel) border border-line p-6 pb-20 max-sm:mt-2 max-sm:mb-10 max-sm:p-4 max-sm:pb-16'>
            {wave && (
                <Wave
                    gain={0.95}
                    className='absolute inset-x-0 bottom-0 -z-0 h-32 w-full max-sm:h-14 [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]'
                />
            )}

            {/* a grid, so on a phone the buttons can leave the narrow column beside
                the sleeve and take the card's whole width under both */}
            <div className='relative grid grid-cols-[auto_minmax(0,1fr)] grid-rows-[1fr_auto] items-end gap-x-8 @4xl:grid-cols-[auto_minmax(0,1fr)_auto] max-sm:grid-rows-none max-sm:items-center max-sm:gap-x-4'>
                <button
                    type='button'
                    {...tip('Lyrics')}
                    onClick={() => open_lyrics('player')}
                    onContextMenu={context({ kind: 'song', song: current })}
                    className='group relative row-span-2 shrink-0 max-sm:row-span-1'
                >
                    {/* the sleeve as an object on the table: a long soft shadow
                        under it, a tight one where it touches */}
                    <Cover data={cover} icon={40} className='size-52 max-sm:size-[6.5rem] rounded-[calc(var(--r-cover)*1.6)] shadow-[0_30px_50px_-26px_rgb(0_0_0/0.85),0_2px_8px_rgb(0_0_0/0.3)] transition-[scale] duration-300 ease-(--ease-out) group-active:scale-[0.98]' />
                </button>

                <div className='col-start-2 row-start-1 min-w-0 pb-1'>
                    <p className='flex items-center gap-2 text-[0.8125rem] text-fg-2'>
                        <Bars still={paused} /> {paused ? 'Paused' : 'Now playing'}
                    </p>
                    <h2 className='mt-2 truncate font-serif text-[clamp(2.25rem,3.4vw,3.25rem)] leading-[1.06] font-medium max-sm:mt-1 max-sm:text-[2rem]'>{title_of(current)}</h2>
                    <p className='mt-2 truncate text-[1rem] text-fg-2 max-sm:mt-1 max-sm:text-[0.8125rem]'>
                        {artist_of(current)} · {album_of(current)}
                    </p>
                </div>

                <div className='col-start-2 row-start-2 mt-6 flex items-center gap-2 max-sm:col-span-2 max-sm:col-start-1 max-sm:mt-4 max-sm:flex-wrap'>
                    <Button size='lg' icon={paused ? <Play size={16} /> : <Pause size={16} />} onClick={() => void toggle_pause()}>
                        {paused ? 'Resume' : 'Pause'}
                    </Button>
                    <Button size='lg' variant='secondary' icon={<MicVocal size={16} />} onClick={() => open_lyrics()}>
                        Lyrics
                    </Button>
                    <IconButton size='lg' variant='soft' {...tip('Track info')} onClick={() => ui.set({ info_open: true, info_face: 'about' })}>
                        <Info size={18} />
                    </IconButton>
                    <IconButton
                        size='lg'
                        variant='soft'
                        {...tip('More')}
                        onClick={(e) => {
                            e.stopPropagation()
                            const rect = e.currentTarget.getBoundingClientRect()
                            open_menu({ kind: 'song', song: current }, rect.left, rect.bottom + 4)
                        }}
                    >
                        <DotsThree size={18} />
                    </IconButton>
                </div>

                {next.length > 0 && (
                    <div className='col-start-3 row-span-2 row-start-1 hidden w-64 shrink-0 pb-1 @4xl:block'>
                        <p className='mb-2 px-2 text-[0.8125rem] text-muted'>Up next</p>
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
            className='flex h-12 w-full items-center gap-3 rounded-lg px-2 text-left transition-colors hover:bg-surface-2'
        >
            <Cover data={cover} size='sm' className='size-8' icon={14} />
            <div className='min-w-0'>
                <p className='truncate text-[0.8125rem]'>{title_of(name)}</p>
                <p className='truncate text-[0.75rem] text-muted'>{artist_of(name)}</p>
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
                <Shelf title='Favorites' note='The ones you starred' action={<SeeAll on_click={() => open_page('profile')} />}>
                    {favorites.slice(0, SHELF).map((name, i) => (
                        <TrackCard key={name} name={name} within={favorites} index={i} />
                    ))}
                </Shelf>
            )}

            {liked.length > 0 && (
                <Shelf title='Liked songs' note={`${liked.length} tracks`} action={<SeeAll on_click={() => open_view('liked')} />}>
                    {liked.slice(0, SHELF).map((name, i) => (
                        <TrackCard key={name} name={name} within={liked} index={i} />
                    ))}
                </Shelf>
            )}

            {arrivals.length >= 4 && (
                <Shelf title='New arrivals' note={`Last added ${format_date(added_of(arrivals[0])).toLowerCase()}`} action={<SeeAll on_click={() => open_view('songs')} />}>
                    {arrivals.map((name, i) => (
                        <TrackCard key={name} name={name} within={arrivals} index={i} />
                    ))}
                </Shelf>
            )}
        </>
    )
}

type Quick = { key: string; label: string; art: string; go: () => void; icon?: React.ReactNode }

/*
 * A phone's way in: the player is already in the dock, so the head of the
 * page is the places it goes back to most - the two collections, the pinned
 * playlists, then the others and the albums most recently added to - as small
 * glass tiles, two to a row, under a thumb.
 */
function QuickTiles() {
    const playlists = useStore(library, (s) => s.playlists)
    // the tiles read their sleeves off the library: they draw again as covers arrive
    useStore(library, (s) => s.covers)
    const view_covers = useStore(library, (s) => s.view_covers)
    useStore(library, (s) => s.meta)
    const pins = useStore(ui, (s) => s.pins)
    const albums = useAlbums()

    const tiles: Quick[] = [
        { key: 'liked', label: 'Liked songs', art: view_covers.liked ?? '', go: () => open_view('liked'), icon: <Heart size={18} className='fill-current text-accent' /> },
        { key: 'songs', label: 'All songs', art: view_covers.songs ?? '', go: () => open_view('songs'), icon: <Music2 size={18} className='text-fg-2' /> },
    ]
    for (const name of playlist_names_of(playlists, pins)) tiles.push({ key: `p:${name}`, label: name, art: playlist_art(name), go: () => open_playlist(name) })
    const newest = [...albums].sort(([, a], [, b]) => Math.max(...b.map(added_of)) - Math.max(...a.map(added_of)))
    for (const [name, tracks] of newest) {
        if (tiles.length >= 8) break
        tiles.push({ key: `a:${name}`, label: name, art: group_art(tracks), go: () => open_group('albums', name) })
    }

    return (
        <div className='mb-9 grid grid-cols-2 gap-2'>
            {tiles.slice(0, 8).map((tile) => (
                <button key={tile.key} type='button' onClick={tile.go} className='float thin flex h-14 min-w-0 items-center gap-2.5 overflow-hidden rounded-xl pr-2 text-left transition-transform active:scale-[0.97]'>
                    {tile.art || !tile.icon ? (
                        <Cover data={tile.art} size='sm' icon={16} className='size-14 shrink-0 rounded-none' />
                    ) : (
                        <span className='grid size-14 shrink-0 place-items-center bg-surface-3'>{tile.icon}</span>
                    )}
                    <span className='line-clamp-2 min-w-0 text-[0.875rem] leading-tight font-medium'>{tile.label}</span>
                </button>
            ))}
        </div>
    )
}

export function HomePage() {
    const phone = usePhone()
    const playing = useStore(player, (s) => !!s.current)
    const songs = useStore(library, (s) => s.songs.length)
    const loading = useStore(library, (s) => s.loading)
    const error = useStore(library, (s) => s.scan_error)
    const folder = useStore(library, (s) => s.folder)
    const discover = useStore(ui, (s) => s.suggest_on && s.places.includes('home'))

    // the first pass waits for this page: it is a round trip per seed
    useEffect(() => {
        if (songs && discover) want_similar()
    }, [songs, discover])

    return (
        <>
            <Head />
            {/* on a phone what is playing is the dock's; the hero gives way to the tiles */}
            {phone && songs ? (
                <>
                    {!playing && <Hero />}
                    <QuickTiles />
                </>
            ) : (
                <Hero />
            )}

            {songs ? (
                <>
                    <Shelves />
                    {discover && <DiscoverShelf />}
                </>
            ) : (
                <Empty
                    icon={loading ? <Spin><LoaderCircle size={20} /></Spin> : <FolderOpen size={20} />}
                    title={loading ? 'Scanning your library' : error ? 'Could not read your library' : 'No music here yet'}
                    className='mt-2'
                >
                    {loading ? null : error ? error : `Drop some mp3 files into ${folder || '~/Music'}, or search for a song above to download it.`}
                </Empty>
            )}
        </>
    )
}

import { ArrowLeft, Camera, Pencil, Star } from '../ui/icons'
import { useStore } from '../../lib/store'
import { playlist_names_of, useFavoriteSongs, useLikedSongs } from '../../state/derive'
import { pick_image } from '../../state/images'
import { library } from '../../state/library'
import { leave_page, open_view, ui } from '../../state/ui'
import { Button } from '../ui/Button'
import { Empty } from '../ui/Controls'
import { Cover } from '../ui/Cover'
import { tip } from '../../lib/tip'
import { TrackCard, tile_grid } from '../media/Track'

export function ProfilePage() {
    const username = useStore(library, (s) => s.username)
    const bio = useStore(library, (s) => s.biography)
    const pic = useStore(library, (s) => s.profile_pic)
    const busy = useStore(ui, (s) => s.crop_busy)
    const playlists = useStore(library, (s) => s.playlists)
    const pins = useStore(ui, (s) => s.pins)
    const favorites = useFavoriteSongs()
    const liked = useLikedSongs()
    const lists = playlist_names_of(playlists, pins).length

    const stat = (count: number, label: string, go?: () => void) =>
        go ? (
            <button type='button' onClick={go} className='transition-colors hover:text-fg'>
                <span className='font-mono text-fg-2 tabular-nums'>{count}</span> {label}
            </button>
        ) : (
            <span>
                <span className='font-mono text-fg-2 tabular-nums'>{count}</span> {label}
            </span>
        )

    return (
        <>
            {/* a phone's way back is its bar's (layout/Screens) */}
            <button type='button' onClick={leave_page} className='mb-6 flex h-8 items-center gap-1.5 rounded-md text-[0.8125rem] text-muted transition-colors hover:text-fg max-sm:hidden'>
                <ArrowLeft size={16} /> Back
            </button>

            <section className='mb-12 flex items-center gap-8'>
                {/* the picker has to be what the click lands on: some webviews
                    refuse to open the native dialog for a click proxied
                    through a button, so it lies over the picture */}
                <label className='group relative shrink-0 cursor-pointer' {...tip('Change photo')}>
                    <Cover data={pic} size='md' round icon={40} className='size-36 shadow-[0_20px_40px_-22px_rgb(0_0_0/0.75)]' />
                    <span className='absolute inset-0 grid place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100'>
                        <Camera size={20} />
                    </span>
                    <input type='file' accept='image/png,image/jpeg' disabled={busy} className='hidden' onChange={(e) => void pick_image(e, { kind: 'avatar' })} />
                </label>

                <div className='min-w-0 flex-1'>
                    <p className='text-[0.8125rem] text-muted'>Profile</p>
                    <h1 className='mt-1 truncate font-serif text-[2.75rem] leading-[1.08] font-medium'>{username || 'Unnamed'}</h1>
                    <p className={`mt-2 max-w-xl text-[0.9375rem] whitespace-pre-line ${bio ? 'text-fg-2' : 'text-muted'}`}>{bio || 'No bio yet'}</p>

                    <div className='mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.8125rem] text-muted'>
                        {stat(favorites.length, 'favorites')}
                        {stat(liked.length, 'liked', () => open_view('liked'))}
                        {stat(lists, 'playlists')}
                    </div>

                    <Button variant='secondary' icon={<Pencil size={16} />} onClick={() => ui.set({ profile_edit: true })} className='mt-6'>
                        Edit profile
                    </Button>
                </div>
            </section>

            <h2 className='mb-4 text-[1.125rem] font-medium'>Favorite songs</h2>
            {favorites.length ? (
                <div className={tile_grid}>
                    {favorites.map((name, i) => (
                        <TrackCard key={name} name={name} within={favorites} index={i} />
                    ))}
                </div>
            ) : (
                <Empty icon={<Star size={20} />} title='No favorite songs yet'>
                    Pick Add to favorites from a track's menu.
                </Empty>
            )}
        </>
    )
}

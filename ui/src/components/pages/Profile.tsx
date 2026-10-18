import { ArrowLeft, Camera, Heart, ListMusic, Pencil, Star } from '../ui/icons'
import { useStore } from '../../lib/store'
import { playlist_names_of, useFavoriteSongs, useLikedSongs } from '../../state/derive'
import { pick_image } from '../../state/images'
import { library } from '../../state/library'
import { leave_page, open_view, ui } from '../../state/ui'
import { Button } from '../ui/Button'
import { Empty } from '../ui/Controls'
import { Cover } from '../ui/Cover'
import { tip } from '../../lib/tip'
import { TrackCard, card_grid } from '../media/Track'

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

    const stat = (icon: React.ReactNode, count: number, label: string, go?: () => void) => (
        <button type='button' disabled={!go} onClick={go} className='flex items-center gap-2 rounded-xl bg-surface-2 px-3.5 py-2 text-xs text-muted transition-colors enabled:hover:bg-surface-3 enabled:hover:text-fg'>
            <span className='text-accent'>{icon}</span>
            <b className='text-sm font-semibold text-fg'>{count}</b> {label}
        </button>
    )

    return (
        <>
            <button type='button' onClick={leave_page} className='mb-4 flex items-center gap-1.5 text-xs text-muted transition-colors hover:text-fg'>
                <ArrowLeft size={13} /> Back
            </button>

            <section className='edge relative mb-10 overflow-hidden rounded-3xl bg-surface p-7'>
                <div className='pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_oklab,var(--accent)_16%,transparent),transparent_60%)]' />

                <div className='relative flex items-center gap-7'>
                    {/* the picker has to be what the click lands on: some webviews
                        refuse to open the native dialog for a click proxied
                        through a button, so it lies over the picture */}
                    <label className='group relative shrink-0 cursor-pointer' {...tip('Change photo')}>
                        <Cover data={pic} size='md' round icon={40} className='size-32 shadow-soft' />
                        <span className='absolute inset-0 grid place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100'>
                            <Camera size={22} />
                        </span>
                        <input type='file' accept='image/png,image/jpeg' disabled={busy} className='hidden' onChange={(e) => void pick_image(e, { kind: 'avatar' })} />
                    </label>

                    <div className='min-w-0 flex-1'>
                        <p className='text-[0.68rem] font-medium tracking-wider text-accent uppercase'>Profile</p>
                        <h1 className='mt-1 truncate font-display text-[2.6rem] leading-tight font-bold tracking-tight'>{username || 'Unnamed'}</h1>
                        <p className={`mt-1 max-w-xl text-sm whitespace-pre-line ${bio ? 'text-fg/80' : 'text-muted'}`}>{bio || 'No bio yet.'}</p>

                        <div className='mt-5 flex flex-wrap items-center gap-2'>
                            {stat(<Star size={14} />, favorites.length, 'favorites')}
                            {stat(<Heart size={14} />, liked.length, 'liked', () => open_view('liked'))}
                            {stat(<ListMusic size={14} />, lists, 'playlists')}
                            <Button variant='secondary' size='sm' icon={<Pencil size={13} />} onClick={() => ui.set({ profile_edit: true })} className='ml-1'>
                                Edit profile
                            </Button>
                        </div>
                    </div>
                </div>
            </section>

            <h2 className='mb-4 text-[1.05rem] font-semibold tracking-tight'>Favorite songs</h2>
            {favorites.length ? (
                <div className={card_grid}>
                    {favorites.map((name, i) => (
                        <TrackCard key={name} name={name} within={favorites} index={i} />
                    ))}
                </div>
            ) : (
                <Empty icon={<Star size={20} />} title='No favorite songs yet.'>
                    Right-click a track and pick Add to favorites.
                </Empty>
            )}
        </>
    )
}

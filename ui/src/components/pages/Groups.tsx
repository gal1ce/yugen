import { Disc3, Mic2 } from '../ui/icons'
import { collate } from '../../lib/names'
import { useStore } from '../../lib/store'
import { useAlbums, useArtists } from '../../state/derive'
import { open_group, ui } from '../../state/ui'
import { Empty } from '../ui/Controls'
import { GroupCard } from '../media/Group'
import { card_grid } from '../media/Track'

// the albums or the artists, one card each, alphabetical
export function GroupsPage() {
    const view = useStore(ui, (s) => s.view) as 'albums' | 'artists'
    const albums = useAlbums()
    const artists = useArtists()
    const groups = view === 'albums' ? albums : artists
    const entries = [...groups].sort(([a], [b]) => collate(a, b))

    return (
        <>
            <div className='mb-7'>
                <p className='text-[0.68rem] font-medium tracking-wider text-accent uppercase'>Browse</p>
                <h1 className='mt-1 font-display text-[2.4rem] leading-tight font-bold tracking-tight'>{view === 'albums' ? 'Albums' : 'Artists'}</h1>
                <p className='mt-1 text-sm text-muted'>
                    {groups.size} {view}
                </p>
            </div>

            {entries.length ? (
                <div className={card_grid}>
                    {entries.map(([name, tracks]) => (
                        <GroupCard key={name} name={name} tracks={tracks} round={view === 'artists'} on_open={() => open_group(view, name)} />
                    ))}
                </div>
            ) : (
                <Empty icon={view === 'albums' ? <Disc3 size={20} /> : <Mic2 size={20} />} title='Nothing to group yet.' />
            )}
        </>
    )
}

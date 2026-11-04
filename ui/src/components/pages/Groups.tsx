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
            <div className='mb-8'>
                <h1 className='font-serif text-[2.25rem] leading-tight font-medium'>{view === 'albums' ? 'Albums' : 'Artists'}</h1>
                <p className='mt-2 text-[0.8125rem] text-muted'>
                    <span className='font-mono text-fg-2 tabular-nums'>{groups.size}</span> {view}, by name
                </p>
            </div>

            {entries.length ? (
                <div className={card_grid}>
                    {entries.map(([name, tracks]) => (
                        <GroupCard key={name} name={name} tracks={tracks} round={view === 'artists'} on_open={() => open_group(view, name)} />
                    ))}
                </div>
            ) : (
                <Empty icon={view === 'albums' ? <Disc3 size={20} /> : <Mic2 size={20} />} title='Nothing to group yet' />
            )}
        </>
    )
}

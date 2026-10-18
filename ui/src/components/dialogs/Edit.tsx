import { useState } from 'react'
import { Camera } from '../ui/icons'
import { useStore } from '../../lib/store'
import { playlist_art } from '../../state/derive'
import { pick_image } from '../../state/images'
import { library, save_profile } from '../../state/library'
import { rename_playlist } from '../../state/playlists'
import { ui } from '../../state/ui'
import { Button } from '../ui/Button'
import { Cover } from '../ui/Cover'
import { Dialog, DialogActions } from '../ui/Dialog'

const field = 'h-10 w-full rounded-xl border border-line bg-surface-2 px-3.5 text-[0.82rem] text-fg outline-none transition-colors placeholder:text-muted focus:border-accent/40 focus:bg-surface-3'

// the picture is the way to change it: it comes up under the pointer rather
// than standing beside it as a second control. the file input is what the
// click lands on - see Profile
function PicturePick({ data, round, on_pick, busy }: { data?: string; round?: boolean; on_pick: (e: React.ChangeEvent<HTMLInputElement>) => void; busy: boolean }) {
    return (
        <label className='group relative shrink-0 cursor-pointer'>
            <Cover data={data} size='md' round={round} icon={32} className={round ? 'size-24' : 'size-28 rounded-2xl'} />
            <span className={`absolute inset-0 grid place-items-center bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 ${round ? 'rounded-full' : 'rounded-2xl'}`}>
                <Camera size={20} />
            </span>
            <input type='file' accept='image/png,image/jpeg' disabled={busy} className='hidden' onChange={on_pick} />
        </label>
    )
}

export function PlaylistDialog({ name }: { name: string }) {
    const [draft, set_draft] = useState(name)
    const busy = useStore(ui, (s) => s.crop_busy)
    const own = useStore(library, (s) => !!s.playlist_covers[name])
    const art = useStore(library, () => playlist_art(name))
    const close = () => ui.set({ editing: null })

    const commit = async () => {
        close()
        await rename_playlist(name, draft)
    }

    return (
        <Dialog title='Edit details' on_close={close}>
            <div className='flex items-center gap-5'>
                <PicturePick data={art} busy={busy} on_pick={(e) => void pick_image(e, { kind: 'playlist', name })} />
                <div className='min-w-0 flex-1'>
                    <label className='mb-1.5 block text-xs text-muted'>Name</label>
                    <input
                        autoFocus
                        value={draft}
                        placeholder='Playlist name'
                        onChange={(e) => set_draft(e.currentTarget.value)}
                        onKeyDown={(e) => e.key === 'Enter' && draft.trim() && void commit()}
                        className={field}
                    />
                    <p className='mt-2 text-xs text-muted'>{own ? 'This playlist has a cover of its own.' : 'Borrowing the cover of the first track in it.'}</p>
                </div>
            </div>
            <DialogActions>
                <Button variant='ghost' onClick={close}>
                    Cancel
                </Button>
                <Button disabled={!draft.trim()} onClick={() => void commit()}>
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    )
}

export function ProfileDialog() {
    const username = useStore(library, (s) => s.username)
    const biography = useStore(library, (s) => s.biography)
    const pic = useStore(library, (s) => s.profile_pic)
    const busy = useStore(ui, (s) => s.crop_busy)
    // the drafts are seeded fresh each time it opens, so closing without saving
    // never leaks a stale edit
    const [name, set_name] = useState(username)
    const [bio, set_bio] = useState(biography)
    const close = () => ui.set({ profile_edit: false })

    const commit = () => {
        close()
        void save_profile(name.trim(), bio.trim())
    }

    return (
        <Dialog title='Edit profile' sub='Kept on this device only, next to your library.' on_close={close}>
            <div className='flex gap-5'>
                <PicturePick data={pic} round busy={busy} on_pick={(e) => void pick_image(e, { kind: 'avatar' })} />
                <div className='min-w-0 flex-1 space-y-3'>
                    <div>
                        <label className='mb-1.5 block text-xs text-muted'>Name</label>
                        <input autoFocus value={name} placeholder='Your name' onChange={(e) => set_name(e.currentTarget.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && commit()} className={field} />
                    </div>
                    <div>
                        <label className='mb-1.5 block text-xs text-muted'>Bio</label>
                        <textarea
                            value={bio}
                            placeholder='Add a bio'
                            rows={3}
                            onChange={(e) => set_bio(e.currentTarget.value)}
                            onKeyDown={(e) => {
                                // enter confirms; a line break in the bio is shift+enter
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault()
                                    if (name.trim()) commit()
                                }
                            }}
                            className={`${field} h-auto resize-none py-2.5`}
                        />
                    </div>
                </div>
            </div>
            <DialogActions>
                <Button variant='ghost' onClick={close}>
                    Cancel
                </Button>
                <Button disabled={!name.trim()} onClick={commit}>
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    )
}

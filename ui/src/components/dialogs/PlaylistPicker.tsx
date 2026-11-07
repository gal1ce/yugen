import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, useMotionValue } from 'motion/react'
import { usePull } from '../../hooks/pull'
import { bridge } from '../../lib/bridge'
import { cn } from '../../lib/cn'
import { spring } from '../../lib/motion'
import { useStore } from '../../lib/store'
import { playlist_names_of } from '../../state/derive'
import { add_to_playlist, artist_of, library, next_playlist_name, remove_from_playlist, sync_playlists, title_of, toggle_like } from '../../state/library'
import { ui } from '../../state/ui'
import { Button } from '../ui/Button'
import { Cover } from '../ui/Cover'
import { Check, Heart, ListMusic, Plus, Search } from '../ui/icons'

/*
 * Where a track goes, on a phone: a page of its own rather than a menu inside
 * a menu. Every playlist is a row with its sleeve and its count, and a mark
 * at its end - a filled tick where the track is, an open plus where it is
 * not. A press only marks: nothing is written until Done, so a wrong press
 * costs nothing, and Cancel (or the back, or a pull down) leaves everything as
 * it was. The ones the track is already in come first, under "Saved in".
 */
const LIKED = '\u0000liked'

export function PlaylistPicker({ song }: { song: string }) {
    const playlists = useStore(library, (s) => s.playlists)
    const covers = useStore(library, (s) => s.covers)
    const sleeves = useStore(library, (s) => s.playlist_covers)
    const liked_now = useStore(library, (s) => s.liked.has(song))
    const liked_total = useStore(library, (s) => s.liked.size)
    const liked_art = useStore(library, (s) => s.view_covers.liked)
    const pins = useStore(ui, (s) => s.pins)
    const names = playlist_names_of(playlists, pins)
    const [query, set_query] = useState('')
    const [busy, set_busy] = useState(false)

    // where the track was when the page opened, and where it is to be
    const was = useMemo(() => {
        const set = new Set(names.filter((name) => playlists[name].includes(song)))
        if (liked_now) set.add(LIKED)
        return set
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
    const [marked, set_marked] = useState<Set<string>>(() => new Set(was))

    const sheet = useRef<HTMLDivElement>(null)
    const y = useMotionValue(0)
    const close = useCallback(() => ui.set({ picking: null }), [])
    usePull(sheet, y, close)

    useEffect(() => {
        const on_key = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), close())
        window.addEventListener('keydown', on_key, { capture: true })
        return () => window.removeEventListener('keydown', on_key, { capture: true })
    }, [close])

    const toggle = (key: string) =>
        set_marked((now) => {
            const next = new Set(now)
            if (next.has(key)) next.delete(key)
            else next.add(key)
            return next
        })

    const changed = [...new Set([...was, ...marked])].filter((key) => was.has(key) !== marked.has(key))

    const done = async () => {
        set_busy(true)
        for (const key of changed) {
            if (key === LIKED) await toggle_like(song)
            else if (marked.has(key)) await add_to_playlist(key, song)
            else await remove_from_playlist(key, song)
        }
        close()
    }

    // a new one is made and marked at once, and Done puts the track in it
    const fresh = async () => {
        set_busy(true)
        const name = await next_playlist_name()
        await bridge().create_playlist(name)
        await sync_playlists()
        set_marked((now) => new Set(now).add(name))
        set_busy(false)
    }

    const q = query.trim().toLowerCase()
    const shown = names.filter((name) => !q || name.toLowerCase().includes(q))
    const saved = shown.filter((name) => was.has(name))
    const rest = shown.filter((name) => !was.has(name))
    const liked_shown = !q || 'liked songs'.includes(q)

    const art = (name: string) => sleeves[name] || covers[playlists[name]?.[0] ?? '']

    const row = (id: string, name: string, count: number, picture: React.ReactNode) => {
        const on = marked.has(id)

        return (
            <button key={id} type='button' onClick={() => toggle(id)} className='flex w-full items-center gap-3.5 rounded-xl py-2 text-left active:bg-surface-2'>
                {picture}
                <span className='min-w-0 flex-1'>
                    <span className='block truncate text-[1rem] text-fg'>{name}</span>
                    <span className='block text-[0.8125rem] text-muted'>{count ? `${count} ${count === 1 ? 'song' : 'songs'}` : 'Empty'}</span>
                </span>
                <span
                    aria-hidden
                    className={cn(
                        'grid size-7 shrink-0 place-items-center rounded-full transition-[background-color,box-shadow,scale] active:scale-90',
                        on ? 'bg-accent text-accent-fg' : 'text-fg-2 shadow-[inset_0_0_0_1.5px_currentColor]',
                    )}
                >
                    {on ? <Check size={16} /> : <Plus size={16} />}
                </span>
            </button>
        )
    }

    // the count as it will be once Done is pressed
    const count_of = (key: string, now: number) => now + (marked.has(key) && !was.has(key) ? 1 : 0) - (!marked.has(key) && was.has(key) ? 1 : 0)

    const playlist_row = (name: string) =>
        row(
            name,
            name,
            count_of(name, playlists[name].length),
            art(name) ? (
                <Cover data={art(name)} size='sm' className='size-14 shrink-0' />
            ) : (
                <span className='grid size-14 shrink-0 place-items-center rounded-(--r-cover) bg-surface-2 text-muted'>
                    <ListMusic size={22} />
                </span>
            ),
        )

    const liked_row = row(
        LIKED,
        'Liked songs',
        count_of(LIKED, liked_total),
        liked_art ? (
            <Cover data={liked_art} size='sm' className='size-14 shrink-0' />
        ) : (
            <span className='grid size-14 shrink-0 place-items-center rounded-(--r-cover) bg-[color-mix(in_oklab,var(--accent)_24%,transparent)]'>
                <Heart size={22} className='fill-current text-accent' />
            </span>
        ),
    )

    return (
        <div className='fixed inset-0 z-60'>
            <motion.div aria-hidden className='absolute inset-0 bg-black/50' initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={close} />
            <motion.div className='absolute inset-x-0 top-[calc(var(--safe-top)+0.5rem)] bottom-0' initial={{ y: '100%' }} animate={{ y: 0 }} transition={spring.sheet}>
                <motion.div ref={sheet} role='dialog' aria-label='Add to playlist' style={{ y }} className='flex h-full flex-col rounded-t-[1.75rem] bg-surface shadow-[0_-1px_0_var(--line-strong)]'>
                    <div className='flex h-6 shrink-0 items-center justify-center'>
                        <span aria-hidden className='h-1 w-10 rounded-full bg-line-strong' />
                    </div>

                    <header className='flex h-12 shrink-0 items-center justify-between px-3'>
                        <Button variant='ghost' onClick={close}>
                            Cancel
                        </Button>
                        <p className='text-[1rem] font-medium'>Add to playlist</p>
                        <Button variant='ghost' disabled={busy} onClick={() => void done()} className='text-accent!'>
                            Done
                        </Button>
                    </header>

                    {/* which track this is about */}
                    <div className='mx-4 mt-1 flex items-center gap-3 rounded-2xl bg-surface-2 p-2.5'>
                        <Cover data={covers[song]} size='sm' className='size-11 shrink-0' icon={16} />
                        <div className='min-w-0'>
                            <p className='truncate text-[0.9375rem] text-fg'>{title_of(song)}</p>
                            <p className='truncate text-[0.8125rem] text-muted'>{artist_of(song)}</p>
                        </div>
                    </div>

                    <div className='mx-4 mt-3 flex items-center gap-2'>
                        <label className='flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-full bg-surface-2 px-4'>
                            <Search size={18} className='shrink-0 text-muted' />
                            <input value={query} onChange={(e) => set_query(e.target.value)} placeholder='Find a playlist' className='min-w-0 flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-muted' />
                        </label>
                        <Button variant='secondary' size='lg' disabled={busy} icon={<Plus size={16} />} onClick={() => void fresh()} className='h-11'>
                            New
                        </Button>
                    </div>

                    <div className='mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(var(--safe-bottom)+6rem)]'>
                        {(saved.length > 0 || (liked_shown && was.has(LIKED))) && (
                            <>
                                <p className='mt-2 mb-1 text-[0.8125rem] text-muted'>Saved in</p>
                                {liked_shown && was.has(LIKED) && liked_row}
                                {saved.map(playlist_row)}
                            </>
                        )}
                        <p className='mt-4 mb-1 text-[0.8125rem] text-muted'>{saved.length || was.has(LIKED) ? 'Everywhere else' : 'Your playlists'}</p>
                        {liked_shown && !was.has(LIKED) && liked_row}
                        {rest.map(playlist_row)}
                        {!shown.length && q && <p className='py-6 text-center text-[0.875rem] text-muted'>No playlist called that</p>}
                    </div>

                    {/* under the thumb, once there is something to keep */}
                    {changed.length > 0 && (
                        <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={spring.snappy} className='pointer-events-none absolute inset-x-0 bottom-[calc(var(--safe-bottom)+1.25rem)] flex justify-center'>
                            <Button size='lg' disabled={busy} onClick={() => void done()} className='pointer-events-auto rounded-full px-8'>
                                Done
                            </Button>
                        </motion.div>
                    )}
                </motion.div>
            </motion.div>
        </div>
    )
}

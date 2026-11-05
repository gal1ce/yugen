import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Disc3, Download, Heart, Mic2, ImagePlus, ListEnd, ListMusic, ListPlus, ListStart, Minus, Pencil, Pin, PinOff, Play, Plus, Star, Trash2, Waveform } from '../ui/icons'
import { useDismiss } from '../../hooks/dismiss'
import { useStore } from '../../lib/store'
import { playlist_names_of } from '../../state/derive'
import { choose_track_cover } from '../../state/images'
import { add_to_playlist, album_of, artist_of, is_favorite, library, remove_from_playlist, title_of, toggle_favorite, toggle_like } from '../../state/library'
import { add_to_drift, add_to_queue, play_from, play_next, remove_song } from '../../state/player'
import { delete_playlist, new_playlist } from '../../state/playlists'
import { download_suggestion } from '../../state/suggest'
import { open_group, toggle_pin, ui } from '../../state/ui'
import { usePhone } from '../../hooks/phone'
import { group_key } from '../../lib/names'
import { Cover } from '../ui/Cover'
import { MenuItem, MenuLabel, MenuPanel, MenuSep, Submenu } from '../ui/Menu'
import { Scroll } from '../ui/Scroll'

// everywhere a track can be put. the right-click submenu opens it and so does
// the button on the track card, and neither wants a list of its own
export function PlaylistTargets({ song }: { song: string }) {
    const liked = useStore(library, (s) => s.liked.has(song))
    const playlists = useStore(library, (s) => s.playlists)
    const pins = useStore(ui, (s) => s.pins)
    const names = playlist_names_of(playlists, pins)

    return (
        <>
            <MenuItem icon={<Heart size={16} className={liked ? 'fill-current text-accent' : ''} />} checked={liked} onClick={() => void toggle_like(song)}>
                Liked songs
            </MenuItem>
            {names.length > 0 && <MenuSep />}
            <Scroll className='max-h-64'>
                {names.map((name) => {
                    const inside = playlists[name].includes(song)

                    return (
                        <MenuItem key={name} icon={<ListMusic size={16} />} checked={inside} onClick={() => void (inside ? remove_from_playlist(name, song) : add_to_playlist(name, song))}>
                            {name}
                        </MenuItem>
                    )
                })}
            </Scroll>
            <MenuSep />
            <MenuItem icon={<Plus size={16} />} onClick={() => void new_playlist(song)}>
                New playlist
            </MenuItem>
        </>
    )
}

// the head of a track's sheet on a phone: which track the sheet is about,
// as the row it was opened from showed it
function SongHead({ song, cover }: { song: string; cover?: string }) {
    return (
        <div className='mb-1 flex items-center gap-3.5 border-b border-line px-3 pt-1 pb-3.5'>
            <Cover data={cover} size='sm' className='size-14 shrink-0' icon={18} />
            <div className='min-w-0'>
                <p className='truncate text-[1.0625rem] text-fg'>{title_of(song)}</p>
                <p className='truncate text-[0.875rem] text-muted'>
                    {artist_of(song)} · {album_of(song)}
                </p>
            </div>
        </div>
    )
}

function SongMenu({ song, within }: { song: string; within?: string[] }) {
    const liked = useStore(library, (s) => s.liked.has(song))
    const favorite = useStore(library, () => is_favorite(song))
    const view = useStore(ui, (s) => s.view)
    const selection = useStore(ui, (s) => s.selection)
    const in_playlist = useStore(library, (s) => view === 'playlist' && !!selection && !!s.playlists[selection]?.includes(song))
    const cover = useStore(library, (s) => s.covers[song])
    const phone = usePhone()

    return (
        <>
            {phone ? <SongHead song={song} cover={cover} /> : <MenuLabel>{title_of(song)}</MenuLabel>}
            <MenuItem icon={<Play size={16} />} onClick={() => void play_from(song, within ?? null)}>
                Play
            </MenuItem>
            <MenuItem icon={<ListStart size={16} />} onClick={() => play_next(song)}>
                Play next
            </MenuItem>
            <MenuItem icon={<ListEnd size={16} />} onClick={() => add_to_queue(song)}>
                Add to queue
            </MenuItem>
            <MenuItem icon={<Waveform size={16} />} hint='plays once' onClick={() => add_to_drift(song)}>
                Drift
            </MenuItem>
            <MenuSep />
            <MenuItem icon={<Heart size={16} className={liked ? 'fill-current text-accent' : ''} />} onClick={() => void toggle_like(song)}>
                {liked ? 'Remove from liked' : 'Add to liked'}
            </MenuItem>
            <MenuItem icon={<Star size={16} className={favorite ? 'fill-current text-accent' : ''} />} onClick={() => void toggle_favorite(song)}>
                {favorite ? 'Remove from favorites' : 'Add to favorites'}
            </MenuItem>
            {in_playlist && selection && (
                <MenuItem icon={<Minus size={16} />} onClick={() => void remove_from_playlist(selection, song)}>
                    Remove from {selection}
                </MenuItem>
            )}

            <Submenu icon={<ListPlus size={16} />} label='Add to playlist'>
                <PlaylistTargets song={song} />
            </Submenu>

            {phone && (
                <>
                    <MenuSep />
                    <MenuItem icon={<Disc3 size={16} />} onClick={() => (ui.set({ lyrics_open: false }), open_group('albums', group_key(album_of(song))))}>
                        Go to album
                    </MenuItem>
                    <MenuItem icon={<Mic2 size={16} />} onClick={() => (ui.set({ lyrics_open: false }), open_group('artists', group_key(artist_of(song))))}>
                        Go to artist
                    </MenuItem>
                </>
            )}

            <MenuSep />
            <MenuItem icon={<Pencil size={16} />} onClick={() => ui.set({ retitling: song })}>
                Rename
            </MenuItem>
            <MenuItem icon={<ImagePlus size={16} />} onClick={() => choose_track_cover(song)}>
                Change cover
            </MenuItem>
            <MenuSep />
            <MenuItem danger icon={<Trash2 size={16} />} onClick={() => void remove_song(song)}>
                Delete from disk
            </MenuItem>
        </>
    )
}

export function ContextMenu() {
    const menu = useStore(ui, (s) => s.menu)
    const pins = useStore(ui, (s) => s.pins)
    const close = useCallback(() => ui.set({ menu: null }), [])
    const panel = useRef<HTMLDivElement>(null)
    const [place, set_place] = useState<{ left: number; top: number } | null>(null)

    useDismiss(!!menu, close)

    // drawn hidden first, measured, then put where it fits: under and right of
    // the pointer when there is room, turned back from whichever edge there is not
    useLayoutEffect(() => {
        const box = panel.current
        if (!menu || !box) return

        // measured as drawn, and placed in the menu's own units: a menu sized
        // up in settings is zoomed, and its left and top are zoomed with it
        const { width, height } = box.getBoundingClientRect()
        const zoom = parseFloat(getComputedStyle(box).zoom) || 1
        const left = menu.x + width > window.innerWidth - 8 ? Math.max(8, menu.x - width) : menu.x
        const top = menu.y + height > window.innerHeight - 8 ? Math.max(8, Math.min(menu.y - height, window.innerHeight - height - 8)) : menu.y

        set_place({ left: left / zoom, top: top / zoom })
    }, [menu])

    if (!menu) return null

    return (
        <MenuPanel ref={panel} className='fixed w-56' style={place ?? { left: 0, top: 0, visibility: 'hidden' }}>
            {menu.kind === 'song' && <SongMenu song={menu.song} within={menu.within} />}

            {menu.kind === 'suggestion' && (
                <>
                    <MenuLabel>
                        {menu.track.title} · {menu.track.artist || 'Unknown artist'}
                    </MenuLabel>
                    <MenuItem icon={<Download size={16} />} onClick={() => void download_suggestion(menu.track)}>
                        Download
                    </MenuItem>
                </>
            )}

            {menu.kind === 'playlist' && (
                <>
                    <MenuLabel>{menu.playlist}</MenuLabel>
                    <MenuItem icon={pins.includes(menu.playlist) ? <PinOff size={16} /> : <Pin size={16} />} onClick={() => toggle_pin(menu.playlist)}>
                        {pins.includes(menu.playlist) ? 'Unpin playlist' : 'Pin playlist'}
                    </MenuItem>
                    <MenuItem icon={<Pencil size={16} />} onClick={() => ui.set({ editing: menu.playlist })}>
                        Edit details
                    </MenuItem>
                    <MenuSep />
                    <MenuItem danger icon={<Trash2 size={16} />} onClick={() => void delete_playlist(menu.playlist)}>
                        Delete playlist
                    </MenuItem>
                </>
            )}

            {menu.kind === 'sidebar' && (
                <MenuItem icon={<Plus size={16} />} onClick={() => void new_playlist()}>
                    New playlist
                </MenuItem>
            )}
        </MenuPanel>
    )
}

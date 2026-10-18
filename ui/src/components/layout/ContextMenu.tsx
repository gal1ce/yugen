import { useCallback, useState } from 'react'
import { ChevronRight, Download, Heart, ImagePlus, ListEnd, ListMusic, ListPlus, ListStart, Minus, Pencil, Pin, PinOff, Play, Plus, Star, Trash2 } from '../ui/icons'
import { useDismiss } from '../../hooks/dismiss'
import { useStore } from '../../lib/store'
import { playlist_names_of } from '../../state/derive'
import { choose_track_cover } from '../../state/images'
import { add_to_playlist, is_favorite, library, remove_from_playlist, title_of, toggle_favorite, toggle_like } from '../../state/library'
import { add_to_queue, play_from, play_next, remove_song } from '../../state/player'
import { delete_playlist, new_playlist } from '../../state/playlists'
import { download_suggestion } from '../../state/suggest'
import { toggle_pin, ui } from '../../state/ui'
import { MenuItem, MenuLabel, MenuPanel, MenuSep } from '../ui/Menu'

// everywhere a track can be put. the right-click submenu opens it and so does
// the button on the track card, and neither wants a list of its own
export function PlaylistTargets({ song }: { song: string }) {
    const liked = useStore(library, (s) => s.liked.has(song))
    const playlists = useStore(library, (s) => s.playlists)
    const pins = useStore(ui, (s) => s.pins)
    const names = playlist_names_of(playlists, pins)

    return (
        <>
            <MenuItem icon={<Heart size={15} className={liked ? 'fill-current text-accent' : ''} />} checked={liked} onClick={() => void toggle_like(song)}>
                Liked Songs
            </MenuItem>
            {names.length > 0 && <MenuSep />}
            <div className='max-h-64 overflow-y-auto'>
                {names.map((name) => {
                    const inside = playlists[name].includes(song)

                    return (
                        <MenuItem key={name} icon={<ListMusic size={15} />} checked={inside} onClick={() => void (inside ? remove_from_playlist(name, song) : add_to_playlist(name, song))}>
                            {name}
                        </MenuItem>
                    )
                })}
            </div>
            <MenuSep />
            <MenuItem icon={<Plus size={15} />} onClick={() => void new_playlist(song)}>
                New playlist
            </MenuItem>
        </>
    )
}

function SongMenu({ song, within, x }: { song: string; within?: string[]; x: number }) {
    const [sub, set_sub] = useState(false)
    const liked = useStore(library, (s) => s.liked.has(song))
    const favorite = useStore(library, () => is_favorite(song))
    const view = useStore(ui, (s) => s.view)
    const selection = useStore(ui, (s) => s.selection)
    const in_playlist = useStore(library, (s) => view === 'playlist' && !!selection && !!s.playlists[selection]?.includes(song))

    // no room on the right half of the window, so the submenu opens leftwards
    const flip = x > window.innerWidth / 2

    return (
        <>
            <MenuLabel>{title_of(song)}</MenuLabel>
            <MenuItem icon={<Play size={15} />} onClick={() => void play_from(song, within ?? null)}>
                Play
            </MenuItem>
            <MenuItem icon={<ListStart size={15} />} onClick={() => play_next(song)}>
                Play next
            </MenuItem>
            <MenuItem icon={<ListEnd size={15} />} onClick={() => add_to_queue(song)}>
                Add to queue
            </MenuItem>
            <MenuSep />
            <MenuItem icon={<Heart size={15} className={liked ? 'fill-current text-accent' : ''} />} onClick={() => void toggle_like(song)}>
                {liked ? 'Remove from liked' : 'Add to liked'}
            </MenuItem>
            <MenuItem icon={<Star size={15} className={favorite ? 'fill-current text-accent' : ''} />} onClick={() => void toggle_favorite(song)}>
                {favorite ? 'Remove from favorites' : 'Add to favorites'}
            </MenuItem>
            {in_playlist && selection && (
                <MenuItem icon={<Minus size={15} />} onClick={() => void remove_from_playlist(selection, song)}>
                    Remove from {selection}
                </MenuItem>
            )}

            <div className='relative' onMouseEnter={() => set_sub(true)} onMouseLeave={() => set_sub(false)}>
                {/* the menu closes on any click, so this one has to stay put */}
                <MenuItem icon={<ListPlus size={15} />} onClick={(e) => (e.stopPropagation(), set_sub(true))} className={sub ? 'bg-surface-3' : ''}>
                    <span className='flex items-center justify-between'>
                        Add to <ChevronRight size={14} className='text-muted' />
                    </span>
                </MenuItem>
                {sub && (
                    <MenuPanel className={`absolute top-0 w-56 ${flip ? 'right-full mr-1.5' : 'left-full ml-1.5'}`}>
                        <PlaylistTargets song={song} />
                    </MenuPanel>
                )}
            </div>

            <MenuSep />
            <MenuItem icon={<ImagePlus size={15} />} onClick={() => choose_track_cover(song)}>
                Change cover
            </MenuItem>
            <MenuSep />
            <MenuItem danger icon={<Trash2 size={15} />} onClick={() => void remove_song(song)}>
                Delete from disk
            </MenuItem>
        </>
    )
}

export function ContextMenu() {
    const menu = useStore(ui, (s) => s.menu)
    const pins = useStore(ui, (s) => s.pins)
    const close = useCallback(() => ui.set({ menu: null }), [])

    useDismiss(!!menu, close)

    if (!menu) return null

    return (
        <MenuPanel className='fixed w-56' style={{ left: menu.x, top: menu.y }}>
            {menu.kind === 'song' && <SongMenu song={menu.song} within={menu.within} x={menu.x} />}

            {menu.kind === 'suggestion' && (
                <>
                    <MenuLabel>
                        {menu.track.title} · {menu.track.artist || 'Unknown artist'}
                    </MenuLabel>
                    <MenuItem icon={<Download size={15} />} onClick={() => void download_suggestion(menu.track)}>
                        Download
                    </MenuItem>
                </>
            )}

            {menu.kind === 'playlist' && (
                <>
                    <MenuLabel>{menu.playlist}</MenuLabel>
                    <MenuItem icon={pins.includes(menu.playlist) ? <PinOff size={15} /> : <Pin size={15} />} onClick={() => toggle_pin(menu.playlist)}>
                        {pins.includes(menu.playlist) ? 'Unpin playlist' : 'Pin playlist'}
                    </MenuItem>
                    <MenuItem icon={<Pencil size={15} />} onClick={() => ui.set({ editing: menu.playlist })}>
                        Edit details
                    </MenuItem>
                    <MenuSep />
                    <MenuItem danger icon={<Trash2 size={15} />} onClick={() => void delete_playlist(menu.playlist)}>
                        Delete playlist
                    </MenuItem>
                </>
            )}

            {menu.kind === 'sidebar' && (
                <MenuItem icon={<Plus size={15} />} onClick={() => void new_playlist()}>
                    New playlist
                </MenuItem>
            )}
        </MenuPanel>
    )
}

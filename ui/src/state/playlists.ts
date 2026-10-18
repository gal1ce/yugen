import { bridge } from '../lib/bridge'
import { library, next_playlist_name, sync_playlists } from './library'
import { move_pin, open_playlist, open_view, ui } from './ui'

// making one is not worth a question: it gets a name and opens as if it had
// been clicked, and Edit details is where a better name goes
export async function new_playlist(song?: string) {
    const name = await next_playlist_name()

    await bridge().create_playlist(name)
    // started from a track: the point was to put that track somewhere new
    if (song) await bridge().add_to_playlist(name, song)

    await sync_playlists()
    open_playlist(name)
}

export async function rename_playlist(name: string, renamed: string) {
    const trimmed = renamed.trim()
    if (!trimmed || trimmed === name) return

    await bridge().rename_playlist(name, trimmed)
    await sync_playlists()

    move_pin(name, trimmed)

    // the open view is keyed by name, so it follows the rename
    const { view, selection } = ui.get()
    if (view === 'playlist' && selection === name) ui.set({ selection: trimmed })
}

export async function delete_playlist(name: string) {
    await bridge().delete_playlist(name)
    await sync_playlists()

    move_pin(name, null)

    const { view, selection } = ui.get()
    if (view === 'playlist' && selection === name) open_view('library')
}

export const has_cover = (name: string) => !!library.get().playlist_covers[name]

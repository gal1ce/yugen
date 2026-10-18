import { bridge } from '../lib/bridge'
import { KEYBINDS, UNBOUND, keybind_key, read_keybinds, type Bind } from '../lib/keys'
import { ui } from './ui'

/*
 * The shortcuts live in settings.json next to the playlists. A row that is back
 * to its default is a row taken out of the file, so a later change of heart
 * about the default reaches whoever never picked a key of their own.
 */
export async function sync_keybinds() {
    try {
        ui.set({ keybinds: read_keybinds(await bridge().get_all_keybinds()) })
    } catch {
        // the defaults are already in state; a settings.json that cannot be
        // read only costs the shortcuts someone picked
    }
}

export function change_keybinds(next: Record<Bind, string>) {
    const before = ui.get().keybinds
    ui.set({ keybinds: next })

    void (async () => {
        for (const bind of KEYBINDS) {
            const combo = next[bind.id]
            if (combo === before[bind.id]) continue

            try {
                if (combo === bind.fallback) await bridge().remove_keybind(keybind_key(bind.id))
                else await bridge().set_keybind(keybind_key(bind.id), combo || UNBOUND)
            } catch {
                // it works for this run, it just will not be there next time
            }
        }
    })()
}

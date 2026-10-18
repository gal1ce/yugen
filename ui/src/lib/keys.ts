/*
 * Keyboard shortcuts.
 *
 * The table below is the whole feature: a row here is a row in the dialog, an
 * entry in the lookup the window handler reads, and a line in what is saved -
 * adding a shortcut is adding a row and a case, and nothing else.
 *
 * A binding is stored as its modifiers and its key joined with +, and the key
 * part is e.code rather than e.key: the physical key, so a shortcut set on one
 * layout stays under the same finger on another, and so Shift+1 does not have
 * to be spelled Shift+!.
 *
 * Enter and Escape are deliberately not in here. They are not shortcuts but the
 * two answers every dialog in the app takes - confirm and dismiss - and letting
 * them be rebound would leave windows nothing to be closed with.
 */
export type Bind =
    | 'play_pause'
    | 'seek_forward'
    | 'seek_back'
    | 'next_track'
    | 'prev_track'
    | 'volume_up'
    | 'volume_down'
    | 'toggle_mute'
    | 'toggle_like'
    | 'toggle_shuffle'
    | 'toggle_loop'
    | 'focus_search'

// needs_track: what has nothing to act on until something is cued. volume,
// mute, shuffle, loop and the search are settings, or a way in, and stand on
// their own
export const KEYBINDS: { id: Bind; label: string; fallback: string; needs_track: boolean }[] = [
    { id: 'play_pause', label: 'Play / pause', fallback: 'Space', needs_track: true },
    { id: 'seek_forward', label: 'Forward 10 seconds', fallback: 'ArrowRight', needs_track: true },
    { id: 'seek_back', label: 'Back 10 seconds', fallback: 'ArrowLeft', needs_track: true },
    { id: 'next_track', label: 'Next track', fallback: 'Ctrl+ArrowRight', needs_track: true },
    { id: 'prev_track', label: 'Previous track', fallback: 'Ctrl+ArrowLeft', needs_track: true },
    { id: 'volume_up', label: 'Volume up', fallback: 'ArrowUp', needs_track: false },
    { id: 'volume_down', label: 'Volume down', fallback: 'ArrowDown', needs_track: false },
    { id: 'toggle_mute', label: 'Mute / unmute', fallback: 'KeyM', needs_track: false },
    { id: 'toggle_like', label: 'Like the playing track', fallback: 'KeyL', needs_track: true },
    { id: 'toggle_shuffle', label: 'Cycle shuffle', fallback: 'KeyS', needs_track: false },
    { id: 'toggle_loop', label: 'Toggle repeat', fallback: 'KeyR', needs_track: false },
    { id: 'focus_search', label: 'Search', fallback: 'Shift+KeyK', needs_track: false },
]

export const VOLUME_STEP = 0.05

// held down, these are half a shortcut - the row keeps listening for the rest
export const MODIFIER_CODES = [
    'ControlLeft',
    'ControlRight',
    'AltLeft',
    'AltRight',
    'ShiftLeft',
    'ShiftRight',
    'MetaLeft',
    'MetaRight',
]

// what a key is called on the cap, where e.code's own name would be noise
export const KEY_LABELS: Record<string, string> = {
    Space: 'Space',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Backspace: 'Backspace',
    Delete: 'Delete',
    Tab: 'Tab',
    Home: 'Home',
    End: 'End',
    PageUp: 'Page up',
    PageDown: 'Page down',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
    Minus: '-',
    Equal: '=',
    Backquote: '`',
}

export function combo_of(e: KeyboardEvent): string {
    const parts: string[] = []

    if (e.ctrlKey) parts.push('Ctrl')
    if (e.altKey) parts.push('Alt')
    if (e.shiftKey) parts.push('Shift')
    if (e.metaKey) parts.push('Super')

    parts.push(e.code)

    return parts.join('+')
}

export function key_label(combo: string): string {
    if (!combo) return 'Unbound'

    const parts = combo.split('+')
    const code = parts.pop() ?? ''

    const name =
        KEY_LABELS[code] ??
        (code.startsWith('Key')
            ? code.slice(3)
            : code.startsWith('Digit')
              ? code.slice(5)
              : code.startsWith('Numpad')
                ? `Num ${code.slice(6)}`
                : code)

    return [...parts, name].join(' + ')
}

export const default_keybinds = (): Record<Bind, string> =>
    Object.fromEntries(KEYBINDS.map((bind) => [bind.id, bind.fallback])) as Record<Bind, string>

/*
 * The shortcuts sit in settings.json next to the playlists rather than in
 * localStorage, so they are one flat string per action under a prefix of their
 * own - the file is shared with whatever else ends up being a setting.
 *
 * Two of the three states an action can be in are a key and no key; the third
 * is never having been touched, which is the row simply not being in the file.
 * Settings::set refuses an empty value, so "cleared on purpose" cannot be
 * written as "" and is spelled out instead - no combination ever reads that
 * way, since a key is always a code like KeyU.
 */
export const KEYBIND_PREFIX = 'keybind.'
export const UNBOUND = 'unbound'

export const keybind_key = (id: Bind) => KEYBIND_PREFIX + id

export function read_keybinds(settings: string): Record<Bind, string> {
    const binds = default_keybinds()

    try {
        // an empty file comes back as an empty string rather than as {}
        const saved = JSON.parse(settings || '{}')
        if (!saved || typeof saved !== 'object') return binds

        for (const bind of KEYBINDS) {
            const value = saved[keybind_key(bind.id)]
            if (typeof value !== 'string' || !value) continue

            binds[bind.id] = value === UNBOUND ? '' : value
        }

        return binds
    } catch {
        return binds
    }
}

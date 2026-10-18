import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Download, LoaderCircle, PanelLeftOpen, PanelRightOpen, Monitor, Moon, Search, Settings, Sun, User, X } from '../ui/icons'
import { useDismiss } from '../../hooks/dismiss'
import { cn } from '../../lib/cn'
import { key_label } from '../../lib/keys'
import { save_pref } from '../../lib/prefs'
import { SOURCES, type SearchResult } from '../../lib/search'
import { useStore } from '../../lib/store'
import { library } from '../../state/library'
import { PAGE, artwork, clear_search, download, owns, search, switch_source } from '../../state/search'
import { open_page, open_view, set_pref, ui } from '../../state/ui'
import { Button, IconButton } from '../ui/Button'
import { Cover } from '../ui/Cover'
import { Segmented } from '../ui/Controls'
import { MenuItem, MenuPanel, MenuSep } from '../ui/Menu'
import { tip } from '../../lib/tip'

// the mark: one swell of a wave, the shape the sound is drawn in
export function Brand() {
    return (
        <button type='button' onClick={() => open_view('library')} className='group flex items-center gap-2 rounded-lg pr-2'>
            <svg viewBox='0 0 32 32' className='size-7 text-accent transition-transform duration-500 ease-spring group-hover:scale-110' aria-hidden>
                <rect width='32' height='32' rx='9' fill='currentColor' opacity='0.16' />
                <path d='M5 17c2.6 0 3.4-7 6-7s3.4 12 6 12 3.4-9 6-9 2.6 4 4 4' fill='none' stroke='currentColor' strokeWidth='2.6' strokeLinecap='round' strokeLinejoin='round' />
            </svg>
            <span className='font-display text-[1.25rem] font-bold tracking-tight'>yugen</span>
        </button>
    )
}

function ResultRow({ result }: { result: SearchResult }) {
    const source = useStore(ui, (s) => s.source)
    const busy = useStore(ui, (s) => s.downloading.includes(result.ref))
    useStore(library, (s) => s.songs)
    const here = owns(result)
    const art = artwork(result, source)

    return (
        <button
            type='button'
            aria-disabled={busy || here}
            onClick={() => !busy && !here && void download(result)}
            className={cn('group flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors', here ? 'opacity-55' : 'hover:bg-surface-3')}
        >
            {art ? <img src={art} alt='' loading='lazy' className='h-10 w-16 shrink-0 rounded-lg bg-surface-3 object-cover' /> : <Cover className='h-10 w-16' />}
            <div className='min-w-0 flex-1'>
                <p className='truncate text-[0.82rem]'>{result.title}</p>
                <p className='text-xs text-muted'>{here ? 'In your library' : busy ? 'Downloading…' : source === 'yt' ? 'YouTube' : 'SoundCloud'}</p>
            </div>
            <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', here ? 'text-accent' : 'text-muted group-hover:bg-accent group-hover:text-accent-fg')}>
                {here ? <Check size={15} /> : busy ? <LoaderCircle size={15} className='animate-spin' /> : <Download size={15} />}
            </span>
        </button>
    )
}

/*
 * The search. It shells out to yt-dlp, so it goes out on enter rather than on
 * every key, and both sources go out on the same enter - see state/search.
 */
function SearchBox() {
    const query = useStore(ui, (s) => s.query)
    const open = useStore(ui, (s) => s.search_open)
    const source = useStore(ui, (s) => s.source)
    const results = useStore(ui, (s) => s.results)
    const searching = useStore(ui, (s) => s.searching)
    const shown = useStore(ui, (s) => s.shown)
    const shortcut = useStore(ui, (s) => s.keybinds.focus_search)
    const input = useRef<HTMLInputElement>(null)
    const close = useCallback(() => ui.set({ search_open: false }), [])

    useDismiss(open, close, { scroll: false })

    // the shortcut opens the box and puts the caret in it
    useEffect(() => {
        if (open) input.current?.focus()
    }, [open])

    return (
        <div className='relative w-full max-w-xl' onClick={(e) => e.stopPropagation()}>
            <label
                className={cn(
                    'flex h-10 w-full items-center rounded-2xl border bg-surface-2 transition-colors',
                    open ? 'border-accent/30 bg-surface-3' : 'border-line hover:border-line-strong',
                )}
            >
                {searching ? <LoaderCircle size={16} className='ml-4 shrink-0 animate-spin text-muted' /> : <Search size={16} className='ml-4 shrink-0 text-muted' />}
                <input
                    ref={input}
                    data-search
                    value={query}
                    placeholder='Search a song to download ♪(´▽｀)'
                    aria-label='Search YouTube and SoundCloud'
                    onChange={(e) => ui.set({ query: e.currentTarget.value })}
                    onFocus={() => ui.set({ search_open: true })}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') void search()
                        if (e.key === 'Escape') {
                            ui.set({ search_open: false })
                            e.currentTarget.blur()
                        }
                    }}
                    className='h-full w-full min-w-0 bg-transparent px-3 text-[0.82rem] text-fg outline-none placeholder:text-muted'
                />
                {query ? (
                    <button type='button' {...tip('Clear')} onClick={clear_search} className='mr-2 rounded-lg p-1.5 text-muted transition-colors hover:bg-surface hover:text-fg'>
                        <X size={14} />
                    </button>
                ) : (
                    shortcut && <kbd className='mr-3 hidden rounded-md border border-line px-1.5 py-0.5 font-sans text-[10px] whitespace-nowrap text-muted sm:block'>{key_label(shortcut)}</kbd>
                )}
            </label>

            {open && (
                <div className='edge absolute inset-x-0 top-full z-50 mt-2 animate-pop-in rounded-2xl bg-surface-2 p-2 shadow-soft'>
                    <div className='flex items-center justify-between px-1 pb-2'>
                        <Segmented value={source} options={SOURCES} on_change={switch_source} />
                        {results.length > 0 && <span className='pr-1 text-xs text-muted'>{results.length} results</span>}
                    </div>

                    <div className='max-h-[60vh] overflow-y-auto'>
                        {searching &&
                            Array.from({ length: 5 }, (_, i) => (
                                <div key={i} className='flex items-center gap-3 px-2.5 py-2' aria-hidden>
                                    <div className='skeleton h-10 w-16 rounded-lg' />
                                    <div className='flex-1'>
                                        <div className='skeleton h-3 w-3/5 rounded' />
                                        <div className='skeleton mt-1.5 h-2.5 w-1/5 rounded' />
                                    </div>
                                </div>
                            ))}

                        {!searching && !results.length && (
                            <p className='px-3 py-6 text-center text-xs text-muted'>
                                {query.trim() ? 'Nothing found. Press enter to search again.' : 'Type something and press enter.'}
                            </p>
                        )}

                        {!searching && results.slice(0, shown).map((result) => <ResultRow key={result.ref} result={result} />)}

                        {!searching && results.length > shown && (
                            <div className='flex justify-center pt-2 pb-1'>
                                <Button variant='ghost' size='sm' onClick={() => ui.set({ shown: shown + PAGE })}>
                                    Load more · {results.length - shown} left
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

const THEME_OPTIONS = [
    { id: 'system' as const, label: <Monitor size={14} />, hint: 'System' },
    { id: 'light' as const, label: <Sun size={14} />, hint: 'Light' },
    { id: 'dark' as const, label: <Moon size={14} />, hint: 'Dark' },
]

function ProfileMenu() {
    const [open, set_open] = useState(false)
    const username = useStore(library, (s) => s.username)
    const pic = useStore(library, (s) => s.profile_pic)
    const theme = useStore(ui, (s) => s.theme)
    const close = useCallback(() => set_open(false), [])

    useDismiss(open, close)

    return (
        <div className='relative' onClick={(e) => e.stopPropagation()}>
            <button
                type='button'
                {...tip(username ? `Hello, ${username}` : 'Profile')}
                onClick={() => set_open(!open)}
                className={cn('rounded-full ring-2 transition-[box-shadow,scale] active:scale-95', open ? 'ring-accent' : 'ring-transparent hover:ring-line-strong')}
            >
                <Cover data={pic} size='sm' round className='size-9' icon={16} />
            </button>

            {open && (
                <MenuPanel className='absolute top-full right-0 mt-2 w-56'>
                    <div className='flex items-center gap-3 px-2.5 py-2'>
                        <Cover data={pic} size='sm' round className='size-9' icon={16} />
                        <div className='min-w-0'>
                            <p className='truncate text-sm font-medium'>{username || 'Unnamed'}</p>
                            <p className='text-xs text-muted'>Kept on this device</p>
                        </div>
                    </div>
                    <MenuSep />
                    <MenuItem icon={<User size={15} />} onClick={() => (close(), open_page('profile'))}>
                        Profile
                    </MenuItem>
                    <MenuItem icon={<Settings size={15} />} onClick={() => (close(), open_page('settings'))}>
                        Settings
                    </MenuItem>
                    <MenuSep />
                    <div className='flex items-center justify-between px-2.5 py-1.5'>
                        <span className='text-[0.8rem]'>Theme</span>
                        <Segmented
                            value={theme}
                            options={THEME_OPTIONS}
                            on_change={(next) => {
                                ui.set({ theme: next })
                                save_pref('theme', next)
                            }}
                            className='p-0.5'
                        />
                    </div>
                </MenuPanel>
            )}
        </div>
    )
}

// a hidden panel comes back from here, where it cannot cover anything
function PanelToggle({ side }: { side: 'sidebar' | 'panel' }) {
    const hidden = useStore(ui, (s) => (side === 'sidebar' ? s.sidebar_hidden : s.panel_hidden))
    if (!hidden) return null

    return side === 'sidebar' ? (
        <IconButton size='sm' {...tip('Show sidebar')} onClick={() => set_pref('sidebar_hidden', false)}>
            <PanelLeftOpen size={16} />
        </IconButton>
    ) : (
        <IconButton size='sm' {...tip('Show panel')} onClick={() => set_pref('panel_hidden', false, 'rail_hidden')}>
            <PanelRightOpen size={16} />
        </IconButton>
    )
}

export function TopBar() {
    return (
        <header className='relative z-30 flex h-16 shrink-0 items-center gap-4 px-5'>
            <div className='flex w-60 shrink-0 items-center gap-1'>
                <Brand />
                <PanelToggle side='sidebar' />
            </div>
            <div className='flex min-w-0 flex-1 justify-center'>
                <SearchBox />
            </div>
            <div className='flex w-60 shrink-0 items-center justify-end gap-2'>
                <PanelToggle side='panel' />
                <ProfileMenu />
            </div>
        </header>
    )
}

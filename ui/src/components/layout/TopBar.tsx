import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Check, Download, LoaderCircle, PanelLeftClose, PanelLeftOpen, PanelRightOpen, Search, Settings, User, X } from '../ui/icons'
import { useDismiss } from '../../hooks/dismiss'
import { cn } from '../../lib/cn'
import { key_label } from '../../lib/keys'
import { SOURCES, type SearchResult, type Source } from '../../lib/search'
import { useStore } from '../../lib/store'
import { library } from '../../state/library'
import { PAGE, artwork, clear_search, download, owns, search, switch_source } from '../../state/search'
import { open_page, open_view, set_pref, ui } from '../../state/ui'
import { Button, IconButton } from '../ui/Button'
import { Cover } from '../ui/Cover'
import { Segmented } from '../ui/Controls'
import { MenuItem, MenuPanel, MenuSep } from '../ui/Menu'
import { Scroll } from '../ui/Scroll'
import { QuickLook } from './Look'
import { GlassBar } from './GlassBar'
import { spring } from '../../lib/motion'
import { tip } from '../../lib/tip'
import { Spin } from '../ui/Spin'

// the mark: one swell of a wave, the shape the sound is drawn in, beside the
// name set in the serif of the liner notes
export function Brand() {
    return (
        <button type='button' onClick={() => open_view('library')} className='flex h-9 items-center gap-2 rounded-lg px-2 text-fg'>
            <svg viewBox='0 0 32 32' className='size-5 text-accent' aria-hidden>
                <path d='M3 17c2.8 0 3.6-8 6.5-8s3.6 14 6.5 14 3.6-10 6.5-10 2.8 4 6.5 4' fill='none' stroke='currentColor' strokeWidth='2.6' strokeLinecap='round' strokeLinejoin='round' />
            </svg>
            <span className='font-serif text-[1.25rem] leading-none font-medium'>yugen</span>
        </button>
    )
}

function ResultRow({ result, source }: { result: SearchResult; source: Source }) {
    const busy = useStore(ui, (s) => s.downloading.includes(result.ref))
    useStore(library, (s) => s.songs)
    const here = owns(result)
    const art = artwork(result, source)

    return (
        <button
            type='button'
            aria-disabled={busy || here}
            disabled={here}
            onClick={() => !busy && !here && void download(result, source)}
            className={cn('group flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors', here ? 'opacity-55' : 'hover:bg-surface-3')}
        >
            {art ? <img src={art} alt='' loading='lazy' className='h-10 w-16 shrink-0 rounded-md bg-surface-3 object-cover' /> : <Cover className='h-10 w-16' />}
            <div className='min-w-0 flex-1'>
                <p className='truncate text-[0.875rem]'>{result.title}</p>
                <p className='text-[0.75rem] text-muted'>{here ? 'In your library' : busy ? 'Downloading' : source === 'yt' ? 'YouTube' : 'SoundCloud'}</p>
            </div>
            <span className={cn('grid size-8 shrink-0 place-items-center rounded-md', here ? 'text-fg-2' : 'text-muted group-hover:bg-surface-2 group-hover:text-fg')}>
                {here ? <Check size={16} /> : busy ? <Spin><LoaderCircle size={16} /></Spin> : <Download size={16} />}
            </span>
        </button>
    )
}

// the results hang under the field: wider than it, right-aligned to it, glass
// when glass is on, and arriving the way every popover does
function Dropdown({ children }: { children: React.ReactNode }) {

    return (
        <motion.div
            role='menu'
            initial={{ opacity: 0, scale: 0.96, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={spring.smooth}
            className='float absolute inset-x-0 top-full z-50 mt-2 origin-top rounded-(--r-menu) p-1.5'
        >
            {children}
        </motion.div>
    )
}

function Skeleton({ rows = 5 }: { rows?: number }) {
    return Array.from({ length: rows }, (_, i) => (
        <div key={i} className='flex items-center gap-3 px-2 py-1.5' aria-hidden>
            <div className='h-10 w-16 rounded-md bg-surface-3' />
            <div className='flex-1'>
                <div className='h-3 w-3/5 rounded-sm bg-surface-3' />
                <div className='mt-2 h-2.5 w-1/5 rounded-sm bg-surface-3' />
            </div>
        </div>
    ))
}

/*
 * The search. It shells out to yt-dlp, so it goes out on enter rather than on
 * every key, and both sources go out on the same enter - see state/search.
 * Inline (a phone's search tab) the results are the page under the field
 * rather than a dropdown over it.
 */
export function SearchBox({ inline = false }: { inline?: boolean }) {
    const query = useStore(ui, (s) => s.query)
    const open = useStore(ui, (s) => s.search_open)
    const source = useStore(ui, (s) => s.source)
    const shown = useStore(ui, (s) => s.shown)
    const shortcut = useStore(ui, (s) => s.keybinds.focus_search)
    const mode = useStore(ui, (s) => s.search_mode)
    const found = useStore(ui, (s) => s.found)
    const busy = useStore(ui, (s) => s.busy)
    const working = busy.length > 0
    const results = found[source]
    const loading = busy.includes(source)
    const input = useRef<HTMLInputElement>(null)
    const close = useCallback(() => ui.set({ search_open: false }), [])

    useDismiss(open && !inline, close, { scroll: false })

    // the shortcut opens the box and puts the caret in it; the search tab is
    // opened to type into
    useEffect(() => {
        if (open || inline) input.current?.focus()
    }, [open, inline])

    const listing = (
        <>
            {/* the two sources as tabs over one list, the way master had
                it; each tab says whether its answer is in, and how big */}
            <div className='flex items-center justify-between px-1 pb-2'>
                <Segmented
                    value={source}
                    on_change={switch_source}
                    options={SOURCES.map((option) => ({
                        id: option.id,
                        label: (
                            <>
                                {option.label}
                                {busy.includes(option.id) ? (
                                    <Spin>
                                        <LoaderCircle size={12} className='text-muted' />
                                    </Spin>
                                ) : (
                                    found[option.id].length > 0 && <span className='font-mono text-[0.6875rem] text-muted'>{found[option.id].length}</span>
                                )}
                            </>
                        ),
                    }))}
                />
            </div>

            <Scroll className={inline ? '' : 'max-h-[66vh]'}>
                {loading && !results.length && <Skeleton />}

                {!loading && !results.length && (
                    <p className='px-3 py-6 text-center text-[0.8125rem] text-muted'>
                        {query.trim() ? 'Nothing found. Press enter to search again' : mode === 'parallel' ? 'Type a title and press enter. YouTube and SoundCloud are asked at once' : 'Type a title and press enter'}
                    </p>
                )}

                {results.slice(0, shown).map((result) => (
                    <ResultRow key={result.ref} result={result} source={source} />
                ))}

                {results.length > shown && (
                    <div className='flex justify-center pt-2 pb-1'>
                        <Button variant='ghost' size='sm' onClick={() => ui.set({ shown: shown + PAGE })}>
                            Show {Math.min(PAGE, results.length - shown)} more
                        </Button>
                    </div>
                )}
            </Scroll>
        </>
    )

    return (
        <div className='relative w-full' onClick={(e) => e.stopPropagation()}>
            <label
                className={cn(
                    'search-field relative flex h-10 w-full items-center rounded-(--r-search)',
                )}
                data-open={open ? '' : undefined}
            >
                {working ? <span className='ml-3 shrink-0 text-muted'><Spin><LoaderCircle size={16} /></Spin></span> : <Search size={16} className='ml-3 shrink-0 text-muted' />}
                <input
                    ref={input}
                    data-search
                    value={query}
                    placeholder='Search YouTube and SoundCloud'
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
                    className='h-full w-full min-w-0 bg-transparent px-2.5 text-[0.875rem] text-fg outline-none placeholder:text-muted'
                />
                {query ? (
                    <button type='button' {...tip('Clear')} onClick={clear_search} className='mr-1 grid size-7 place-items-center rounded-[max(0.25rem,calc(var(--r-search)-0.375rem))] text-muted transition-colors hover:bg-surface-3 hover:text-fg'>
                        <X size={16} />
                    </button>
                ) : (
                    !inline && shortcut && <kbd className='keycap mr-2 hidden sm:inline-flex'>{key_label(shortcut)}</kbd>
                )}
            </label>

            {inline ? <div className='mt-4'>{listing}</div> : open && <Dropdown>{listing}</Dropdown>}
        </div>
    )
}

export function ProfileMenu() {
    const [open, set_open] = useState(false)
    const username = useStore(library, (s) => s.username)
    const pic = useStore(library, (s) => s.profile_pic)
    const close = useCallback(() => set_open(false), [])

    useDismiss(open, close)

    return (
        <div className='relative' onClick={(e) => e.stopPropagation()}>
            <button
                type='button'
                {...tip('Profile and settings')}
                onClick={() => set_open(!open)}
                className={cn('rounded-full outline-2 outline-offset-2 transition-[outline-color,scale] active:scale-95', open ? 'outline-line-strong' : 'outline-transparent hover:outline-line')}
            >
                <Cover data={pic} size='sm' round className='size-8' icon={16} />
            </button>

            {open && (
                <MenuPanel className='absolute top-full right-0 mt-2 w-64 origin-top-right'>
                    <div className='flex items-center gap-3 px-2 py-2'>
                        <Cover data={pic} size='sm' round className='size-9' icon={16} />
                        <div className='min-w-0'>
                            <p className='truncate text-[0.875rem] font-medium'>{username || 'Unnamed'}</p>
                            <p className='text-[0.75rem] text-muted'>Kept on this device</p>
                        </div>
                    </div>
                    <MenuSep />
                    <MenuItem icon={<User size={16} />} onClick={() => (close(), open_page('profile'))}>
                        Profile
                    </MenuItem>
                    <MenuItem icon={<Settings size={16} />} onClick={() => (close(), open_page('settings'))}>
                        Settings
                    </MenuItem>

                </MenuPanel>
            )}
        </div>
    )
}

// the side columns open and close from here, where nothing can cover them
export function PanelToggle({ side }: { side: 'sidebar' | 'panel' }) {
    const hidden = useStore(ui, (s) => (side === 'sidebar' ? s.sidebar_hidden : s.panel_hidden))

    return side === 'sidebar' ? (
        <IconButton size='sm' {...tip(hidden ? 'Show sidebar' : 'Hide sidebar')} aria-pressed={!hidden} onClick={() => set_pref('sidebar_hidden', !hidden)}>
            {hidden ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </IconButton>
    ) : (
        <IconButton size='sm' {...tip(hidden ? 'Show lyrics and queue' : 'Hide lyrics and queue')} aria-pressed={!hidden} onClick={() => set_pref('panel_hidden', !hidden, 'rail_hidden')}>
            <PanelRightOpen size={16} />
        </IconButton>
    )
}

/*
 * The bar at the top of the page: the search, and the way to the look, the
 * side column, the profile and settings. It belongs to the page rather than
 * to the window - it is the page's own head. At the top of a page the
 * controls stand on the page with nothing behind them. By default that is
 * all: the bar is the top of the page and scrolls away with it (App puts it
 * inside the page's scroller). Floating (a setting), it stays over the page
 * instead: once the page goes under, one bar comes up behind all of it and
 * tears away from the top edge (layout/GlassBar), and settles back into it at
 * the top. With the sidebar put away, the name and the way back to it come here.
 */
export function PageBar({ floating }: { floating: boolean }) {
    const sidebar_hidden = useStore(ui, (s) => s.sidebar_hidden)
    // the controls, which ride with the bar's body while it tears
    const row = useRef<HTMLDivElement>(null)

    return (
        <header className='page-bar absolute inset-x-0 top-0 z-30 h-16'>
            {floating && <GlassBar row={row} />}
            {/* the controls' column is never narrower than the controls, and the
                search keeps the middle of the page whatever the sides are doing */}
            <div ref={row} className={cn('relative grid h-full grid-cols-[minmax(0,1fr)_minmax(0,46rem)_minmax(max-content,1fr)] items-center gap-x-6 px-6', floating && 'will-change-transform')}>
                <div className='flex min-w-0 items-center'>
                    {sidebar_hidden && (
                        <div className='flex items-center gap-1'>
                            <PanelToggle side='sidebar' />
                            <Brand />
                        </div>
                    )}
                </div>
                <div className='min-w-0'>
                    <SearchBox />
                </div>
                <div className='flex min-w-0 justify-end'>
                    <div className='flex items-center gap-1'>
                        <QuickLook />
                        <PanelToggle side='panel' />
                        <ProfileMenu />
                    </div>
                </div>
            </div>
        </header>
    )
}

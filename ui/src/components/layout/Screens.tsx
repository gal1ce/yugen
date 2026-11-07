import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { useStore } from '../../lib/store'
import { boxes, go_back, LISTS, root_of, ROOTS, type Root } from '../../state/screens'
import { ui, type UiState } from '../../state/ui'
import { ActiveContext, WhereContext } from '../../state/where'
import { Nebula } from '../fx/Nebula'
import { GroupsPage } from '../pages/Groups'
import { HomePage } from '../pages/Home'
import { ListingPage } from '../pages/Listing'
import { LibraryActions, PhoneLibrary } from '../pages/PhoneLibrary'
import { ProfilePage } from '../pages/Profile'
import { SettingsPage } from '../pages/Settings'
import { Scroll } from '../ui/Scroll'
import { ChevronLeft } from '../ui/icons'
import { ProfileMenu, SearchBox } from './TopBar'
import { press } from '../../hooks/press'

/*
 * A phone's screens, the way a phone's own apps keep them: each tab is a
 * screen of its own that stays standing once it has been opened - its
 * scroll, its covers, its rows - and going to another tab only puts a
 * different one in front (iOS's tab bar controller, Android's back stack per
 * tab). The page used to be built again from nothing on every tab, its
 * cloud's GL program with it: 70-150ms between the tap and the new page on
 * the phone, measured. A playlist, an album, an artist, settings and the
 * profile are the stack over the tabs: built when opened, gone when left.
 *
 * A screen behind another is inert (no focus, no taps), not drawn
 * (content-visibility: hidden keeps its layout without painting it) and
 * moves nothing (ActiveContext: its painters stop).
 */

/*
 * The head of a screen. The tabs' screens carry their name in it, large, at
 * the left, and the profile at the right (Apple Music's large title); a
 * screen in the stack carries the way back instead, and its name only once
 * its own big title has gone up under the bar. Floating (a setting, on by
 * default), the bar comes away from the top edge as the page goes under
 * it, as far as the page has gone (--lift, written by the screen on
 * scroll): drawn in from the sides, rounded, dropped below the status bar,
 * the title shrinking into it. It follows the finger rather than a clock,
 * so it is the same with motion off.
 */
export function ScreenBar({ title, large = false, back = false, actions }: { title: string; large?: boolean; back?: boolean; actions?: ReactNode }) {
    const glass = useStore(ui, (s) => s.glass)
    const floating = useStore(ui, (s) => s.bar_float)

    return (
        <header
            data-floating={floating || undefined}
            data-back={back || undefined}
            className='phone-bar absolute inset-x-0 top-0 z-30 h-[calc(var(--safe-top)+4.25rem)] pt-[calc(var(--safe-top)+0.5rem)]'
        >
            {floating && <div aria-hidden className={cn('phone-bar-body pointer-events-none absolute', glass ? 'float thin lens-glass' : 'float')} />}
            <div className='phone-bar-row relative flex h-full items-center gap-1'>
                {back && (
                    <button type='button' aria-label='Back' {...press(go_back)} className='grid size-11 shrink-0 place-items-center rounded-full text-fg active:bg-surface-2'>
                        <ChevronLeft size={20} weight='bold' />
                    </button>
                )}
                {/* the profile's width on the left too, so a small title sits on the middle */}
                {!large && !back && <span className='size-11 shrink-0' />}
                {large ? (
                    <h1 className='phone-bar-title min-w-0 flex-1 truncate font-serif text-[2rem] leading-none font-medium'>{title}</h1>
                ) : (
                    <p className='phone-bar-late min-w-0 flex-1 truncate text-center text-[1rem] font-medium'>{title}</p>
                )}
                <div className='flex shrink-0 items-center'>
                    {actions}
                    {back ? <span className='size-11' /> : <ProfileMenu large />}
                </div>
            </div>
        </header>
    )
}

function SearchScreen() {
    return <SearchBox inline />
}

// a screen: its own scrolling box, its bar over the top of it, the page in it
function Screen({ id, active, bar, children }: { id: string; active: boolean; bar: ReactNode; children: ReactNode }) {
    const box = useRef<HTMLDivElement>(null)
    const floating = useStore(ui, (s) => s.bar_float)

    useEffect(() => {
        const node = box.current
        if (!node) return
        boxes.set(id, node)

        // how far the page has gone under the bar, as two shares written onto
        // the bar alone (a variable on the screen would have every row under
        // it styled again): --lift over the first 48px, the capsule and the
        // shrinking title; --late as the page's own big title goes under, the
        // stack's small one coming in. only a change is written
        let lift = -1
        let late = -1
        const on_scroll = () => {
            const bar = node.parentElement?.querySelector<HTMLElement>('.phone-bar')
            if (!bar) return
            const top = node.scrollTop
            const next_lift = Math.round(Math.min(Math.max(top / 48, 0), 1) * 100) / 100
            const next_late = Math.round(Math.min(Math.max((top - 120) / 48, 0), 1) * 100) / 100
            if (next_lift !== lift) bar.style.setProperty('--lift', String((lift = next_lift)))
            if (next_late !== late) bar.style.setProperty('--late', String((late = next_late)))
        }

        on_scroll()
        node.addEventListener('scroll', on_scroll, { passive: true })
        return () => {
            node.removeEventListener('scroll', on_scroll)
            if (boxes.get(id) === node) boxes.delete(id)
        }
    }, [id, floating])

    return (
        <section data-screen={id} inert={!active} aria-hidden={!active || undefined} className={cn('phone-screen absolute inset-0', !active && 'phone-screen-off')}>
            <ActiveContext.Provider value={active}>
                <Scroll box={box} className='relative h-full overflow-x-hidden'>
                    {/* floating, the bar is held at the top of the box while the page goes under it;
                        docked, it is the top of the page and goes up with it */}
                    {floating ? <div className='sticky top-0 z-30 h-0'>{bar}</div> : bar}
                    <div className='px-4 pt-[calc(var(--safe-top)+4.75rem)] pb-[calc(var(--safe-bottom)+10.5rem)]'>{children}</div>
                </Scroll>
            </ActiveContext.Provider>
        </section>
    )
}

function root_screen(root: Root) {
    switch (root) {
        case 'home':
            return { bar: <ScreenBar large title='Home' />, body: <HomePage /> }
        case 'search':
            return { bar: <ScreenBar large title='Search' />, body: <SearchScreen /> }
        case 'library':
            return { bar: <ScreenBar large title='Your library' actions={<LibraryActions />} />, body: <PhoneLibrary /> }
        case 'songs':
            return { bar: <ScreenBar title='All songs' />, body: <ListingPage /> }
        case 'liked':
            return { bar: <ScreenBar title='Liked songs' />, body: <ListingPage /> }
    }
}

// the screen over the tabs: what it is, and the name its bar carries
function stack_screen(s: Pick<UiState, 'page' | 'view' | 'selection'>) {
    if (s.page === 'settings') return { title: 'Settings', body: <SettingsPage /> }
    if (s.page === 'profile') return { title: 'Profile', body: <ProfilePage /> }
    if ((s.view === 'albums' || s.view === 'artists') && !s.selection) return { title: s.view === 'albums' ? 'Albums' : 'Artists', body: <GroupsPage /> }
    if (s.view === 'top') return { title: 'Most played', body: <ListingPage /> }
    if (s.view === 'played') return { title: 'History', body: <ListingPage /> }
    return { title: s.selection ?? '', body: <ListingPage /> }
}

// a tab's screen. memo, and its page built once: going to another tab
// renders the two screens whose turn it is, and only their frames - not
// every page kept behind them
const RootScreen = memo(function RootScreen({ id, active }: { id: Root; active: boolean }) {
    const { bar, body } = useMemo(() => {
        const { bar, body } = root_screen(id)
        const where = LISTS[id]
        return { bar, body: where ? <WhereContext.Provider value={where}>{body}</WhereContext.Provider> : body }
    }, [id])

    return (
        <Screen id={id} active={active} bar={bar}>
            {body}
        </Screen>
    )
})

export function PhonePage() {
    const at = useStore(ui, root_of)
    const page = useStore(ui, (s) => s.page)
    const view = useStore(ui, (s) => s.view)
    const selection = useStore(ui, (s) => s.selection)
    const nebula = useStore(ui, (s) => s.nebula)
    const [kept, set_kept] = useState<Root[]>(() => (at ? [at] : []))

    // a tab opened for the first time is kept from then on
    if (at && !kept.includes(at)) set_kept([...kept, at])

    // and the others are built ahead, one at a time while the phone is idle,
    // so even a tab's first opening is only a change of screen
    useEffect(() => {
        let id = 0
        const next = () => {
            id = requestIdleCallback(
                () =>
                    set_kept((now) => {
                        const missing = ROOTS.find((r) => !now.includes(r))
                        if (!missing) return now
                        next()
                        return [...now, missing]
                    }),
                { timeout: 4000 },
            )
        }
        const start = window.setTimeout(next, 1500)
        return () => {
            clearTimeout(start)
            cancelIdleCallback(id)
        }
    }, [])

    const stack = at ? null : stack_screen({ page, view, selection })
    const home = at === 'home'
    // the cloud is behind the library's own screens, never behind settings or
    // the profile (a page of switches is read, not looked at): one, kept, and
    // only shown where the setting puts it, so its program is built once
    const drawn = !page && (nebula === 'everywhere' || (nebula === 'home' && home))

    return (
        <div className='relative h-full min-h-0 overflow-hidden'>
            {nebula !== 'off' && <Nebula shown={drawn} strength={home ? 0.9 : 0.55} className='[mask-image:linear-gradient(#000,#000_25%,transparent_80%)]' />}
            {ROOTS.filter((r) => kept.includes(r)).map((r) => (
                <RootScreen key={r} id={r} active={at === r} />
            ))}
            {stack && (
                <Screen key={`${page}:${view}:${selection}`} id='stack' active bar={<ScreenBar back title={stack.title} />}>
                    {stack.body}
                </Screen>
            )}
        </div>
    )
}

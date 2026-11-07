import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { glide_to, useSmoothPrefs } from './hooks/glide'
import { art_accent } from './lib/accent'
import { init_frames } from './lib/frames'
import { cap_frames, fx, hold_painters } from './lib/fx'
import { watch_modality } from './lib/modality'
import { palette_of } from './lib/palette'
import { group_key, album_tag, artist_tag } from './lib/names'
import { useStore } from './lib/store'
import { thumb_of } from './lib/thumbs'
import { sync_keybinds } from './state/keys'
import { fetch_songs, library, load_favorites, sync_liked, sync_playlists, sync_profile, sync_view_covers } from './state/library'
import { adopt, mpris_command, player, restore, start_player } from './state/player'
import { start_plays } from './state/plays'
import { cover_input_ref, pick_image, track_cover_target } from './state/images'
import { column_css, COLUMNS, saved_playback, ui, type Column } from './state/ui'
import { CORNERS, PACES, REGIONS, SWATCHES, radius_css, save_pref, scale_factor } from './lib/prefs'
import { cn } from './lib/cn'
import { Scroll } from './components/ui/Scroll'
import { PlaylistPicker } from './components/dialogs/PlaylistPicker'
import { TipLayer } from './components/ui/Tip'
import { ContextMenu } from './components/layout/ContextMenu'
import { Keys } from './components/layout/Keys'
import { NowPanel } from './components/layout/NowPanel'
import { PlayerBar } from './components/layout/PlayerBar'
import { Sidebar } from './components/layout/Sidebar'
import { PageBar } from './components/layout/TopBar'
import { Dock, TabBar, Back } from './components/layout/Phone'
import { PhonePage } from './components/layout/Screens'
import { usePhone } from './hooks/phone'
import { set_scroll } from './state/bar'
import { Ambient } from './components/fx/Ambient'
import { usePalette } from './hooks/dark'
import { set_pace, spring } from './lib/motion'
import { Nebula } from './components/fx/Nebula'
import { CropDialog } from './components/dialogs/Crop'
import { PlaylistDialog, ProfileDialog, TitleDialog } from './components/dialogs/Edit'
import { TrackInfo } from './components/dialogs/TrackInfo'
import { GroupsPage } from './components/pages/Groups'
import { HomePage } from './components/pages/Home'
import { ListingPage } from './components/pages/Listing'
import { LyricsPage } from './components/pages/LyricsPage'
import { ProfilePage } from './components/pages/Profile'
import { SettingsPage } from './components/pages/Settings'

// everything settings > appearance changes lands on the root, so a change
// shows at once: the palette (system resolved to one), glass, density, size,
// motion, and the swatch when one replaces the palette's own accent
function useAppearance() {
    const palette = usePalette()
    const glass = useStore(ui, (s) => s.glass)
    const blur = useStore(ui, (s) => s.blur)
    const sizes = useStore(ui, (s) => s.sizes)
    const density = useStore(ui, (s) => s.density)
    const swatch = useStore(ui, (s) => s.swatch)
    const radii = useStore(ui, (s) => s.radii)
    const light_on = useStore(ui, (s) => s.aura_on)
    const light = useStore(ui, (s) => s.aura)
    const pace = useStore(ui, (s) => s.pace)
    const motion = useStore(fx, (s) => s.motion)

    // the cover's light: how strong, and so how much the panels let it through.
    // off is 0, which leaves every panel its palette's solid surface
    useEffect(() => {
        const root = document.documentElement

        if (light_on) root.dataset.light = ''
        else delete root.dataset.light
        root.style.setProperty('--light', light_on ? `${light / 100}` : '0')
    }, [light_on, light])

    // each part of the window's corners, and the panels' choice as the scale
    // for the small things inside them
    useEffect(() => {
        const root = document.documentElement
        for (const region of REGIONS) root.style.setProperty(region.css, radius_css(region, radii[region.id]))
        root.style.setProperty('--corner', `${CORNERS.find((o) => o.id === radii.panels)?.factor ?? 0.6}`)
    }, [radii])

    // one tempo for the window: css transitions and motion's springs alike
    useEffect(() => {
        document.documentElement.dataset.pace = pace
        set_pace(PACES.find((o) => o.id === pace)?.factor ?? 1)
    }, [pace])

    useEffect(() => {
        const root = document.documentElement

        root.dataset.theme = palette
        root.dataset.density = density
        root.dataset.motion = motion

        if (glass) root.dataset.glass = ''
        else delete root.dataset.glass

        if (blur) root.dataset.blur = ''
        else delete root.dataset.blur

        const fixed = SWATCHES.find((o) => o.id === swatch)
        if (fixed) {
            root.style.setProperty('--fixed-accent', fixed.dark)
            root.style.setProperty('--fixed-accent-light', fixed.light)
        } else {
            root.style.removeProperty('--fixed-accent')
            root.style.removeProperty('--fixed-accent-light')
        }
    }, [palette, glass, blur, density, swatch, motion])

    // text is every rem in the window; each other part is zoomed from there
    // to its own size, so a menu set large is large whatever text is set to
    useEffect(() => {
        const root = document.documentElement
        const text = scale_factor(sizes.text)

        root.style.setProperty('--ui-scale', `${text}`)
        for (const part of ['menus', 'lists', 'cards', 'controls'] as const) root.style.setProperty(`--z-${part}`, `${scale_factor(sizes[part]) / text}`)
    }, [sizes])

    // walking the window with tab draws the focus ring; nothing else does
    useEffect(() => watch_modality(), [])
}

/*
 * The cover of what is playing colours the app: one small canvas read of its
 * shrunk copy gives a hue and a saturation, and the accent in both themes is
 * mixed from them. No cover, or the setting off, and it is the fixed accent.
 */
function useAccent() {
    const current = useStore(player, (s) => s.current)
    const cover = useStore(library, (s) => (current ? s.covers[current] : undefined))
    const cover_accent = useStore(ui, (s) => s.cover_accent)

    useEffect(() => {
        const root = document.documentElement
        const clear = () => {
            for (const name of ['--art-accent', '--art-accent-light', '--art-tint-dark', '--art-tint-light']) root.style.removeProperty(name)
        }

        if (!cover) return clear()

        let live = true

        void thumb_of(cover)
            .then(art_accent)
            .then((accent) => {
                if (!live) return
                if (!accent) return clear()

                // held to a band where text on it stays legible and it never
                // turns neon: a grey cover gives a quiet accent, not a loud one
                const [h, s] = accent
                const sat = Math.min(Math.max(s, 35), 68)

                // the panels take the cover's hue whatever the accent setting
                // says: it is part of the light, not of the accent
                root.style.setProperty('--art-tint-dark', `hsl(${h} ${Math.round(sat * 0.75)}% 22%)`)
                root.style.setProperty('--art-tint-light', `hsl(${h} ${sat}% 86%)`)

                if (cover_accent) {
                    root.style.setProperty('--art-accent', `hsl(${h} ${sat}% 68%)`)
                    root.style.setProperty('--art-accent-light', `hsl(${h} ${sat}% 36%)`)
                } else {
                    root.style.removeProperty('--art-accent')
                    root.style.removeProperty('--art-accent-light')
                }
            })

        return () => {
            live = false
        }
    }, [cover, cover_accent])
}

// the handful of colours the moving light is made of - wanted whatever the
// accent setting says, since the lyrics page is painted with them either way
function useCoverPalette() {
    const current = useStore(player, (s) => s.current)
    const cover = useStore(library, (s) => (current ? s.covers[current] : undefined))

    useEffect(() => {
        if (!cover) return fx.set({ palette: [] })

        let live = true

        void thumb_of(cover)
            .then(palette_of)
            .then((palette) => live && fx.set({ palette }))

        return () => {
            live = false
        }
    }, [cover])
}

// everything the app reads off disk, once, on the way up
function useStartup() {
    useEffect(() => {
        void init_frames()
        const stop = start_player()
        const stop_plays = start_plays()

        void (async () => {
            const [scanned, lists] = await Promise.all([fetch_songs(), sync_playlists()])
            void sync_liked()
            void sync_profile()
            void sync_view_covers()
            void load_favorites()
            void sync_keybinds()

            void restore(scanned.names)

            // the listing that was open last time may not have survived: a
            // playlist that was deleted, an album whose files left the folder
            const saved = saved_playback
            const opened = saved?.selection
            if (!saved || !opened) return

            const tag = saved.view === 'artists' ? artist_tag : album_tag
            const alive =
                saved.view === 'playlist'
                    ? !!lists?.[opened]
                    : scanned.names.some((name) => group_key(tag(scanned.meta[name])) === opened)

            if (!alive) ui.set({ view: 'library', selection: null })
        })()

        // where the backend delivers whatever the desktop asked of mpris, and
        // where a phone's playlist says which track it has moved on to
        window.__yugen_mpris = mpris_command
        window.__yugen_now = (path: string) => adopt(path.slice(path.lastIndexOf('/') + 1))

        return () => {
            stop()
            stop_plays()
            delete window.__yugen_mpris
            delete window.__yugen_now
        }
    }, [])
}

/*
 * The handle in the gutter beside a side column: drag to size it, double-click
 * to put it back. The drag works in pixels and is held to the column's rem
 * bounds, then kept as a share of the frame - so pulling past a bound and back
 * moves the column again at once, rather than after a stretch of nothing.
 */
function Resizer({ column }: { column: Column }) {
    const key = column === 'sidebar' ? 'sidebar_w' : 'panel_w'
    const drag = useRef<{ from: number; width: number; frame: number; rem: number } | null>(null)

    const share_for = (px: number) => {
        const d = drag.current!
        const [min, max] = COLUMNS[column].rem
        const held = Math.min(Math.max(px, min * d.rem), max * d.rem)

        return (held / d.frame) * 100
    }

    return (
        <div
            role='separator'
            aria-orientation='vertical'
            aria-label={column === 'sidebar' ? 'Resize the sidebar' : 'Resize the panel'}
            className={cn('group absolute inset-y-0 z-20 w-2.5 cursor-col-resize touch-none', column === 'sidebar' ? '-right-2.5' : '-left-2.5')}
            onPointerDown={(e) => {
                const box = e.currentTarget.parentElement
                const grid = box?.parentElement
                if (!box || !grid || e.button !== 0) return

                e.preventDefault()
                e.currentTarget.setPointerCapture(e.pointerId)
                e.currentTarget.dataset.active = ''
                // the grid follows the pointer, not its own easing
                grid.dataset.resizing = ''

                const style = getComputedStyle(grid)
                drag.current = {
                    from: e.clientX,
                    width: box.getBoundingClientRect().width,
                    frame: grid.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
                    rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
                }
            }}
            onPointerMove={(e) => {
                const d = drag.current
                if (!d) return

                // the panel grows leftwards, so its delta is turned round
                const delta = e.clientX - d.from
                ui.set({ [key]: share_for(d.width + (column === 'sidebar' ? delta : -delta)) })
            }}
            onPointerUp={(e) => {
                if (!drag.current) return

                drag.current = null
                delete e.currentTarget.dataset.active
                delete e.currentTarget.parentElement?.parentElement?.dataset.resizing
                save_pref(COLUMNS[column].key, ui.get()[key])
            }}
            onPointerCancel={(e) => {
                drag.current = null
                delete e.currentTarget.dataset.active
                delete e.currentTarget.parentElement?.parentElement?.dataset.resizing
            }}
            onDoubleClick={() => {
                ui.set({ [key]: COLUMNS[column].share })
                save_pref(COLUMNS[column].key, COLUMNS[column].share)
            }}
        >
            <span className='absolute inset-y-12 left-1/2 w-0.5 -translate-x-1/2 rounded-full bg-line-strong opacity-0 transition-opacity group-hover:opacity-100 group-data-[active]:bg-fg-2 group-data-[active]:opacity-100' />
        </div>
    )
}

// below this the panel has nowhere to go, and it waits until there is room
const NARROW = '(max-width: 1180px)'

function useNarrow() {
    const [narrow, set_narrow] = useState(() => window.matchMedia(NARROW).matches)

    useEffect(() => {
        const query = window.matchMedia(NARROW)
        const on_change = () => set_narrow(query.matches)

        query.addEventListener('change', on_change)
        return () => query.removeEventListener('change', on_change)
    }, [])

    return narrow
}

// a desktop's page; a phone's screens are layout/Screens
function Page() {
    // the library and search pages are a phone's tabs; on a desktop the
    // sidebar and the bar are those, and the page under them is home
    const page = useStore(ui, (s) => (s.page === 'library' || s.page === 'search' ? null : s.page))
    const view = useStore(ui, (s) => s.view)
    const selection = useStore(ui, (s) => s.selection)
    const nebula = useStore(ui, (s) => s.nebula)
    const floating = useStore(ui, (s) => s.bar_float)
    const scroller = useRef<HTMLDivElement>(null)
    const frame = useRef<HTMLDivElement>(null)

    // a new page starts at its top, and a glide still under way on the last
    // one does not carry over
    useEffect(() => {
        if (scroller.current) glide_to(scroller.current, 0, { instant: true })
    }, [page, view, selection])

    // the bar fills in once anything has gone under it: a mark on the frame,
    // written straight into the dom, so a scroll is never a render
    useEffect(() => {
        const box = scroller.current
        const node = frame.current
        if (!box || !node) return

        const on_scroll = () => {
            const under = box.scrollTop > 4
            if (under) node.dataset.scrolled = ''
            else delete node.dataset.scrolled
            set_scroll(box.scrollTop)
        }

        on_scroll()
        box.addEventListener('scroll', on_scroll, { passive: true })
        return () => box.removeEventListener('scroll', on_scroll)
    }, [])

    const home = !page && view === 'library' && !selection

    const body =
        page === 'settings' ? (
            <SettingsPage />
        ) : page === 'profile' ? (
            <ProfilePage />
        ) : home ? (
            <HomePage />
        ) : (view === 'albums' || view === 'artists') && !selection ? (
            <GroupsPage />
        ) : (
            <ListingPage />
        )

    // the nebula is behind the library's own pages, never behind settings: a
    // page of switches is read, not looked at. where it is drawn is a setting
    const drawn = !page && (nebula === 'everywhere' || (nebula === 'home' && home))

    return (
        <div ref={frame} className='panel relative min-h-0 min-w-0 overflow-hidden rounded-(--r-panel)'>
            {/* behind the page's own content and inside its panel, under the
                cover's light rather than over it: the room stays the cover's,
                and the cloud is the page's. it fades out down the page, so the
                lists below are read on the panel alone */}
            {drawn && <Nebula strength={home ? 0.9 : 0.55} className='[mask-image:linear-gradient(#000,#000_25%,transparent_80%)]' />}
            <Scroll box={scroller} className='relative h-full'>
                {/* by default the bar is the top of the page and goes up with it;
                    floating, it stays over the page (a setting) */}
                {!floating && <PageBar floating={false} />}
                <motion.div
                    key={`${page}:${view}:${selection}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={spring.smooth}
                    className='mx-auto max-w-[1480px] px-8 pt-20 pb-16'
                >
                    {body}
                </motion.div>
            </Scroll>
            {floating && <PageBar floating />}
        </div>
    )
}

/*
 * The room the panels stand in: the palette's ground, the cover's light over
 * it, and a falloff towards the edges so the light gathers in the middle of
 * the window, the way light does in a room, and the panels' edges read
 * against the dark around them.
 */
function Room() {
    const light_on = useStore(ui, (s) => s.aura_on)

    return (
        <div aria-hidden className='pointer-events-none fixed inset-0 bg-bg'>
            {light_on && <Ambient className='absolute inset-0' />}
            <div className='absolute inset-0 bg-[radial-gradient(130%_110%_at_50%_40%,transparent_35%,color-mix(in_oklab,var(--bg)_65%,transparent))]' />
        </div>
    )
}

function Overlays() {
    const editing = useStore(ui, (s) => s.editing)
    const retitling = useStore(ui, (s) => s.retitling)
    const picking = useStore(ui, (s) => s.picking)
    const profile_edit = useStore(ui, (s) => s.profile_edit)
    const crop = useStore(ui, (s) => !!s.crop)
    const info_open = useStore(ui, (s) => s.info_open)
    const lyrics_open = useStore(ui, (s) => s.lyrics_open)

    // with the lyrics up nothing underneath is seen, so nothing underneath is drawn -
    // once it has finished sliding in
    useEffect(() => {
        if (!lyrics_open) return fx.set({ covered: false })

        const timer = setTimeout(() => fx.set({ covered: true }), 650)
        return () => clearTimeout(timer)
    }, [lyrics_open])

    return (
        <>
            <AnimatePresence>{lyrics_open && <LyricsPage key='lyrics' />}</AnimatePresence>
            {editing && <PlaylistDialog key={editing} name={editing} />}
            {retitling && <TitleDialog key={retitling} name={retitling} />}
            {picking && <PlaylistPicker key={picking} song={picking} />}
            {profile_edit && <ProfileDialog />}
            {info_open && <TrackInfo />}
            {/* over the dialog that asked for it */}
            {crop && <CropDialog />}
            <ContextMenu />
            <TipLayer />
        </>
    )
}

export default function App() {
    const sidebar_hidden = useStore(ui, (s) => s.sidebar_hidden)
    const panel_hidden = useStore(ui, (s) => s.panel_hidden)
    const sidebar_w = useStore(ui, (s) => s.sidebar_w)
    const panel_w = useStore(ui, (s) => s.panel_w)
    const narrow = useNarrow()
    const phone = usePhone()
    const panel_open = !panel_hidden && !narrow

    useAppearance()
    useAccent()
    useCoverPalette()
    useStartup()
    // every panel in the app scrolls, and all of them the same way
    useSmoothPrefs()

    // a phone draws everything that moves on its own together, thirty times a
    // second - a quarter of its 120 Hz, so the beat stays even - and none of
    // it while a finger is on the page or the page is still scrolling (lib/fx)
    useEffect(() => {
        cap_frames(phone ? 30 : 0)
        if (!phone) return

        let touching = false
        let rest = 0
        const settle = (after: number) => {
            clearTimeout(rest)
            rest = window.setTimeout(() => !touching && hold_painters(false), after)
        }
        const down = () => {
            touching = true
            clearTimeout(rest)
            hold_painters(true)
        }
        const up = () => {
            touching = false
            settle(400)
        }
        // a fling goes on after the finger is gone: each step of it puts the release off
        const scroll = () => {
            hold_painters(true)
            if (!touching) settle(250)
        }

        window.addEventListener('touchstart', down, { passive: true, capture: true })
        window.addEventListener('touchend', up, { passive: true, capture: true })
        window.addEventListener('touchcancel', up, { passive: true, capture: true })
        document.addEventListener('scroll', scroll, { passive: true, capture: true })

        return () => {
            clearTimeout(rest)
            hold_painters(false)
            window.removeEventListener('touchstart', down, { capture: true })
            window.removeEventListener('touchend', up, { capture: true })
            window.removeEventListener('touchcancel', up, { capture: true })
            document.removeEventListener('scroll', scroll, { capture: true })
        }
    }, [phone])

    // a phone's own tabs have no place on a desktop: leaving one for the other
    // (a window made wider) puts them away
    useEffect(() => {
        const { page } = ui.get()
        if (!phone && (page === 'library' || page === 'search')) ui.set({ page: null })
    }, [phone])

    // the cover picker the track menu opens - see state/images
    const cover_input = (
        <input
            ref={cover_input_ref}
            type='file'
            accept='image/png,image/jpeg'
            aria-hidden
            tabIndex={-1}
            className='hidden'
            onChange={(e) => void pick_image(e, { kind: 'track', name: track_cover_target() })}
        />
    )

    if (phone) {
        return (
            <MotionConfig reducedMotion='user'>
                <div className='relative h-full' onContextMenu={(e) => e.preventDefault()}>
                    <Room />
                    <PhonePage />
                    <Dock />
                    <TabBar />
                    <Back />
                    <Overlays />
                    {cover_input}
                </div>
            </MotionConfig>
        )
    }

    return (
        <MotionConfig reducedMotion='user'>
        <div className='relative flex h-full flex-col gap-2.5 p-2.5' onContextMenu={(e) => e.preventDefault()}>
            <Room />

            {/* the gutters are columns of their own, so a hidden side column takes
                its gutter with it and the page meets the window's edge cleanly */}
            <div
                className='relative grid min-h-0 flex-1 transition-[grid-template-columns] duration-300 ease-out data-[resizing]:transition-none'
                style={{
                    gridTemplateColumns: [
                        sidebar_hidden ? '0rem' : column_css('sidebar', sidebar_w),
                        sidebar_hidden ? '0rem' : '0.625rem',
                        'minmax(0, 1fr)',
                        panel_open ? '0.625rem' : '0rem',
                        panel_open ? column_css('panel', panel_w) : '0rem',
                    ].join(' '),
                }}
            >
                {/* each side column in a cell of its own, so its handle can stand
                    in the gutter beside it */}
                <div className='relative col-start-1 grid min-h-0 min-w-0'>
                    <Sidebar />
                    {!sidebar_hidden && <Resizer column='sidebar' />}
                </div>
                <div className='col-start-3 grid min-h-0 min-w-0'>
                    <Page />
                </div>
                <div className='relative col-start-5 grid min-h-0 min-w-0'>
                    <NowPanel open={panel_open} />
                    {panel_open && <Resizer column='panel' />}
                </div>
            </div>

            <PlayerBar />

            <Keys />
            <Overlays />

            {/* opened from the track menu, and deliberately not inside it - see
                state/images */}
            {cover_input}
        </div>
        </MotionConfig>
    )
}

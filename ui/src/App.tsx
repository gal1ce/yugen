import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { glide_to, useGlideScroll, useScrollQuiet } from './hooks/glide'
import { art_accent } from './lib/accent'
import { init_frames } from './lib/frames'
import { fx } from './lib/fx'
import { palette_of } from './lib/palette'
import { group_key, album_tag, artist_tag } from './lib/names'
import { useStore } from './lib/store'
import { thumb_of } from './lib/thumbs'
import { sync_keybinds } from './state/keys'
import { fetch_songs, library, load_favorites, sync_liked, sync_playlists, sync_profile, sync_view_covers } from './state/library'
import { mpris_command, player, restore, start_player } from './state/player'
import { cover_input_ref, pick_image, track_cover_target } from './state/images'
import { saved_playback, ui } from './state/ui'
import { TipLayer } from './components/ui/Tip'
import { ContextMenu } from './components/layout/ContextMenu'
import { Keys } from './components/layout/Keys'
import { NowPanel } from './components/layout/NowPanel'
import { PlayerBar } from './components/layout/PlayerBar'
import { Sidebar } from './components/layout/Sidebar'
import { TopBar } from './components/layout/TopBar'
import { Glyphs } from './components/fx/Glyphs'
import { CropDialog } from './components/dialogs/Crop'
import { PlaylistDialog, ProfileDialog } from './components/dialogs/Edit'
import { TrackInfo } from './components/dialogs/TrackInfo'
import { GroupsPage } from './components/pages/Groups'
import { HomePage } from './components/pages/Home'
import { ListingPage } from './components/pages/Listing'
import { LyricsPage } from './components/pages/LyricsPage'
import { ProfilePage } from './components/pages/Profile'
import { SettingsPage } from './components/pages/Settings'

// with no attribute the stylesheet falls back to prefers-color-scheme
function useTheme() {
    const theme = useStore(ui, (s) => s.theme)

    useEffect(() => {
        if (theme === 'system') delete document.documentElement.dataset.theme
        else document.documentElement.dataset.theme = theme
    }, [theme])
}

/*
 * The cover of what is playing colours the app: one small canvas read of its
 * shrunk copy gives a hue and a saturation, and the accent in both themes is
 * mixed from them. No cover, or the setting off, and it is yugen's own pink.
 */
function useAccent() {
    const current = useStore(player, (s) => s.current)
    const cover = useStore(library, (s) => (current ? s.covers[current] : undefined))
    const aura_on = useStore(ui, (s) => s.aura_on)
    const aura = useStore(ui, (s) => s.aura)

    useEffect(() => {
        document.documentElement.style.setProperty('--aura', aura_on ? `${aura / 100}` : '0')
    }, [aura_on, aura])

    useEffect(() => {
        const root = document.documentElement
        const clear = () => {
            root.style.removeProperty('--art-accent')
            root.style.removeProperty('--art-accent-light')
        }

        if (!cover || !aura_on) return clear()

        let live = true

        void thumb_of(cover)
            .then(art_accent)
            .then((accent) => {
                if (!live) return
                if (!accent) return clear()

                const [h, s] = accent
                root.style.setProperty('--art-accent', `hsl(${h} ${Math.max(s, 45)}% 72%)`)
                root.style.setProperty('--art-accent-light', `hsl(${h} ${Math.max(s, 45)}% 40%)`)
            })

        return () => {
            live = false
        }
    }, [cover, aura_on])
}

// the handful of colours the moving light is made of - wanted whatever the
// accent setting says, since the lyrics page is painted with them either way
function usePalette() {
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

        // where the backend delivers whatever the desktop asked of mpris
        window.__yugen_mpris = mpris_command

        return () => {
            stop()
            delete window.__yugen_mpris
        }
    }, [])
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

function Page() {
    const page = useStore(ui, (s) => s.page)
    const view = useStore(ui, (s) => s.view)
    const selection = useStore(ui, (s) => s.selection)
    const scroller = useRef<HTMLElement>(null)

    // a new page starts at its top
    useEffect(() => {
        // and a glide still under way on the last one does not carry over
        if (scroller.current) glide_to(scroller.current, 0, { instant: true })
    }, [page, view, selection])

    const body =
        page === 'settings' ? (
            <SettingsPage />
        ) : page === 'profile' ? (
            <ProfilePage />
        ) : view === 'library' && !selection ? (
            <HomePage />
        ) : (view === 'albums' || view === 'artists') && !selection ? (
            <GroupsPage />
        ) : (
            <ListingPage />
        )

    // the field is behind the library's own pages, not behind settings: a page
    // of switches is read, not looked at
    const field = !page

    return (
        <div className='relative min-h-0 min-w-0'>
            {/* only as tall as it shows: it fades out by two thirds of the way down,
                and every pixel of the canvas is uploaded on every frame */}
            {field && <Glyphs strength={0.75} fade className='bottom-auto h-[65%]' />}
            <main ref={scroller} className='relative h-full overflow-y-auto overscroll-contain rounded-2xl'>
                <motion.div
                    key={`${page}:${view}:${selection}`}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: [0.25, 1, 0.5, 1] }}
                    className='mx-auto max-w-[1480px] px-2 pt-2 pb-14'
                >
                    {body}
                </motion.div>
            </main>
        </div>
    )
}

function Overlays() {
    const editing = useStore(ui, (s) => s.editing)
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
    const narrow = useNarrow()
    const panel_open = !panel_hidden && !narrow

    useTheme()
    useAccent()
    usePalette()
    useStartup()
    // every panel in the app scrolls, and all of them the same way
    useGlideScroll()
    // and nothing in one catches the hover while it moves
    useScrollQuiet()

    return (
        <div className='relative flex h-full flex-col' onContextMenu={(e) => e.preventDefault()}>
            <div className='aura' aria-hidden />

            <TopBar />

            <div
                className='relative grid min-h-0 flex-1 gap-3 px-3 pb-3 transition-[grid-template-columns] duration-500 ease-soft'
                style={{
                    gridTemplateColumns: [
                        sidebar_hidden ? '0rem' : 'clamp(14rem, 16vw, 17rem)',
                        'minmax(0, 1fr)',
                        panel_open ? 'clamp(17rem, 21vw, 22rem)' : '0rem',
                    ].join(' '),
                }}
            >
                <Sidebar />
                <Page />
                <NowPanel open={panel_open} />

            </div>

            <PlayerBar />

            <Keys />
            <Overlays />

            {/* opened from the track menu, and deliberately not inside it - see
                state/images */}
            <input
                ref={cover_input_ref}
                type='file'
                accept='image/png,image/jpeg'
                aria-hidden
                tabIndex={-1}
                className='hidden'
                onChange={(e) => void pick_image(e, { kind: 'track', name: track_cover_target() })}
            />
        </div>
    )
}

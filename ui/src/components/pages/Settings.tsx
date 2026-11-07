import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, FolderOpen, Keyboard, LayoutGrid, MicVocal, Palette as PaletteIcon, RefreshCw, Search, Sparkles, Sun, Waveform } from '../ui/icons'
import { useDark, usePalette, useSystemDark } from '../../hooks/dark'
import { motion } from 'motion/react'
import { spring } from '../../lib/motion'
import { cn } from '../../lib/cn'
import { MOTIONS, fx, set_motion } from '../../lib/fx'
import { KEYBINDS, MODIFIER_CODES, combo_of, default_keybinds, key_label, type Bind } from '../../lib/keys'
import { BACKDROPS, CARD_STYLES, CARD_TONES, CORNERS, DENSITIES, FEELS, LIGHT_RANGE, LYRICS_SIZES, PACES, PALETTES, PLACES, RADII, REGIONS, SCALES, SCROLLINGS, SEARCH_MODES, SIZE_PARTS, SWATCHES, palette_of, save_pref, type Corners as CornerChoice, type Scale, type Palette, type Theme } from '../../lib/prefs'
import { useStore } from '../../lib/store'
import { change_keybinds } from '../../state/keys'
import { fetch_songs, library } from '../../state/library'
import { set_sharing } from '../../state/player'
import { common_radius, common_size, leave_page, set_all_radii, set_all_sizes, set_pref, set_radius, set_size, ui } from '../../state/ui'
import { tip } from '../../lib/tip'
import { Button } from '../ui/Button'
import { Range, Segmented, Switch } from '../ui/Controls'
import { glide_to } from '../../hooks/glide'
import { usePhone } from '../../hooks/phone'
import { useDismiss } from '../../hooks/dismiss'
import { MenuItem, MenuLabel, MenuPanel } from '../ui/Menu'
import { HoverGlass } from '../ui/HoverGlass'

/*
 * The settings page is one shape throughout, so it reads the same wherever
 * you are in it:
 * - a Group is a heading over a card;
 * - a Row is a line of that card: what it is (and a line on what it does) on
 *   the left, its control always on the right;
 * - a Sub hangs under the row it belongs to, a well pressed into the card,
 *   and fades when that row is off - so it is plain which option an option is of;
 * - a Block is something that needs the full width (the themes, the keys),
 *   its label above it.
 */
/*
 * On a phone the page is a phone's settings rather than the desktop's page
 * made narrow: a list of the sections, each opening as a page of its own with
 * a way back, and a choice shown as its value - pressed, its options come up
 * from the foot of the screen - rather than a row of buttons that cannot fit.
 * The groups and rows below are the same ones; this says which section is open.
 */
const PhonePages = createContext<{ phone: boolean; open: string | null }>({ phone: false, open: null })

function Group({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
    const { phone, open } = useContext(PhonePages)

    if (phone) {
        if (open !== id) return null

        return (
            <section data-section={id} className='mb-6'>
                {note && <p className='mb-3 px-1 text-[0.875rem] leading-snug text-muted'>{note}</p>}
                <div className='settings-card flow-root divide-y divide-line rounded-2xl bg-surface-2 px-4'>{children}</div>
            </section>
        )
    }

    return (
        <section id={`settings-${id}`} data-section={id} className='mb-10 scroll-mt-24'>
            <h2 className='text-[1.125rem] font-medium'>{title}</h2>
            {note && <p className='mt-1 text-[0.8125rem] text-muted'>{note}</p>}
            <div className='settings-card mt-3 flow-root divide-y divide-line rounded-(--r-menu) bg-surface-2 px-5 shadow-[inset_0_0_0_1px_var(--line)]'>{children}</div>
        </section>
    )
}

function Row({ title, hint, dimmed, children }: { title: ReactNode; hint?: ReactNode; dimmed?: boolean; children?: ReactNode }) {
    const { phone } = useContext(PhonePages)

    // a phone's row: its words on the left and its control - a switch, or a
    // choice shown as its value - at the right, a thumb's height
    if (phone) {
        return (
            <div className={cn('flex min-h-14 items-center gap-4 py-3 transition-opacity', dimmed && 'opacity-45')}>
                <div className='min-w-0 flex-1'>
                    <p className='text-[0.9375rem]'>{title}</p>
                    {hint && <p className='mt-0.5 text-[0.8125rem] leading-snug text-muted'>{hint}</p>}
                </div>
                <div className='flex shrink-0 items-center gap-2'>{children}</div>
            </div>
        )
    }

    return (
        // the words take the line and the control sits beside them while there
        // is room; in a narrow window a wide control goes under them instead of
        // crushing them into a word a line
        <div className={cn('flex min-h-15 flex-wrap items-center gap-x-8 gap-y-2.5 py-3 transition-opacity', dimmed && 'opacity-45')}>
            <div className='min-w-0 flex-[1_1_14rem]'>
                <p className='text-[0.875rem]'>{title}</p>
                {hint && <p className='mt-0.5 text-[0.8125rem] text-muted'>{hint}</p>}
            </div>
            <div className='ml-auto flex max-w-full items-center justify-end gap-3'>{children}</div>
        </div>
    )
}

/*
 * One of a few. On a desktop the choices side by side; on a phone the choice
 * made, and a press brings them all up as a sheet with the one picked ticked.
 */
function Pick<T extends string>({ value, options, on_change, title }: { value: T; options: { id: T; label: ReactNode; hint?: string }[]; on_change: (id: T) => void; title?: string }) {
    const { phone } = useContext(PhonePages)
    const [open, set_open] = useState(false)
    const close = useCallback(() => set_open(false), [])
    useDismiss(open, close)

    if (!phone) return <Segmented value={value} options={options} on_change={on_change} />

    const chosen = options.find((o) => o.id === value)

    return (
        <>
            <button type='button' onClick={() => set_open(true)} className='-mr-1 flex max-w-[11rem] items-center gap-1 rounded-lg py-1.5 pl-2 text-[0.9375rem] text-fg-2 active:bg-surface-3'>
                <span className='truncate'>{chosen?.label ?? 'Mixed'}</span>
                <ChevronRight size={16} className='shrink-0 text-muted' />
            </button>
            {open && (
                <MenuPanel onClick={close}>
                    {title && <MenuLabel>{title}</MenuLabel>}
                    {options.map((option) => (
                        <MenuItem key={option.id} checked={option.id === value} hint={option.hint} onClick={() => on_change(option.id)}>
                            {option.label}
                        </MenuItem>
                    ))}
                </MenuPanel>
            )}
        </>
    )
}

// the options of the row above: a well pressed into the group right under
// it, so they read as that row's own, and faded with it when it is off
function Sub({ off, children }: { off?: boolean; children: ReactNode }) {
    return (
        <div inert={off} className={cn('settings-sub mb-4 divide-y divide-line px-4 transition-opacity', off && 'opacity-40')}>
            {children}
        </div>
    )
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
    return (
        <div className='py-4'>
            <p className='text-[0.875rem]'>{title}</p>
            {hint && <p className='mt-0.5 text-[0.8125rem] text-muted'>{hint}</p>}
            <div className='mt-3 @container'>{children}</div>
        </div>
    )
}

// one theme as a small picture of itself: its ground, a panel on it, a line
// of text and its accent
function ThemeCard({ id, label, note, swatch, current, shown }: { id: Theme; label: string; note: string; swatch: [string, string, string]; current: Theme; shown: Palette }) {
    const on = current === id

    return (
        <button
            type='button'
            role='radio'
            aria-checked={on}
            onClick={() => set_pref('theme', id)}
            className={cn('relative rounded-(--r-menu) p-2 text-left transition-colors', on ? 'text-fg' : 'text-fg-2 hover:bg-surface-2')}
        >
            {on && <motion.span layoutId='theme-card' transition={spring.snappy} className='absolute inset-0 rounded-(--r-menu) bg-surface-2 shadow-[inset_0_0_0_1.5px_var(--accent)]' />}
            <span className='relative block h-16 overflow-hidden rounded-[max(0.125rem,calc(var(--r-menu)-0.5rem))] shadow-[inset_0_0_0_1px_rgb(128_128_128/0.25)]' style={{ background: swatch[0] }}>
                <span className='absolute top-2.5 bottom-0 left-2.5 w-3/5 rounded-tl-md' style={{ background: swatch[1] }} />
                <span className='absolute top-5 left-5 h-1.5 w-12 rounded-full opacity-60' style={{ background: swatch[2] }} />
                <span className='absolute top-9 left-5 h-1.5 w-8 rounded-full' style={{ background: swatch[2] }} />
            </span>
            <span className='relative mt-2 block text-[0.8125rem] font-medium'>{label}</span>
            <span className='relative block truncate text-[0.75rem] text-muted'>{id === 'system' ? `${note}, now ${PALETTES.find((p) => p.id === shown)?.label}` : note}</span>
        </button>
    )
}

function ThemePicker() {
    const theme = useStore(ui, (s) => s.theme)
    // what system would be, whatever is picked now
    const shown = palette_of('system', useSystemDark())
    const system = PALETTES.find((p) => p.id === shown)!

    return (
        // six abreast once the card is wide enough for them, three until then
        <div role='radiogroup' aria-label='Theme' className='-mx-2 grid grid-cols-3 gap-1 @5xl:grid-cols-6'>
            <ThemeCard id='system' label='System' note='Follows the desktop' swatch={system.swatch} current={theme} shown={shown} />
            {PALETTES.map((p) => (
                <ThemeCard key={p.id} id={p.id} label={p.label} note={p.note} swatch={p.swatch} current={theme} shown={shown} />
            ))}
        </div>
    )
}

// the accent when no cover gives one: the theme's own, or one of five inks
function Swatches() {
    const swatch = useStore(ui, (s) => s.swatch)
    const dark = useDark()
    const shown = usePalette()
    const own = PALETTES.find((p) => p.id === shown)!.swatch[2]
    const options = [{ id: 'theme' as const, label: 'Theme', dot: own }, ...SWATCHES.map((o) => ({ id: o.id, label: o.label, dot: dark ? o.dark : o.light }))]

    return (
        <div role='radiogroup' aria-label='Accent colour' className='flex items-center gap-1'>
            {options.map((option) => (
                <button
                    key={option.id}
                    type='button'
                    role='radio'
                    aria-checked={swatch === option.id}
                    {...tip(option.id === 'theme' ? 'The theme\'s own' : option.label)}
                    onClick={() => set_pref('swatch', option.id)}
                    className={cn('grid size-8 place-items-center rounded-full transition-[box-shadow]', swatch === option.id ? 'shadow-[inset_0_0_0_1.5px_var(--fg-2)]' : 'hover:shadow-[inset_0_0_0_1px_var(--line-strong)]')}
                >
                    <span className='size-5 rounded-full shadow-[inset_0_0_0_1px_rgb(128_128_128/0.3)]' style={{ background: option.dot }} />
                </button>
            ))}
        </div>
    )
}

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/*
 * While a row is listening every key belongs to it, which is why this runs in
 * capture and stops what it catches - that is also what keeps the shortcut
 * being pressed from firing, since the app's own key handler sits one phase
 * later on the same window.
 */
function KeybindEditor() {
    const binds = useStore(ui, (s) => s.keybinds)
    const [listening, set_listening] = useState<Bind | null>(null)
    // the row a key was just taken from, so the hint can say where it went
    const [taken, set_taken] = useState('')

    useEffect(() => {
        if (!listening) return

        const on_key = (e: KeyboardEvent) => {
            if (MODIFIER_CODES.includes(e.code)) return

            e.preventDefault()
            e.stopPropagation()

            if (e.code === 'Escape') return set_listening(null)

            // the one way to leave an action with no key at all
            if (e.code === 'Backspace' || e.code === 'Delete') {
                set_taken('')
                set_listening(null)
                return change_keybinds({ ...binds, [listening]: '' })
            }

            const combo = combo_of(e)
            const next = { ...binds, [listening]: combo }
            const clash = KEYBINDS.find((bind) => bind.id !== listening && binds[bind.id] === combo)

            // one key, one job: whoever held it loses it rather than both firing
            if (clash) next[clash.id] = ''

            set_taken(clash?.label ?? '')
            set_listening(null)
            change_keybinds(next)
        }

        window.addEventListener('keydown', on_key, true)
        return () => window.removeEventListener('keydown', on_key, true)
    }, [listening, binds])

    return (
        <>
            <div className='grid gap-x-8 sm:grid-cols-2'>
                {KEYBINDS.map((bind) => (
                    <div key={bind.id} className='flex h-11 items-center justify-between gap-3 border-b border-line last:border-0 sm:[&:nth-last-child(2):nth-child(odd)]:border-0'>
                        <span className='truncate text-[0.875rem]'>{bind.label}</span>
                        <button
                            type='button'
                            onClick={() => {
                                set_taken('')
                                set_listening(bind.id)
                            }}
                            className={cn(
                                'h-7 min-w-20 rounded-(--r-button) px-2.5 font-mono text-[0.75rem] transition-colors',
                                listening === bind.id
                                    ? 'bg-surface-3 text-fg shadow-[inset_0_0_0_1px_var(--accent)]'
                                    : binds[bind.id]
                                      ? 'bg-surface-2 text-fg-2 shadow-[inset_0_0_0_1px_var(--line-strong)] hover:text-fg'
                                      : 'text-muted shadow-[inset_0_0_0_1px_var(--line)] hover:text-fg',
                            )}
                        >
                            {listening === bind.id ? 'Press a key' : key_label(binds[bind.id])}
                        </button>
                    </div>
                ))}
            </div>
            <div className='flex items-center justify-between gap-4 pt-4'>
                <p className='text-[0.8125rem] text-muted'>
                    {listening
                        ? 'Press the keys. Backspace leaves it unbound, Escape keeps what it was.'
                        : taken
                          ? `Taken from ${taken}, which has no key now.`
                          : 'Click a shortcut to change it. None of them fire while you are typing in a field.'}
                </p>
                <Button variant='ghost' size='sm' onClick={() => change_keybinds(default_keybinds())}>
                    Reset to defaults
                </Button>
            </div>
        </>
    )
}

// the sections, in order, for the index beside them
const SECTIONS = [
    ['appearance', 'Appearance'],
    ['corners', 'Corners'],
    ['light', 'Light and glass'],
    ['motion', 'Motion'],
    ['lyrics', 'Lyrics'],
    ['search', 'Search'],
    ['suggestions', 'Suggestions'],
    ['sharing', 'Sharing'],
    ['library', 'Library'],
    ['keys', 'Shortcuts'],
] as const

// a section picked from the index is lit for a moment and the others step
// back - the answer to "which of these am I changing", also when it was
// already the one in front of you
let unlit = 0

function spotlight(target: HTMLElement) {
    const page = target.parentElement
    if (!page) return

    window.clearTimeout(unlit)
    page.querySelectorAll('[data-lit]').forEach((node) => node.removeAttribute('data-lit'))
    page.dataset.spot = ''
    target.dataset.lit = ''

    unlit = window.setTimeout(() => {
        delete page.dataset.spot
        delete target.dataset.lit
    }, 1600)
}

// the index down the left, the section in view marked as the page goes by
function Index() {
    const [here, set_here] = useState<string>(SECTIONS[0][0])

    useEffect(() => {
        const box = document.getElementById('settings-appearance')?.closest<HTMLElement>('.overflow-y-auto')
        if (!box) return

        const seen = new IntersectionObserver(
            (entries) => {
                const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
                if (top) set_here((top.target as HTMLElement).dataset.section ?? '')
            },
            { root: box, rootMargin: '-80px 0px -60% 0px' },
        )

        box.querySelectorAll('[data-section]').forEach((node) => seen.observe(node))
        return () => seen.disconnect()
    }, [])

    return (
        <nav className='relative hidden lg:block'>
            <HoverGlass className='rounded-[min(var(--r-control),1.25rem)]' />
            {SECTIONS.map(([id, label]) => (
                <button
                    key={id}
                    type='button'
                    data-hover
                    aria-current={here === id ? 'location' : undefined}
                    onClick={(e) => {
                        const target = document.getElementById(`settings-${id}`)
                        const box = e.currentTarget.closest<HTMLElement>('.overflow-y-auto')
                        if (!target || !box) return

                        // measured on screen, so no positioned box in between can throw it off
                        glide_to(box, target.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 72)
                        set_here(id)
                        spotlight(target)
                    }}
                    className={cn(
                        'relative flex h-8 w-full items-center rounded-[min(var(--r-control),1.25rem)] px-3 text-left text-[0.8125rem] transition-colors',
                        here === id ? 'needle bg-surface-2 text-fg' : 'text-muted hover:text-fg',
                    )}
                >
                    {label}
                </button>
            ))}
        </nav>
    )
}

/*
 * Corners: one choice for every part of the window, or - opened - one for
 * each part. Buttons, controls and the search bar can also be pills.
 */
function Corners() {
    const radii = useStore(ui, (s) => s.radii)
    const shared = common_radius(radii)
    const [open, set_open] = useState(() => !shared)

    return (
        <>
            <Row title='Every part' hint={shared ? 'The same corners everywhere' : 'The parts differ - set them all at once here, or one by one below'}>
                <Pick value={(shared ?? '') as CornerChoice} options={CORNERS} on_change={set_all_radii} />
            </Row>
            <Row title='Each part on its own' hint='Panels, buttons, controls, the search bar, menus and covers, each its own way'>
                <Switch on={open} label='Each part on its own' on_toggle={() => set_open(!open)} />
            </Row>
            {open && (
                <Sub>
                    {REGIONS.map((region) => (
                        <Row key={region.id} title={region.label} hint={region.hint}>
                            <Pick value={radii[region.id]} options={region.pill ? RADII : CORNERS} on_change={(next) => set_radius(region.id, next)} />
                        </Row>
                    ))}
                </Sub>
            )}
        </>
    )
}

/*
 * Size: one for everything, or - opened - one for each part, as the corners
 * are. Text is every measure in the window; the rest are drawn at their own.
 */
function Sizes() {
    const sizes = useStore(ui, (s) => s.sizes)
    const shared = common_size(sizes)
    const [open, set_open] = useState(() => !shared)

    return (
        <>
            <Row title='Interface size' hint={shared ? 'The same size everywhere' : 'The parts differ - set them all at once here, or one by one below'}>
                <Pick value={(shared ?? '') as Scale} options={SCALES} on_change={set_all_sizes} />
            </Row>
            <Row title='Each part on its own' hint='Text, menus, lists, cards and buttons, each its own size'>
                <Switch on={open} label='Each part on its own size' on_toggle={() => set_open(!open)} />
            </Row>
            {open && (
                <Sub>
                    {SIZE_PARTS.map((part) => (
                        <Row key={part.id} title={part.label} hint={part.hint}>
                            <Pick value={sizes[part.id]} options={SCALES} on_change={(next) => set_size(part.id, next)} />
                        </Row>
                    ))}
                </Sub>
            )}
        </>
    )
}

// the sections a phone lists, each with its mark
const PHONE_SECTIONS = [
    { id: 'appearance', label: 'Appearance', hint: 'Theme, accent, size, cards', icon: PaletteIcon },
    { id: 'corners', label: 'Corners', hint: 'How round things are', icon: LayoutGrid },
    { id: 'light', label: 'Light and glass', hint: 'Cover light, liquid glass, blur', icon: Sun },
    { id: 'motion', label: 'Motion', hint: 'How fast things move', icon: Sparkles },
    { id: 'lyrics', label: 'Lyrics', hint: 'The words and the wave', icon: MicVocal },
    { id: 'search', label: 'Search', hint: 'YouTube and SoundCloud', icon: Search },
    { id: 'suggestions', label: 'Suggestions', hint: 'What last.fm offers, and where', icon: Waveform },
    { id: 'library', label: 'Library', hint: 'The music folder', icon: FolderOpen },
    { id: 'keys', label: 'Keyboard', hint: 'For a keyboard plugged in or paired', icon: Keyboard },
]

// a phone's settings, first: who you are, then every section as a row to open
function PhoneIndex({ on_open }: { on_open: (id: string) => void }) {
    return (
        <div data-settings-root>
            <h1 className='mt-1 mb-6 font-serif text-[2.25rem] leading-tight font-medium'>Settings</h1>
            <div className='divide-y divide-line overflow-hidden rounded-2xl bg-surface-2'>
                {PHONE_SECTIONS.map(({ id, label, hint, icon: Glyph }) => (
                    <button key={id} type='button' onClick={() => on_open(id)} className='flex w-full items-center gap-3.5 px-4 py-3 text-left active:bg-surface-3'>
                        <span className='grid size-9 shrink-0 place-items-center rounded-[0.625rem] bg-[color-mix(in_oklab,var(--accent)_18%,transparent)] text-accent'>
                            <Glyph size={18} />
                        </span>
                        <span className='min-w-0 flex-1'>
                            <span className='block text-[0.9375rem] text-fg'>{label}</span>
                            <span className='block truncate text-[0.8125rem] text-muted'>{hint}</span>
                        </span>
                        <ChevronRight size={18} className='shrink-0 text-muted' />
                    </button>
                ))}
            </div>
        </div>
    )
}

export function SettingsPage() {
    const glass = useStore(ui, (s) => s.glass)
    const blur = useStore(ui, (s) => s.blur)
    const light_on = useStore(ui, (s) => s.aura_on)
    const light = useStore(ui, (s) => s.aura)
    const light_motion = useStore(ui, (s) => s.light_motion)
    const ambient = useStore(fx, (s) => s.motion)
    const pace = useStore(ui, (s) => s.pace)
    const cover_accent = useStore(ui, (s) => s.cover_accent)
    const density = useStore(ui, (s) => s.density)
    const card_style = useStore(ui, (s) => s.card_style)
    const card_tone = useStore(ui, (s) => s.card_tone)
    const nebula = useStore(ui, (s) => s.nebula)
    const lyrics_size = useStore(ui, (s) => s.lyrics_size)
    const lp_lyrics = useStore(ui, (s) => s.lp_lyrics)
    const lp_wave = useStore(ui, (s) => s.lp_wave)
    const home_wave = useStore(ui, (s) => s.home_wave)
    const bar_float = useStore(ui, (s) => s.bar_float)
    const scrolling = useStore(ui, (s) => s.scrolling)
    const search_mode = useStore(ui, (s) => s.search_mode)
    const feel = useStore(ui, (s) => s.feel)
    const suggest_on = useStore(ui, (s) => s.suggest_on)
    const places = useStore(ui, (s) => s.places)
    const share = useStore(ui, (s) => s.share_dc)
    const keyboard = useStore(ui, (s) => s.keyboard)
    const phone = usePhone()
    const [section, set_section] = useState<string | null>(null)

    // a phone's back, from a section, is the list of sections
    useEffect(() => {
        if (!phone || !section) return
        const on_key = (e: KeyboardEvent) => {
            // a choice's sheet open over the section takes the back first
            if (e.key !== 'Escape' || document.querySelector('[role="menu"], [role="dialog"]')) return
            set_section(null)
        }
        window.addEventListener('keydown', on_key)
        return () => window.removeEventListener('keydown', on_key)
    }, [phone, section])

    // a new section starts at its top
    useEffect(() => {
        if (!phone) return
        const box = document.querySelector('[data-subpage], [data-settings-root]')?.closest<HTMLElement>('.overflow-y-auto')
        if (box) glide_to(box, 0, { instant: true })
    }, [phone, section])

    const folder = useStore(library, (s) => s.folder)
    const songs = useStore(library, (s) => s.songs.length)
    const loading = useStore(library, (s) => s.loading)
    const held = reduced()

    if (phone && !section) return <PhoneIndex on_open={set_section} />

    return (
        <PhonePages.Provider value={{ phone, open: section }}>
        {/* the cards are kept to a width a row reads across - a label on the
            left and its control on the right, not a window apart - and the head
            (back, the title, the index) stands beside them, staying put while
            they go by under the bar. on a phone, one section's page */}
        <div data-subpage={phone || undefined} className='mx-auto max-w-[86rem] lg:grid lg:grid-cols-[11rem_minmax(0,72rem)] lg:gap-x-10'>
            {phone ? (
                <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} transition={spring.snappy} className='mb-5'>
                    <button type='button' onClick={() => set_section(null)} className='-ml-1.5 flex h-10 items-center gap-1 rounded-lg pr-2 text-[0.9375rem] text-fg-2 active:bg-surface-2'>
                        <ChevronLeft size={20} /> Settings
                    </button>
                    <h1 className='mt-2 font-serif text-[2rem] leading-tight font-medium'>{PHONE_SECTIONS.find((o) => o.id === section)?.label}</h1>
                </motion.div>
            ) : (
            <div className='lg:sticky lg:top-20 lg:self-start'>
                <button type='button' onClick={leave_page} className='mb-6 flex h-8 items-center gap-1.5 rounded-md text-[0.8125rem] text-muted transition-colors hover:text-fg'>
                    <ArrowLeft size={16} /> Back
                </button>
                <h1 className='mb-8 font-serif text-[2.25rem] leading-tight font-medium'>Settings</h1>
                <Index />
            </div>
            )}

            <motion.div key={section ?? 'all'} initial={phone ? { opacity: 0, x: 24 } : false} animate={{ opacity: 1, x: 0 }} transition={spring.snappy} className='min-w-0'>
                <Group id='appearance' title='Appearance'>
                    <Block title='Theme'>
                        <ThemePicker />
                    </Block>
                    <Row title='Colour from the cover' hint='The accent is taken from the artwork of what is playing'>
                        <Switch on={cover_accent} label='Colour from the cover' on_toggle={() => set_pref('cover_accent', !cover_accent)} />
                    </Row>
                    <Row title='Accent' hint={cover_accent ? 'When nothing is playing, or a cover has no colour to give' : 'Used everywhere'}>
                        <Swatches />
                    </Row>
                    <Sizes />
                    <Row title='Density' hint='How tall the rows in a listing are'>
                        <Pick value={density} options={DENSITIES} on_change={(next) => set_pref('density', next)} />
                    </Row>
                    <Row title='Track cards' hint={card_style === 'sleeve' ? 'One piece: the cover over a label with the title, the artist and the length' : 'The cover on its own, with two lines under it'}>
                        <Pick value={card_style} options={CARD_STYLES} on_change={(next) => set_pref('card_style', next)} />
                    </Row>
                    <Sub off={card_style !== 'sleeve'}>
                        <Row title='Label colour' hint={card_tone === 'cover' ? 'Each label is tinted with the colour of its own cover' : 'Every label is the plain colour of the theme'}>
                            <Pick value={card_tone} options={CARD_TONES} on_change={(next) => set_pref('card_tone', next)} />
                        </Row>
                    </Sub>
                    <Row title='Floating bar' hint={bar_float ? 'The search and the buttons beside it stay over the page, on a bar that comes away from the top as you scroll' : 'The search and the buttons beside it scroll away with the page'}>
                        <Switch on={bar_float} label='Floating bar' on_toggle={() => set_pref('bar_float', !bar_float)} />
                    </Row>
                </Group>

                <Group id='corners' title='Corners' note='How round things are, everywhere at once or part by part'>
                    <Corners />
                </Group>

                <Group id='light' title='Light and glass' note='The cover of what is playing lights the room the panels stand in'>
                    <Row title='Cover light' hint='The artwork, blurred into light behind the panels. Also the sun button in the player'>
                        <Switch on={light_on} label='Cover light' on_toggle={() => set_pref('aura_on', !light_on)} />
                    </Row>
                    <Sub off={!light_on}>
                        <Row title='Strength'>
                            <Range
                                value={light}
                                min={LIGHT_RANGE[0]}
                                max={LIGHT_RANGE[1]}
                                step={5}
                                aria-label='Cover light strength'
                                on_change={(value) => ui.set({ aura: value })}
                                onPointerUp={() => save_pref('aura', ui.get().aura)}
                                onKeyUp={() => save_pref('aura', ui.get().aura)}
                                className='range-accent w-48 max-sm:w-28'
                            />
                            <span className='w-9 text-right font-mono text-[0.75rem] text-muted tabular-nums'>{light}%</span>
                        </Row>
                        <Row title='Moving light' hint='Turns slowly while music plays, still when it is paused'>
                            <Switch on={light_motion} label='Moving light' on_toggle={() => set_pref('light_motion', !light_motion)} />
                        </Row>
                    </Sub>
                    <Row title='Liquid glass' hint='Panels, the bar, the search, menus, the player and buttons turn to glass. Off, everything is solid'>
                        <Switch on={glass} label='Liquid glass' on_toggle={() => set_pref('glass', !glass)} />
                    </Row>
                    <Row title='Blur' hint='Far lyric lines go out of focus, and liquid glass is frosted rather than clear'>
                        <Switch on={blur} label='Blur' on_toggle={() => set_pref('blur', !blur)} />
                    </Row>
                </Group>

                <Group id='motion' title='Motion'>
                    <Row title='Animations' hint={pace === 'off' ? 'Pages, menus and dialogs appear without moving' : PACES.find((o) => o.id === pace)?.hint}>
                        <Pick value={pace} options={PACES} on_change={(next) => set_pref('pace', next)} />
                    </Row>
                    <Row title='Ambient motion' hint={MOTIONS.find((option) => option.id === ambient)?.hint}>
                        <Pick value={ambient} options={MOTIONS} on_change={set_motion} />
                    </Row>
                    <Row title='Nebula' hint='A slow cloud of light behind the pages, in the colours of what is playing'>
                        <Pick value={nebula} options={BACKDROPS} on_change={(next) => set_pref('nebula', next)} />
                    </Row>
                    {/* the wheel's: a finger scrolls the way the phone does */}
                    {!phone && (
                        <>
                    <Row title='Scrolling' hint={held ? 'Your desktop asks for reduced motion, so scrolling is left as it is' : SCROLLINGS.find((o) => o.id === scrolling)?.hint} dimmed={held}>
                        <Pick value={scrolling} options={SCROLLINGS} on_change={(next) => set_pref('scrolling', next)} />
                    </Row>
                    <Sub off={held || scrolling !== 'glide'}>
                        <Row title='Glide feel' hint='Gentle trails a little after the wheel stops, quick settles sooner'>
                            <Pick value={feel} options={FEELS} on_change={(next) => set_pref('feel', next)} />
                        </Row>
                    </Sub>
                        </>
                    )}
                </Group>

                <Group id='lyrics' title='Lyrics' note='The full-screen page opened from the cover or the lyrics button'>
                    <Row title='Show the words' hint='Off, the page is the record alone, in the middle. Also top right on the page itself'>
                        <Switch on={lp_lyrics} label='Show the words' on_toggle={() => set_pref('lp_lyrics', !lp_lyrics)} />
                    </Row>
                    <Sub off={!lp_lyrics}>
                        <Row title='Text size'>
                            <Pick value={lyrics_size} options={LYRICS_SIZES} on_change={(next) => set_pref('lyrics_size', next)} />
                        </Row>
                    </Sub>
                    <Row title='Wave on the lyrics page' hint='The sound rising along the foot of the page'>
                        <Switch on={lp_wave} label='Wave on the lyrics page' on_toggle={() => set_pref('lp_wave', !lp_wave)} />
                    </Row>
                    <Row title='Wave on Home' hint='Behind what is playing at the top of Home'>
                        <Switch on={home_wave} label='Wave on Home' on_toggle={() => set_pref('home_wave', !home_wave)} />
                    </Row>
                </Group>

                <Group id='search' title='Search'>
                    <Row title='Sources' hint={search_mode === 'parallel' ? 'YouTube and SoundCloud are asked at once; each tab fills as its answer lands' : 'Only the open tab is asked; the other when you switch to it'}>
                        <Pick value={search_mode} options={SEARCH_MODES} on_change={(next) => set_pref('search_mode', next)} />
                    </Row>
                </Group>

                <Group id='suggestions' title='Suggestions' note='Tracks you do not have yet, picked by last.fm. Needs a last.fm key'>
                    <Row title='Suggestions'>
                        <Switch on={suggest_on} label='Suggestions' on_toggle={() => set_pref('suggest_on', !suggest_on)} />
                    </Row>
                    <Sub off={!suggest_on}>
                        {PLACES.map((place) => {
                            const shown = places.includes(place.id)

                            return (
                                <Row key={place.id} title={place.label} hint={place.hint}>
                                    <Switch on={shown} label={place.label} on_toggle={() => set_pref('places', shown ? places.filter((p) => p !== place.id) : [...places, place.id])} />
                                </Row>
                            )
                        })}
                    </Sub>
                </Group>

                {/* a phone has no discord client to show it on */}
                {!phone && (
                <Group id='sharing' title='Sharing'>
                    <Row title='Discord activity' hint='Shows the track you are playing on your Discord profile'>
                        <Switch
                            on={share}
                            label='Share activity on Discord'
                            on_toggle={() => {
                                void set_sharing(!share)
                                set_pref('share_dc', !share)
                            }}
                        />
                    </Row>
                </Group>
                )}

                <Group id='library' title='Library'>
                    <Row title='Music folder' hint={folder || '~/Music'}>
                        <span className='font-mono text-[0.75rem] text-muted tabular-nums'>{songs} tracks</span>
                        <Button variant='secondary' size='sm' loading={loading} icon={<RefreshCw size={16} />} onClick={() => void fetch_songs()}>
                            Rescan
                        </Button>
                    </Row>
                </Group>

                {/* a phone has keys only once a keyboard is plugged in or paired:
                    until it is said to be, there is nothing here to set */}
                <Group id='keys' title='Keyboard shortcuts'>
                    {phone && (
                        <Row title='A keyboard is connected' hint={keyboard ? 'Its shortcuts are below' : 'Turn on with a keyboard plugged in or paired, to set its shortcuts'}>
                            <Switch on={keyboard} label='A keyboard is connected' on_toggle={() => set_pref('keyboard', !keyboard)} />
                        </Row>
                    )}
                    {(!phone || keyboard) && (
                        <Block title='Shortcuts'>
                            <KeybindEditor />
                        </Block>
                    )}
                </Group>
            </motion.div>
        </div>
        </PhonePages.Provider>
    )
}

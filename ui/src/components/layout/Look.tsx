import { useCallback, useState } from 'react'
import { useDismiss } from '../../hooks/dismiss'
import { cn } from '../../lib/cn'
import { CORNERS, LIGHT_RANGE, PALETTES, save_pref, type Corners, type Theme } from '../../lib/prefs'
import { useStore } from '../../lib/store'
import { tip } from '../../lib/tip'
import { common_radius, set_all_radii, set_pref, ui } from '../../state/ui'
import { IconButton } from '../ui/Button'
import { Range, Segmented, Switch } from '../ui/Controls'
import { Monitor, Palette, Sun } from '../ui/icons'
import { MenuLabel, MenuPanel, MenuSep } from '../ui/Menu'

/*
 * How the window looks, within reach: the theme, glass, the cover's light and
 * the corners, from a button in the top bar (on a phone, the profile
 * sheet), without going to settings. The cover's light also has a button of
 * its own in the player, the way master had it: a click turns it on or off,
 * a right-click sets how strong it is.
 */

// a theme as a dot of its own colours: its ground, and its accent on it
function ThemeDot({ id, label, current, swatch, large }: { id: Theme; label: string; current: Theme; swatch?: [string, string, string]; large?: boolean }) {
    return (
        <button
            type='button'
            role='radio'
            aria-checked={current === id}
            {...tip(label)}
            onClick={() => set_pref('theme', id)}
            className={cn('grid place-items-center rounded-full transition-[box-shadow]', large ? 'size-11' : 'size-8', current === id ? 'shadow-[inset_0_0_0_1.5px_var(--fg-2)]' : 'hover:shadow-[inset_0_0_0_1px_var(--line-strong)]')}
        >
            {swatch ? (
                <span className={cn('grid place-items-center rounded-full shadow-[inset_0_0_0_1px_rgb(128_128_128/0.35)]', large ? 'size-7' : 'size-5')} style={{ background: swatch[0] }}>
                    <span className={cn('rounded-full', large ? 'size-2.5' : 'size-2')} style={{ background: swatch[2] }} />
                </span>
            ) : (
                <Monitor size={large ? 20 : 16} className='text-fg-2' />
            )}
        </button>
    )
}

// the cover's light: on or off, and how much of it reaches the room
export function LightControls({ large = false }: { large?: boolean }) {
    const on = useStore(ui, (s) => s.aura_on)
    const light = useStore(ui, (s) => s.aura)

    return (
        <div className={large ? 'px-3 py-1' : 'px-2 py-1.5'}>
            <Toggle large={large} label='Cover light' on={on} on_toggle={() => set_pref('aura_on', !on)} inset={false} />
            <div className={cn('flex items-center gap-3 transition-opacity', large ? 'h-11' : 'h-8', !on && 'opacity-40')}>
                <Range
                    value={light}
                    min={LIGHT_RANGE[0]}
                    max={LIGHT_RANGE[1]}
                    step={5}
                    disabled={!on}
                    aria-label='Cover light strength'
                    on_change={(value) => ui.set({ aura: value })}
                    // written once the drag ends rather than on every step
                    onPointerUp={() => save_pref('aura', ui.get().aura)}
                    onKeyUp={() => save_pref('aura', ui.get().aura)}
                    className='flex-1'
                />
                <span className={cn('w-9 text-right font-mono text-muted tabular-nums', large ? 'text-[0.75rem]' : 'text-[0.6875rem]')}>{light}%</span>
            </div>
        </div>
    )
}

/*
 * A switch on a row. On a phone's sheet the row is a thumb's height and the
 * whole of it flips the switch, not only the knob at its end; the switch
 * stays the control a screen reader is given.
 */
function Toggle({ label, on, on_toggle, large, inset = true }: { label: string; on: boolean; on_toggle: () => void; large: boolean; inset?: boolean }) {
    return (
        <div onClick={large ? on_toggle : undefined} className={cn('flex items-center justify-between', large ? 'h-12' : inset ? 'h-10' : 'h-8', inset && (large ? 'px-3' : 'px-2'))}>
            <span className={large ? 'text-[0.9375rem]' : 'text-[0.8125rem]'}>{label}</span>
            <span onClick={(e) => large && e.stopPropagation()}>
                <Switch on={on} label={label} on_toggle={on_toggle} />
            </span>
        </div>
    )
}

// the look itself: the quick look's popover on a desktop, the head of the
// profile sheet on a phone (layout/TopBar), where it is one tap from any tab
export function LookControls({ large = false }: { large?: boolean }) {
    const theme = useStore(ui, (s) => s.theme)
    const glass = useStore(ui, (s) => s.glass)
    const blur = useStore(ui, (s) => s.blur)
    const radii = useStore(ui, (s) => s.radii)

    return (
        <>
            <MenuLabel>Theme</MenuLabel>
            <div role='radiogroup' className={cn('flex items-center', large ? 'flex-wrap gap-0.5 px-2 pb-1' : 'gap-1 px-2 pb-1.5')}>
                <ThemeDot id='system' label='System' current={theme} large={large} />
                {PALETTES.map((p) => (
                    <ThemeDot key={p.id} id={p.id} label={p.label} current={theme} swatch={p.swatch} large={large} />
                ))}
            </div>
            <MenuSep />
            <LightControls large={large} />
            <MenuSep />
            <Toggle large={large} label='Blur' on={blur} on_toggle={() => set_pref('blur', !blur)} />
            <Toggle large={large} label='Liquid glass' on={glass} on_toggle={() => set_pref('glass', !glass)} />
            <div className={cn('flex items-center justify-between gap-3', large ? 'h-14 px-3' : 'h-10 px-2')}>
                <span className={large ? 'text-[0.9375rem]' : 'text-[0.8125rem]'}>Corners</span>
                <Segmented value={(common_radius(radii) ?? '') as Corners} options={CORNERS} on_change={set_all_radii} />
            </div>
        </>
    )
}

export function QuickLook() {
    const [open, set_open] = useState(false)
    const close = useCallback(() => set_open(false), [])

    useDismiss(open, close)

    return (
        <div className='relative' onClick={(e) => e.stopPropagation()}>
            <IconButton size='sm' {...tip('Look')} aria-expanded={open} onClick={() => set_open(!open)} className={open ? 'bg-surface-2 text-fg' : ''}>
                <Palette size={16} />
            </IconButton>
            {open && (
                <MenuPanel className='absolute top-full right-0 mt-2 w-72 origin-top-right'>
                    <LookControls />
                </MenuPanel>
            )}
        </div>
    )
}

// the cover's light from the player: a click for on and off, a right-click for how strong
export function LightButton() {
    const on = useStore(ui, (s) => s.aura_on)
    const [open, set_open] = useState(false)
    const close = useCallback(() => set_open(false), [])

    useDismiss(open, close)

    return (
        <div className='relative' onClick={(e) => e.stopPropagation()}>
            <IconButton
                size='sm'
                variant={on ? 'on' : 'plain'}
                aria-pressed={on}
                {...tip(on ? 'Cover light · right-click for strength' : 'Turn the cover light on')}
                onClick={() => set_pref('aura_on', !on)}
                onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    set_open(!open)
                }}
            >
                <Sun size={16} />
            </IconButton>
            {open && (
                <MenuPanel className='absolute right-0 bottom-full mb-2 w-64 origin-bottom-right'>
                    <LightControls />
                </MenuPanel>
            )}
        </div>
    )
}

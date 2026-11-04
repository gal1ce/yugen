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
 * the corners, from a button in the top bar, without going to settings. The
 * cover's light also has a button of its own in the player, the way master
 * had it: a click turns it on or off, a right-click sets how strong it is.
 */

// a theme as a dot of its own colours: its ground, and its accent on it
function ThemeDot({ id, label, current, swatch }: { id: Theme; label: string; current: Theme; swatch?: [string, string, string] }) {
    return (
        <button
            type='button'
            role='radio'
            aria-checked={current === id}
            {...tip(label)}
            onClick={() => set_pref('theme', id)}
            className={cn('grid size-8 place-items-center rounded-full transition-[box-shadow]', current === id ? 'shadow-[inset_0_0_0_1.5px_var(--fg-2)]' : 'hover:shadow-[inset_0_0_0_1px_var(--line-strong)]')}
        >
            {swatch ? (
                <span className='grid size-5 place-items-center rounded-full shadow-[inset_0_0_0_1px_rgb(128_128_128/0.35)]' style={{ background: swatch[0] }}>
                    <span className='size-2 rounded-full' style={{ background: swatch[2] }} />
                </span>
            ) : (
                <Monitor size={16} className='text-fg-2' />
            )}
        </button>
    )
}

// the cover's light: on or off, and how much of it reaches the room
export function LightControls() {
    const on = useStore(ui, (s) => s.aura_on)
    const light = useStore(ui, (s) => s.aura)

    return (
        <div className='px-2 py-1.5'>
            <div className='flex h-8 items-center justify-between'>
                <span className='text-[0.8125rem]'>Cover light</span>
                <Switch on={on} label='Cover light' on_toggle={() => set_pref('aura_on', !on)} />
            </div>
            <div className={cn('flex h-8 items-center gap-3 transition-opacity', !on && 'opacity-40')}>
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
                <span className='w-9 text-right font-mono text-[0.6875rem] text-muted tabular-nums'>{light}%</span>
            </div>
        </div>
    )
}

export function QuickLook() {
    const [open, set_open] = useState(false)
    const theme = useStore(ui, (s) => s.theme)
    const glass = useStore(ui, (s) => s.glass)
    const blur = useStore(ui, (s) => s.blur)
    const radii = useStore(ui, (s) => s.radii)
    const close = useCallback(() => set_open(false), [])

    useDismiss(open, close)

    return (
        <div className='relative' onClick={(e) => e.stopPropagation()}>
            <IconButton size='sm' {...tip('Look')} aria-expanded={open} onClick={() => set_open(!open)} className={open ? 'bg-surface-2 text-fg' : ''}>
                <Palette size={16} />
            </IconButton>
            {open && (
                <MenuPanel className='absolute top-full right-0 mt-2 w-72 origin-top-right'>
                    <MenuLabel>Theme</MenuLabel>
                    <div role='radiogroup' className='flex items-center gap-1 px-2 pb-1.5'>
                        <ThemeDot id='system' label='System' current={theme} />
                        {PALETTES.map((p) => (
                            <ThemeDot key={p.id} id={p.id} label={p.label} current={theme} swatch={p.swatch} />
                        ))}
                    </div>
                    <MenuSep />
                    <LightControls />
                    <MenuSep />
                    <div className='flex h-10 items-center justify-between px-2'>
                        <span className='text-[0.8125rem]'>Blur</span>
                        <Switch on={blur} label='Blur' on_toggle={() => set_pref('blur', !blur)} />
                    </div>
                    <div className='flex h-10 items-center justify-between px-2'>
                        <span className='text-[0.8125rem]'>Liquid glass</span>
                        <Switch on={glass} label='Liquid glass' on_toggle={() => set_pref('glass', !glass)} />
                    </div>
                    <div className='flex h-10 items-center justify-between gap-3 px-2'>
                        <span className='text-[0.8125rem]'>Corners</span>
                        <Segmented value={(common_radius(radii) ?? '') as Corners} options={CORNERS} on_change={set_all_radii} />
                    </div>
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

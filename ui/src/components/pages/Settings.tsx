import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeft, FolderOpen, Keyboard, Palette, RefreshCw, Share2 } from '../ui/icons'
import { cn } from '../../lib/cn'
import { MOTIONS, fx, set_motion } from '../../lib/fx'
import { KEYBINDS, MODIFIER_CODES, combo_of, default_keybinds, key_label, type Bind } from '../../lib/keys'
import { AURA_RANGE, THEMES, save_pref } from '../../lib/prefs'
import { useStore } from '../../lib/store'
import { change_keybinds } from '../../state/keys'
import { fetch_songs, library } from '../../state/library'
import { set_sharing } from '../../state/player'
import { leave_page, set_pref, ui } from '../../state/ui'
import { Button } from '../ui/Button'
import { Range, Segmented, Switch } from '../ui/Controls'

function Group({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
    return (
        <section className='edge mb-5 rounded-2xl bg-surface p-5'>
            <h2 className='mb-2 flex items-center gap-2 text-sm font-semibold'>
                <span className='text-accent'>{icon}</span>
                {title}
            </h2>
            <div className='divide-y divide-line'>{children}</div>
        </section>
    )
}

function Row({ title, hint, dimmed, children }: { title: string; hint?: string; dimmed?: boolean; children: ReactNode }) {
    return (
        <div className={cn('flex items-center gap-6 py-3.5 transition-opacity', dimmed && 'opacity-45')}>
            <div className='min-w-0 flex-1'>
                <p className='text-[0.82rem]'>{title}</p>
                {hint && <p className='mt-0.5 text-xs text-muted'>{hint}</p>}
            </div>
            {children}
        </div>
    )
}

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
            <div className='grid gap-x-6 sm:grid-cols-2'>
                {KEYBINDS.map((bind) => (
                    <div key={bind.id} className='flex items-center justify-between gap-3 border-b border-line py-2.5'>
                        <span className='truncate text-[0.82rem]'>{bind.label}</span>
                        <button
                            type='button'
                            onClick={() => {
                                set_taken('')
                                set_listening(bind.id)
                            }}
                            className={cn(
                                'h-7 min-w-20 rounded-lg border px-2.5 font-mono text-[0.72rem] transition-colors',
                                listening === bind.id
                                    ? 'animate-pulse border-accent bg-accent/12 text-accent'
                                    : binds[bind.id]
                                      ? 'border-line-strong bg-surface-2 text-fg hover:border-accent/50'
                                      : 'border-dashed border-line text-muted hover:border-line-strong',
                            )}
                        >
                            {listening === bind.id ? 'Press a key' : key_label(binds[bind.id])}
                        </button>
                    </div>
                ))}
            </div>
            <div className='flex items-center justify-between gap-4 pt-4'>
                <p className='text-xs text-muted'>
                    {listening
                        ? 'Press the keys. Backspace leaves it unbound, escape keeps what it was.'
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

export function SettingsPage() {
    const theme = useStore(ui, (s) => s.theme)
    const motion = useStore(fx, (s) => s.motion)
    const aura_on = useStore(ui, (s) => s.aura_on)
    const aura = useStore(ui, (s) => s.aura)
    const share = useStore(ui, (s) => s.share_dc)
    const folder = useStore(library, (s) => s.folder)
    const songs = useStore(library, (s) => s.songs.length)
    const loading = useStore(library, (s) => s.loading)

    return (
        <div className='mx-auto max-w-3xl'>
            <div className='mb-7 flex items-center gap-3'>
                <button type='button' onClick={leave_page} className='grid size-9 place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-fg' aria-label='Back'>
                    <ArrowLeft size={18} />
                </button>
                <h1 className='font-display text-[2.4rem] font-bold tracking-tight'>Settings</h1>
            </div>

            <Group icon={<Palette size={15} />} title='Appearance'>
                <Row title='Theme' hint='System follows whatever the desktop is set to.'>
                    <Segmented
                        value={theme}
                        options={THEMES.map((id) => ({ id, label: id[0].toUpperCase() + id.slice(1) }))}
                        on_change={(next) => {
                            ui.set({ theme: next })
                            save_pref('theme', next)
                        }}
                    />
                </Row>
                <Row title='Motion' hint={MOTIONS.find((option) => option.id === motion)?.hint}>
                    <Segmented value={motion} options={MOTIONS} on_change={set_motion} />
                </Row>
                <Row title='Colour from the cover' hint='Takes the accent from the artwork of what is playing.'>
                    <Switch on={aura_on} label='Colour from the cover' on_toggle={() => set_pref('aura_on', !aura_on)} />
                </Row>
                <Row title='Glow strength' hint='How much of that colour washes the top of the window.' dimmed={!aura_on}>
                    <div className='flex w-56 items-center gap-3'>
                        <Range
                            value={aura}
                            min={AURA_RANGE[0]}
                            max={AURA_RANGE[1]}
                            step={5}
                            disabled={!aura_on}
                            aria-label='Glow strength'
                            on_change={(value) => ui.set({ aura: value })}
                            // written once the drag ends rather than on every step
                            onPointerUp={() => save_pref('aura', ui.get().aura)}
                            onKeyUp={() => save_pref('aura', ui.get().aura)}
                            className='flex-1'
                        />
                        <span className='w-9 text-right text-xs text-muted tabular-nums'>{aura}%</span>
                    </div>
                </Row>
            </Group>

            <Group icon={<Share2 size={15} />} title='Sharing'>
                <Row title='Discord activity' hint='Puts the track you are playing on your Discord profile.'>
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

            <Group icon={<FolderOpen size={15} />} title='Library'>
                <Row title='Music folder' hint={`${folder || '~/Music'} · ${songs} tracks`}>
                    <Button variant='secondary' size='sm' loading={loading} icon={<RefreshCw size={13} />} onClick={() => void fetch_songs()}>
                        Rescan
                    </Button>
                </Row>
            </Group>

            <Group icon={<Keyboard size={15} />} title='Keyboard shortcuts'>
                <KeybindEditor />
            </Group>
        </div>
    )
}

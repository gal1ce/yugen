import type { ReactNode } from 'react'
import { useTone } from '../../hooks/tone'
import { cn } from '../../lib/cn'
import { useStore } from '../../lib/store'
import { useThumb } from '../../lib/thumbs'
import { ui, type MenuTarget } from '../../state/ui'
import { More } from '../ui/More'

/*
 * A card for what holds tracks - an album, a mix - drawn the way settings
 * draws a track's: as a sleeve (one object, the picture over a label tinted
 * with the cover's colour, one hairline round both) or classic (the picture
 * on its own and two lines under it). The dots sit where a track card keeps
 * them, so every card on a phone is opened the same way. An artist is a
 * face, round and bare in either: a face does not sit on a label.
 */
export function Card({
    picture,
    tone_of,
    title,
    sub,
    round = false,
    menu,
    on_open,
}: {
    picture: ReactNode
    // the cover the label is tinted with
    tone_of?: string
    title: string
    sub: ReactNode
    round?: boolean
    menu?: MenuTarget
    on_open: () => void
}) {
    const sleeve = useStore(ui, (s) => s.card_style === 'sleeve') && !round
    const by_cover = useStore(ui, (s) => s.card_tone === 'cover')
    const tone = useTone(useThumb(sleeve && by_cover ? tone_of : undefined, 'sm'))

    return (
        <div className='group relative min-w-0'>
            <button
                type='button'
                onClick={on_open}
                className={cn('block w-full text-left transition-[scale] active:scale-[0.985]', sleeve && 'card-sleeve relative')}
                style={tone ? ({ '--tone': tone } as React.CSSProperties) : undefined}
            >
                <div
                    className={cn(
                        'relative aspect-square overflow-hidden bg-surface-2',
                        round ? 'rounded-full' : !sleeve && 'rounded-(--r-cover) shadow-[0_14px_28px_-18px_rgb(0_0_0/0.7)]',
                    )}
                >
                    {picture}
                    <div className='absolute inset-0 bg-black/20 opacity-0 transition-opacity group-hover:opacity-100' />
                </div>
                <div className={cn(sleeve ? 'px-3 pt-2.5 pb-3' : 'mt-2', menu && 'max-sm:pr-9', round && 'text-center')}>
                    <p className='card-text truncate text-[0.875rem] font-medium text-fg'>{title}</p>
                    <p className='card-text truncate text-[0.8125rem] text-muted'>{sub}</p>
                </div>
            </button>
            {menu && !round && <More target={menu} className={sleeve ? 'absolute right-0 bottom-1' : 'absolute right-[-0.5rem] bottom-[-0.25rem]'} />}
        </div>
    )
}

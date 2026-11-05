import { open_menu, type MenuTarget } from '../../state/ui'
import { cn } from '../../lib/cn'
import { DotsThreeVertical } from './icons'

/*
 * The dots at the end of a row on a phone: the track's menu, as a sheet from
 * the foot of the screen (ui/Menu). A phone has no right click, and a long
 * press is too easily a scroll that paused, so this is the way in there. On
 * a desktop the row's right click is, and the dots are not drawn.
 */
export function More({ target, className }: { target: MenuTarget; className?: string }) {
    return (
        <button
            type='button'
            aria-label='More'
            onClick={(e) => {
                e.stopPropagation()
                open_menu(target, 0, 0)
            }}
            className={cn('hidden size-11 shrink-0 place-items-center rounded-full text-muted transition-colors active:bg-surface-2 max-sm:grid', className)}
        >
            <DotsThreeVertical size={20} />
        </button>
    )
}

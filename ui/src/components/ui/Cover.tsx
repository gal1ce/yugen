import { memo } from 'react'
import { Music } from './icons'
import { cn } from '../../lib/cn'
import type { ThumbSize } from '../../lib/shrink'
import { useThumb } from '../../lib/thumbs'

/*
 * Any picture of a record: a track's tags, a playlist's sleeve, a profile.
 * What is drawn is always the shrunk copy (lib/thumbs) - the original is a
 * full-size png nobody needs at this size. Until it is ready, and when there is
 * no picture at all, the square holds its place.
 */
export const Cover = memo(function Cover({
    data,
    className,
    round,
    icon = 18,
    size = 'lg',
}: {
    data?: string
    className?: string
    round?: boolean
    icon?: number
    // how big it is drawn: sm for a row's square, md for a card, lg past that
    size?: ThumbSize
}) {
    const url = useThumb(data, size)

    return (
        <span className={cn('relative block shrink-0 overflow-hidden bg-surface-3', round ? 'rounded-full' : 'rounded-lg', className)}>
            {url ? (
                <img src={url} alt='' decoding='async' className='size-full object-cover' />
            ) : (
                !data && (
                    <span className='grid size-full place-items-center text-muted/60'>
                        <Music size={icon} />
                    </span>
                )
            )}
        </span>
    )
})

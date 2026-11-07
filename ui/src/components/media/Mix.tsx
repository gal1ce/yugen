import { memo } from 'react'
import { cn } from '../../lib/cn'
import { shallow, useStore } from '../../lib/store'
import { library } from '../../state/library'
import { mix_line, type Mix } from '../../state/mixes'
import { open_own } from '../../state/ui'
import { Cover } from '../ui/Cover'
import { Card } from './Card'

/*
 * A mix's sleeve is the people in it: the seed's cover in front, centred and
 * larger, and one of the next two artists' at each side behind it, smaller
 * and a step darker (Spotify's mixes, drawn from three records instead of
 * one). Each face is the first cover among its tracks not already used, so
 * the three are three records even when the mix is one artist's.
 */
function useFaces(faces: string[][]) {
    return useStore(
        library,
        (s) => {
            const picked: string[] = []
            const all = faces.flat()
            for (const face of faces) {
                const art = face.map((t) => s.covers[t]).find((c) => c && !picked.includes(c)) ?? all.map((t) => s.covers[t]).find((c) => c && !picked.includes(c))
                picked.push(art ?? '')
            }
            return picked
        },
        shallow,
    )
}

export function Stack({ faces, className }: { faces: string[][]; className?: string }) {
    const [front, left, right] = useFaces(faces)
    const side = 'absolute top-1/2 aspect-square w-[46%] -translate-y-1/2 brightness-[0.82]'

    return (
        <div className={cn('relative aspect-square overflow-hidden bg-surface-2', className)}>
            <div className={cn(side, 'left-[5%]')}>
                <Cover data={left} size='sm' icon={20} className='size-full shadow-[0_10px_22px_-12px_rgb(0_0_0/0.7)]' />
            </div>
            <div className={cn(side, 'right-[5%]')}>
                <Cover data={right} size='sm' icon={20} className='size-full shadow-[0_10px_22px_-12px_rgb(0_0_0/0.7)]' />
            </div>
            <div className='absolute top-1/2 left-1/2 aspect-square w-[62%] -translate-1/2'>
                <Cover data={front} size='md' icon={28} className='size-full shadow-[0_18px_32px_-14px_rgb(0_0_0/0.8),0_0_0_1px_rgb(0_0_0/0.12)]' />
            </div>
        </div>
    )
}

export const MixCard = memo(function MixCard({ mix }: { mix: Mix }) {
    const [front] = useFaces(mix.faces)

    return (
        <Card
            picture={<Stack faces={mix.faces} className='size-full' />}
            tone_of={front}
            title={mix.name}
            sub={mix_line(mix)}
            menu={{ kind: 'group', title: mix.name, tracks: mix.tracks }}
            on_open={() => open_own('mix', mix.name)}
        />
    )
})

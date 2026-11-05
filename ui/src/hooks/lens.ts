import { useEffect, type RefObject } from 'react'
import { capsule_map, lens_filter } from '../lib/lens'

let made = 0

/*
 * A capsule of liquid glass that bends what is behind it (lib/lens): the
 * element gets a lens of its own, sized to it and kept so as it resizes, and
 * names it in --lens, which `.lens-glass` puts in its backdrop-filter
 * (index.css). Off - glass off in the look - nothing is made.
 */
export function useLens(ref: RefObject<HTMLElement | null>, on: boolean) {
    useEffect(() => {
        const node = ref.current
        if (!node || !on) return

        const id = `lens-${++made}`
        const ns = 'http://www.w3.org/2000/svg'
        const svg = document.createElementNS(ns, 'svg')
        svg.setAttribute('width', '0')
        svg.setAttribute('height', '0')
        svg.setAttribute('aria-hidden', 'true')
        svg.style.position = 'absolute'
        svg.innerHTML = lens_filter(id)
        document.body.appendChild(svg)

        const filter = svg.querySelector('filter')!
        const image = filter.querySelector('feImage')!

        const fit = () => {
            const width = node.offsetWidth
            const height = node.offsetHeight
            if (!width || !height) return

            for (const el of [filter, image]) {
                el.setAttribute('width', `${width}`)
                el.setAttribute('height', `${height}`)
            }
            image.setAttribute('href', capsule_map(width, height, height / 2))
        }

        fit()
        const watch = new ResizeObserver(fit)
        watch.observe(node)
        node.style.setProperty('--lens', `url(#${id})`)

        return () => {
            watch.disconnect()
            svg.remove()
            node.style.removeProperty('--lens')
        }
    }, [ref, on])
}

/*
 * A cover as a handful of colours: what the lyrics page and the hero paint
 * their moving light out of. One small canvas read of the shrunk copy, the
 * pixels bucketed by hue and lightness, and the strongest buckets that are
 * actually colours - near-black and near-white say nothing - come back first.
 */
const SIZE = 32

type Bucket = { weight: number; h: number; s: number; l: number; n: number }

function to_hsl(r: number, g: number, b: number): [number, number, number] {
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const l = (max + min) / 2
    const d = max - min
    if (!d) return [0, 0, l]

    const s = d / (1 - Math.abs(2 * l - 1))
    const h = 60 * (max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4)

    return [h, s, l]
}

export function palette_of(src: string): Promise<string[]> {
    return new Promise((resolve) => {
        const image = new Image()

        image.onerror = () => resolve([])
        image.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = canvas.height = SIZE

            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            if (!ctx) return resolve([])

            ctx.drawImage(image, 0, 0, SIZE, SIZE)
            const { data } = ctx.getImageData(0, 0, SIZE, SIZE)
            const buckets = new Map<string, Bucket>()

            for (let i = 0; i < data.length; i += 4) {
                const [h, s, l] = to_hsl(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255)
                if (l < 0.08 || l > 0.94) continue

                // grey is allowed in, but weighs little: a black-and-white cover
                // still has a palette, it is just a quiet one
                const key = s < 0.12 ? `grey:${Math.floor(l * 4)}` : `${Math.floor(h / 30)}:${Math.floor(l * 3)}`
                const weight = 0.25 + s * (1 - Math.abs(l - 0.5))
                const held = buckets.get(key) ?? { weight: 0, h: 0, s: 0, l: 0, n: 0 }

                held.weight += weight
                held.h += h
                held.s += s
                held.l += l
                held.n++
                buckets.set(key, held)
            }

            const colours = [...buckets.values()]
                .sort((a, b) => b.weight - a.weight)
                .slice(0, 5)
                .map(({ h, s, l, n }) => {
                    // pulled into a band that glows on a dark page without
                    // turning to neon or to mud
                    const sat = Math.min(Math.max((s / n) * 100, 18), 78)
                    const light = Math.min(Math.max((l / n) * 100, 32), 62)

                    return `hsl(${Math.round(h / n)} ${Math.round(sat)}% ${Math.round(light)}%)`
                })

            resolve(colours)
        }

        image.src = src
    })
}

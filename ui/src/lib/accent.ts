// the cover of whatever is playing is what colours the app. one small canvas
// read per track, off the shrunk copy: it is a blob url, so nothing taints it.
export const ART_SIZE = 28

export function art_accent(src: string): Promise<[number, number] | null> {
    return new Promise((resolve) => {
        const image = new Image()

        image.onerror = () => resolve(null)
        image.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = canvas.height = ART_SIZE

            const context = canvas.getContext('2d', { willReadFrequently: true })
            if (!context) return resolve(null)

            context.drawImage(image, 0, 0, ART_SIZE, ART_SIZE)

            const { data: pixels } = context.getImageData(0, 0, ART_SIZE, ART_SIZE)

            // 24 hue buckets, each weighted by how colourful and how mid-toned the pixel is:
            // near-black and near-white pixels carry no usable hue
            const weight = new Array(24).fill(0)
            const saturation = new Array(24).fill(0)

            for (let i = 0; i < pixels.length; i += 4) {
                const r = pixels[i] / 255
                const g = pixels[i + 1] / 255
                const b = pixels[i + 2] / 255

                const max = Math.max(r, g, b)
                const min = Math.min(r, g, b)
                const light = (max + min) / 2
                const delta = max - min

                if (delta < 0.08) continue

                const sat = delta / (1 - Math.abs(2 * light - 1))
                const hue =
                    60 *
                    (max === r
                        ? ((g - b) / delta + 6) % 6
                        : max === g
                          ? (b - r) / delta + 2
                          : (r - g) / delta + 4)

                // a bell around mid lightness, so shadows and blown highlights barely count
                const score = sat * (1 - Math.abs(light - 0.5) * 1.6)
                if (score <= 0) continue

                const bucket = Math.floor(hue / 15) % 24

                weight[bucket] += score
                saturation[bucket] += sat * score
            }

            let best = -1
            let top = 0

            for (let i = 0; i < 24; i++) {
                if (weight[i] > top) {
                    top = weight[i]
                    best = i
                }
            }

            if (best < 0) return resolve(null)

            // hold the saturation inside a readable band: raw cover values run either
            // washed out or neon, and both make the accent unusable as a text colour
            const mean = saturation[best] / weight[best]

            resolve([best * 15 + 7.5, Math.round(Math.min(Math.max(mean, 0.3), 0.72) * 100)])
        }

        image.src = src
    })
}

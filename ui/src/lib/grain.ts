// a little static noise over the top keeps the gradients from banding
let grain = ''

export function grain_url() {
    if (grain) return grain

    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128

    const ctx = canvas.getContext('2d')!
    const image = ctx.createImageData(128, 128)

    for (let i = 0; i < image.data.length; i += 4) {
        const v = Math.random() * 255
        image.data[i] = image.data[i + 1] = image.data[i + 2] = v
        image.data[i + 3] = 26
    }

    ctx.putImageData(image, 0, 0)
    grain = canvas.toDataURL()

    return grain
}

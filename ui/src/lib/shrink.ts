// what lib/thumbs keeps: a cover's short side, in pixels. a cover drawn as a
// list row's forty-pixel square has no use for 512 of them - every extra pixel
// is decoded again whenever the row first comes into view - so there are three
export const THUMB_EDGES = { sm: 128, md: 320, lg: 512 } as const
export type ThumbSize = keyof typeof THUMB_EDGES

function as_bytes(data: string) {
    const text = atob(data)
    const bytes = new Uint8Array(text.length)

    for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i)

    return bytes
}

// one picture, as base64, a whole data url or an object url, shrunk to a jpeg whose short side
// is `edge`. it runs in a worker or on the page, whichever is there
export async function shrink_to_blob(data: string, edge: number): Promise<Blob> {
    // a data url, or an object url of a bigger cut (lib/thumbs), is fetched; bare base64 is decoded
    const original = /^(data|blob):/.test(data) ? await (await fetch(data)).blob() : new Blob([as_bytes(data)])

    try {
        const bitmap = await createImageBitmap(original)
        const scale = Math.min(1, edge / Math.min(bitmap.width, bitmap.height))

        // already small: re-encoding would only cost quality
        if (scale === 1) {
            bitmap.close()
            return original
        }

        const width = Math.round(bitmap.width * scale)
        const height = Math.round(bitmap.height * scale)

        if (typeof OffscreenCanvas !== 'undefined') {
            const canvas = new OffscreenCanvas(width, height)
            const ctx = canvas.getContext('2d')
            if (!ctx) throw new Error('no 2d context')

            ctx.imageSmoothingQuality = 'high'
            ctx.drawImage(bitmap, 0, 0, width, height)
            bitmap.close()

            return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 })
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('no 2d context')

        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(bitmap, 0, 0, width, height)
        bitmap.close()

        return (await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))) ?? original
    } catch {
        // whatever the decoder made of it, the bytes as they are still beat a data url
        return original
    }
}

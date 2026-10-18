import { shrink_to_blob } from './shrink'

// the covers' shrinking, off the ui thread: decoding a 1280x720 png and
// encoding a jpeg is tens of milliseconds a cover, and a library arrives
// sixty-odd covers at a time
self.onmessage = async (event: MessageEvent<{ id: number; data: string; edge: number }>) => {
    const { id, data, edge } = event.data

    try {
        self.postMessage({ id, blob: await shrink_to_blob(data, edge) })
    } catch {
        self.postMessage({ id, blob: null })
    }
}

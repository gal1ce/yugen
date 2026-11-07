import type { ThumbSize } from './shrink'

/*
 * The shrunk covers (lib/thumbs), kept on disk from one launch to the next.
 * The tags hand over the whole picture every time and shrinking it is the
 * slow part of coming up - on a phone, the page's own thread, about half a
 * second a cover - so a cover is shrunk once and read back after that.
 *
 * Keyed by a digest of the picture itself, so the same sleeve on a whole
 * album is kept once, and a file whose picture changed is a new key. Where
 * there is no IndexedDB, no digest, or the disk will not answer in time,
 * nothing is kept and every cover is shrunk as before.
 */
const NAME = 'yugen-thumbs'
const STORE = 'thumbs'
const WAIT_MS = 1000

let opened: Promise<IDBDatabase | null> | undefined
const digests = new Map<string, Promise<string | null>>()

function db() {
    opened ??= new Promise((done) => {
        setTimeout(() => done(null), WAIT_MS)
        try {
            const ask = indexedDB.open(NAME, 1)
            ask.onupgradeneeded = () => ask.result.createObjectStore(STORE)
            ask.onsuccess = () => done(ask.result)
            ask.onerror = ask.onblocked = () => done(null)
        } catch {
            done(null)
        }
    })

    return opened
}

function digest_of(data: string) {
    let digest = digests.get(data)

    if (!digest) {
        digest = (async () => {
            try {
                const sum = new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(data)))
                return Array.from(sum, (byte) => byte.toString(16).padStart(2, '0')).join('')
            } catch {
                return null
            }
        })()
        digests.set(data, digest)
    }

    return digest
}

async function key_of(data: string, size: ThumbSize) {
    const digest = await digest_of(data)
    return digest && `${size}:${digest}`
}

export async function kept(data: string, size: ThumbSize): Promise<Blob | null> {
    const [store, key] = await Promise.all([db(), key_of(data, size)])
    if (!store || !key) return null

    return new Promise((done) => {
        setTimeout(() => done(null), WAIT_MS)
        try {
            const ask = store.transaction(STORE).objectStore(STORE).get(key)
            ask.onsuccess = () => done(ask.result instanceof Blob ? ask.result : null)
            ask.onerror = () => done(null)
        } catch {
            done(null)
        }
    })
}

export async function keep(data: string, size: ThumbSize, blob: Blob) {
    const [store, key] = await Promise.all([db(), key_of(data, size)])
    if (!store || !key) return

    try {
        store.transaction(STORE, 'readwrite').objectStore(STORE).put(blob, key)
    } catch {
        // a full disk: the cover is shrunk again next time
    }
}

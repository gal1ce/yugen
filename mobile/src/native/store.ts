import { File, Paths } from 'expo-file-system'

/*
 * The desktop keeps its state as json files in ~/.config/yugen. The phone
 * keeps the same files, the same shapes, in the app's own documents - so a
 * playlists.json or a liked_songs.json carried over from a desktop reads the
 * same here.
 */

const cache = new Map<string, unknown>()

const file_of = (name: string) => new File(Paths.document, name)

export async function load<T>(name: string, fallback: T): Promise<T> {
    if (cache.has(name)) return cache.get(name) as T

    let value = fallback
    try {
        const file = file_of(name)
        if (file.exists) value = JSON.parse(await file.text()) as T
    } catch {
        value = fallback
    }

    cache.set(name, value)
    return value
}

// writes go one after another, so a quick like-unlike never lands out of order
let writing: Promise<void> = Promise.resolve()

export function save<T>(name: string, value: T) {
    cache.set(name, value)
    writing = writing.then(async () => {
        try {
            const file = file_of(name)
            if (!file.exists) file.create()
            await file.write(JSON.stringify(value))
        } catch (e) {
            console.warn(`could not write ${name}`, e)
        }
    })
    return writing
}

// read, change, write back - the desktop's load/edit/save, in one step
export async function update<T>(name: string, fallback: T, change: (value: T) => T | void) {
    const value = await load(name, fallback)
    const next = change(value) ?? value
    await save(name, next)
    return next
}

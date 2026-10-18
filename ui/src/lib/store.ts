import { useRef, useSyncExternalStore } from 'react'

/*
 * A store is one object, and a component reads the slice of it it draws.
 *
 * The old ui kept everything in one component, so anything that changed - the
 * position once a second, a tooltip, a menu opening - rendered all of it. Here
 * a component subscribes to what it picks out and nothing else: a slice that
 * comes back equal to the last one is the same snapshot, and react skips it.
 */
export type Store<T> = {
    get: () => T
    set: (patch: Partial<T> | ((state: T) => Partial<T>)) => void
    subscribe: (listener: () => void) => () => void
}

export function create_store<T extends object>(initial: T): Store<T> {
    let state = initial
    const listeners = new Set<() => void>()

    return {
        get: () => state,
        set(patch) {
            const next = typeof patch === 'function' ? patch(state) : patch
            const changed = Object.keys(next).some(
                (key) => !Object.is(state[key as keyof T], next[key as keyof T]),
            )

            if (!changed) return

            state = { ...state, ...next }
            for (const listener of listeners) listener()
        },
        subscribe(listener) {
            listeners.add(listener)

            return () => listeners.delete(listener)
        },
    }
}

// one level deep: what a picker that builds an object or an array hands back is
// new every time, and only what is inside it says whether it changed
export function shallow<T>(a: T, b: T) {
    if (Object.is(a, b)) return true
    if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false

    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((item, i) => Object.is(item, b[i]))
    }

    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return false

    return keys.every((key) => Object.is(a[key as keyof T], b[key as keyof T]))
}

export function useStore<T, U>(
    store: Store<T>,
    pick: (state: T) => U,
    equal: (a: U, b: U) => boolean = Object.is,
): U {
    // the last slice handed out. a picker that builds a new array or object
    // each time hands back this one while it is still equal, which is what
    // keeps useSyncExternalStore from seeing a change that is not there
    const held = useRef<{ value: U } | null>(null)

    const snapshot = () => {
        const next = pick(store.get())

        if (held.current && equal(held.current.value, next)) return held.current.value

        held.current = { value: next }

        return next
    }

    return useSyncExternalStore(store.subscribe, snapshot, snapshot)
}

// the last answer, kept for as long as it is asked with the same arguments.
// derived lists are read from many places in one render; they are worked out once
export function memo_last<A extends unknown[], R>(work: (...args: A) => R) {
    let last: { args: A; value: R } | null = null

    return (...args: A) => {
        if (last && last.args.length === args.length && last.args.every((arg, i) => Object.is(arg, args[i]))) {
            return last.value
        }

        const value = work(...args)
        last = { args, value }

        return value
    }
}

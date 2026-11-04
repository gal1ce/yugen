import { useEffect, useState } from 'react'

// a phone held upright: no room for side columns, so the window becomes one
// page with the player and the sections floating over its foot. the same
// width as tailwind's `sm`, so `max-sm:` utilities and this agree
export const PHONE = '(max-width: 639.98px)'

export function usePhone() {
    const [phone, set_phone] = useState(() => window.matchMedia(PHONE).matches)

    useEffect(() => {
        const query = window.matchMedia(PHONE)
        const on_change = () => set_phone(query.matches)

        query.addEventListener('change', on_change)
        return () => query.removeEventListener('change', on_change)
    }, [])

    return phone
}

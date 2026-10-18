// the collection's size in time: hours once there are any, minutes below that
export function format_span(seconds: number) {
    if (!seconds) return ''

    const hours = Math.floor(seconds / 3600)
    const minutes = Math.round((seconds % 3600) / 60)

    return hours ? `${hours}h ${minutes}m` : `${minutes}m`
}

export function format_time(seconds: number) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
}

export function format_date(seconds: number) {
    if (!seconds) return '--'

    const days = Math.floor((Date.now() / 1000 - seconds) / 86400)

    if (days <= 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 30) return `${days} days ago`

    return new Date(seconds * 1000).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    })
}

// seven figures of listeners is a number nobody reads a digit of: what the line
// is for is the size of the thing, so the locale's own short form is what goes in
export const counted = new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
})

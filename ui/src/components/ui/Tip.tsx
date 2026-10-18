import { useEffect, useLayoutEffect, useRef, useState } from 'react'

type Tip = { text: string; x: number; y: number; below: boolean }

/*
 * One tooltip for the whole app, delegated off [data-tip] and placed against
 * the viewport. It owns its state, so a cursor crossing a row of cards renders
 * this one box and nothing underneath it.
 */
export function TipLayer() {
    const [tip, set_tip] = useState<Tip | null>(null)
    const box = useRef<HTMLDivElement>(null)

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined
        let host: HTMLElement | null = null

        const hide = () => {
            clearTimeout(timer)
            host = null
            set_tip(null)
        }

        const over = (e: PointerEvent) => {
            const target = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-tip]') ?? null
            if (target === host) return

            clearTimeout(timer)
            host = target

            const text = target?.dataset.tip
            if (!target || !text) return set_tip(null)

            // the pause before it shows is what keeps it from strobing across
            // a row of buttons
            timer = setTimeout(() => {
                const rect = target.getBoundingClientRect()
                const below = rect.top < 72

                set_tip({ text, x: rect.left + rect.width / 2, y: below ? rect.bottom + 8 : rect.top - 8, below })
            }, 450)
        }

        document.addEventListener('pointerover', over)
        document.addEventListener('pointerdown', hide)
        document.addEventListener('scroll', hide, true)
        window.addEventListener('blur', hide)

        return () => {
            clearTimeout(timer)
            document.removeEventListener('pointerover', over)
            document.removeEventListener('pointerdown', hide)
            document.removeEventListener('scroll', hide, true)
            window.removeEventListener('blur', hide)
        }
    }, [])

    // a tooltip near either edge slides back into the window
    useLayoutEffect(() => {
        const node = box.current
        if (!node || !tip) return

        const half = node.getBoundingClientRect().width / 2
        node.style.left = `${Math.min(Math.max(tip.x, half + 8), window.innerWidth - half - 8)}px`
    }, [tip])

    if (!tip) return null

    return (
        <div ref={box} role='tooltip' className={`tip${tip.below ? ' below' : ''}`} style={{ left: tip.x, top: tip.y }}>
            {tip.text}
        </div>
    )
}

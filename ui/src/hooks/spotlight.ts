// a light in the accent that follows the pointer over a surface (the
// `spotlight` utility). the position is written as custom properties, straight
// onto the element - a pointer move is never a render
export const spotlight = {
    onPointerMove(e: React.PointerEvent<HTMLElement>) {
        const box = e.currentTarget.getBoundingClientRect()
        const style = e.currentTarget.style

        style.setProperty('--spot-x', `${e.clientX - box.left}px`)
        style.setProperty('--spot-y', `${e.clientY - box.top}px`)
        style.setProperty('--spot-a', '9%')
    },
    onPointerLeave(e: React.PointerEvent<HTMLElement>) {
        e.currentTarget.style.setProperty('--spot-a', '0%')
    },
}

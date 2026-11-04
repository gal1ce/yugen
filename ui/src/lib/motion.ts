import { MotionGlobalConfig } from 'motion/react'

/*
 * How things move, in one place. These are springs the way ios uses them: a
 * duration you can see and a little bounce or none, so a menu or a sheet
 * arrives with weight and settles. motion keeps the velocity when a spring is
 * retargeted mid-flight, which is what makes them interruptible - a sheet
 * flicked back while it is still opening turns round from where it is,
 * at the speed it had.
 *
 * Every one of them is scaled by the pace picked in settings: slow stretches
 * them, fast shortens them, off skips animation altogether. The css side is
 * scaled to match - each transition and keyframe the page starts is given the
 * same playback rate as it begins - so the whole window keeps one tempo.
 */
let pace = 1

const make = (visualDuration: number, bounce: number) => ({ type: 'spring' as const, visualDuration: visualDuration * (pace || 1), bounce })

export const spring = {
    // small things that answer a press: toggles, segments, the nav pill
    get snappy() {
        return make(0.26, 0.14)
    },
    // things that appear: menus, popovers, pages
    get smooth() {
        return make(0.38, 0.06)
    },
    // a sheet covering the window
    get sheet() {
        return make(0.55, 0.06)
    },
}

// a duration in seconds, at the pace
export const paced = (seconds: number) => seconds * (pace || 1)

function rate(event: Event) {
    if (pace === 1 || pace === 0) return

    const target = event.target as Element
    const name = event.type === 'transitionrun' ? (event as TransitionEvent).propertyName : (event as AnimationEvent).animationName

    for (const animation of target.getAnimations?.() ?? []) {
        const own =
            animation instanceof CSSTransition ? animation.transitionProperty === name : animation instanceof CSSAnimation ? animation.animationName === name : false

        if (own) animation.playbackRate = 1 / pace
    }
}

document.addEventListener('transitionrun', rate, true)
document.addEventListener('animationstart', rate, true)

export function set_pace(factor: number) {
    pace = factor
    MotionGlobalConfig.skipAnimations = factor === 0
}

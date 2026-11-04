import { useEffect } from 'react'
import { useStore } from '../lib/store'
import { configure } from '../lib/smooth'
import { ui } from '../state/ui'

export { glide_to } from '../lib/smooth'

// the wheel follows the settings page as it changes, without a restart
export function useSmoothPrefs() {
    const mode = useStore(ui, (s) => s.scrolling)
    const feel = useStore(ui, (s) => s.feel)

    useEffect(() => configure({ mode, feel }), [mode, feel])
}

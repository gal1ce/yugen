import { bridge, music_dir } from '../lib/bridge'
import { library } from './library'
import { ui, type CropFor } from './ui'

// read straight into a data url: the webview's file input has no real path to
// hand over (that is an electron extension, not something webkitgtk has), so
// the bytes travel as base64
function read_as_data_url(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsDataURL(file)
    })
}

// a picked file does not go straight to whatever asked for it: it opens the
// crop window first, and only what is framed there is ever written
export async function pick_image(e: React.ChangeEvent<HTMLInputElement>, target: CropFor) {
    const file = e.currentTarget.files?.[0]
    e.currentTarget.value = ''
    if (!file) return

    ui.set({ crop: { src: await read_as_data_url(file), for: target } })
}

// a profile picture is stored as the whole data url - the mime type varies and
// travels with it - but a cover is bare base64, the same as one off a file's tags
const raw_base64 = (data_url: string) => data_url.slice(data_url.indexOf(',') + 1)

export async function save_crop(data_url: string) {
    const crop = ui.get().crop
    if (!crop) return

    ui.set({ crop_busy: true })

    try {
        const target = crop.for

        if (target.kind === 'avatar') {
            if (await bridge().set_profile_picture(data_url)) {
                library.set({ profile_pic: await bridge().get_profile_picture() })
            }
        } else if (target.kind === 'track') {
            const path = (await music_dir()) + target.name

            // read back the way the scan does, so the picture in hand is the one
            // every listing would fetch
            if (await bridge().update_track_cover(path, raw_base64(data_url))) {
                const saved = await bridge().get_cover(path)
                library.set(({ covers }) => ({ covers: { ...covers, [target.name]: saved } }))
            }
        } else if (await bridge().set_playlist_cover(target.name, raw_base64(data_url))) {
            const saved = await bridge().get_playlist_cover(target.name)
            library.set(({ playlist_covers }) => ({ playlist_covers: { ...playlist_covers, [target.name]: saved } }))
        }

        ui.set({ crop: null })
    } finally {
        ui.set({ crop_busy: false })
    }
}

/*
 * The right-click menu closes on the very click that would open a picker inside
 * it, and an unmounted input never reports what was chosen. So the one for
 * track covers lives outside the menu (see App) and is opened through this.
 */
let cover_input: HTMLInputElement | null = null
let cover_target = ''

export const cover_input_ref = (node: HTMLInputElement | null) => {
    cover_input = node
}

export function choose_track_cover(name: string) {
    cover_target = name
    cover_input?.click()
}

export const track_cover_target = () => cover_target

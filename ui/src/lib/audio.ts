import { bridge } from './bridge'
import { player } from '../state/player'

/*
 * The sound, as something to draw.
 *
 * The audio never passes through the page - miniaudio plays it on the far side
 * - so the only way to see it is for the backend to hand over what it just
 * mixed. get_audio_frames does that when it is there: the newest frames, mono,
 * and this side does the rest, the way cava does - a windowed fft, the bins
 * gathered into bands spaced the way hearing is, and each band rising at once
 * and falling slowly, so the shape reads as music rather than as noise.
 *
 * Without the binding the bands breathe on their own while a track plays. It
 * is a slow swell that follows nothing, and `live` says so, so whatever draws
 * it can keep it quiet.
 */
const SIZE = 2048
export const BANDS = 64

const LOW = 40
const HIGH = 14000

export const spectrum = {
    bands: new Float32Array(BANDS),
    // the whole of it, the low end on its own, and whether the low end just hit
    level: 0,
    bass: 0,
    beat: false,
    live: false,
}

let available: boolean | null = null
let rate = 48000
let asking = false
let last_ask = 0
let bass_mean = 0
let last_beat = 0
const target = new Float32Array(BANDS)

const window_fn = Float32Array.from({ length: SIZE }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (SIZE - 1)))
const re = new Float32Array(SIZE)
const im = new Float32Array(SIZE)

// the band edges, in fft bins: equal steps of log frequency
const edges = (sample_rate: number) =>
    Array.from({ length: BANDS + 1 }, (_, i) => {
        const hz = LOW * (HIGH / LOW) ** (i / BANDS)
        return Math.max(1, Math.min(SIZE / 2 - 1, Math.round((hz / sample_rate) * SIZE)))
    })

let bins = edges(rate)

function available_now() {
    if (available !== null) return available

    try {
        available = typeof bridge().get_audio_frames === 'function'
    } catch {
        available = false
    }

    if (available && typeof bridge().get_sample_rate === 'function') {
        void bridge()
            .get_sample_rate!()
            .then((value) => {
                if (value > 0) {
                    rate = value
                    bins = edges(rate)
                }
            })
            .catch(() => {})
    }

    return available
}

// an in-place radix-2 fft over re/im
function fft() {
    for (let i = 1, j = 0; i < SIZE; i++) {
        let bit = SIZE >> 1
        for (; j & bit; bit >>= 1) j ^= bit
        j ^= bit

        if (i < j) {
            ;[re[i], re[j]] = [re[j], re[i]]
            ;[im[i], im[j]] = [im[j], im[i]]
        }
    }

    for (let len = 2; len <= SIZE; len <<= 1) {
        const angle = (-2 * Math.PI) / len
        const wr = Math.cos(angle)
        const wi = Math.sin(angle)

        for (let i = 0; i < SIZE; i += len) {
            let cr = 1
            let ci = 0

            for (let k = 0; k < len / 2; k++) {
                const a = i + k
                const b = a + len / 2
                const tr = re[b] * cr - im[b] * ci
                const ti = re[b] * ci + im[b] * cr

                re[b] = re[a] - tr
                im[b] = im[a] - ti
                re[a] += tr
                im[a] += ti

                const next = cr * wr - ci * wi
                ci = cr * wi + ci * wr
                cr = next
            }
        }
    }
}

function analyse(frames: number[]) {
    const offset = Math.max(0, frames.length - SIZE)

    for (let i = 0; i < SIZE; i++) {
        re[i] = (frames[offset + i] ?? 0) * window_fn[i]
        im[i] = 0
    }

    fft()

    for (let band = 0; band < BANDS; band++) {
        let sum = 0
        const from = bins[band]
        const to = Math.max(from + 1, bins[band + 1])

        for (let bin = from; bin < to; bin++) sum += Math.hypot(re[bin], im[bin])

        const magnitude = (sum / (to - from)) * (4 / SIZE)
        // -66 dB is silence, 0 dB is a full-scale tone; the highs are lifted a
        // little, since music carries far less energy up there than it sounds
        const db = 20 * Math.log10(magnitude + 1e-9) + (band / BANDS) * 9
        target[band] = Math.min(1, Math.max(0, (db + 66) / 60))
    }

    spectrum.live = true
}

// cava's gravity: up at once, down slowly
function settle(dt: number) {
    const fall = Math.exp(-dt * 7)
    let level = 0
    let bass = 0

    for (let band = 0; band < BANDS; band++) {
        const now = spectrum.bands[band]
        const next = target[band] > now ? now + (target[band] - now) * 0.65 : now * fall + target[band] * (1 - fall)

        spectrum.bands[band] = next
        level += next
        if (band < 8) bass += next
    }

    spectrum.level = level / BANDS
    spectrum.bass = bass / 8

    // a hit is the low end jumping clear of where it has been sitting
    const at = performance.now()
    bass_mean = bass_mean * 0.95 + spectrum.bass * 0.05
    spectrum.beat = spectrum.live && spectrum.bass > 0.32 && spectrum.bass > bass_mean * 1.35 && at - last_beat > 280
    if (spectrum.beat) last_beat = at
}

function breathe(now: number) {
    const t = now / 1000

    for (let band = 0; band < BANDS; band++) {
        const x = band / BANDS
        target[band] = 0.16 + 0.1 * Math.sin(t * 0.9 + x * 7) * Math.sin(t * 0.37 + x * 3) + 0.05 * Math.sin(t * 1.7 - x * 11)
    }
}

/*
 * One step, called by whatever is drawing - once a frame however many of them
 * call it. One request is in the air at a time: a slow answer costs frames, it
 * never piles up behind itself.
 */
let stepped = 0

export function step_audio(now: number, dt: number) {
    if (now - stepped < 8) return
    stepped = now

    const { current, paused } = player.get()

    if (!current || paused) target.fill(0)
    else if (available_now()) {
        if (!asking && now - last_ask > 30) {
            asking = true
            last_ask = now

            bridge()
                .get_audio_frames!(SIZE)
                .then(analyse)
                .catch(() => {
                    available = false
                    spectrum.live = false
                })
                .finally(() => (asking = false))
        }
    } else {
        spectrum.live = false
        breathe(now)
    }

    settle(dt)
}

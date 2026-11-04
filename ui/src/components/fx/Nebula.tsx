import { useEffect, useRef } from 'react'
import { add_painter, fx, reduced } from '../../lib/fx'
import { useStore } from '../../lib/store'

/*
 * The nebula behind the pages: a ray-marched cloud of light, slowly turning,
 * the InteractiveNebulaShader's fragment shader as it was supplied.
 *
 * It is not built on three.js. The shader is one full-screen triangle and
 * eight uniforms, which raw WebGL2 does in a page of code; three would add
 * ~600 KB to the bundle and its own animation loop, and here frames must come
 * from the page's beat (lib/fx): with chromium's frame limit off, a loop of
 * its own would run thousands of times a second. So the shader is the same,
 * and only the plumbing around it is this app's.
 *
 * What changed in the shader itself:
 * - its colours: the original picked one of three palettes from two reminder
 *   flags, which mean nothing here. It takes the cover's colours instead
 *   (fx.palette, strongest first): the deep tone and the glow are mixed from
 *   the first two, so the cloud is the colour of what is playing. With no
 *   cover it is the shader's own default teal and rose.
 * - its alpha: the cloud is drawn as light on nothing (alpha is its
 *   brightness), so it lights a dark panel and tints a light one, rather
 *   than covering either with black.
 * - the unused iMouse is gone, and the cloud is centred on the page rather
 *   than pinned to the left of a wide one;
 * - highp, not mediump: on some of ANGLE's backends mediump is a 16-bit
 *   float, and the clock passing a few hundred seconds turned every sin(t)
 *   into steps - the cloud went jerky minutes in and smooth again on a track
 *   change, which rebuilt it with the clock back at the start.
 *
 * It is drawn at a third of the css resolution and stretched by the
 * compositor: the cloud has no edges to lose, and a frame costs a ninth of
 * the pixels. Sixty frames a second (thirty when motion is calm); none while
 * the window is hidden, the lyrics page covers it, or motion is off - then it
 * is drawn once and holds. Never from a worker (lib/engine).
 */
const VERTEX = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec3 uDeep;
uniform vec3 uGlow;
uniform float uTinted;
uniform bool disableCenterDimming;
out vec4 fragColor;

#define t iTime
mat2 m(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
float map(vec3 p){
    p.xz *= m(t*0.4);
    p.xy *= m(t*0.3);
    vec3 q = p*2. + t;
    return length(p + vec3(sin(t*0.7))) * log(length(p)+1.0)
         + sin(q.x + sin(q.z + sin(q.y))) * 0.5 - 1.0;
}

void mainImage(out vec4 O, in vec2 fragCoord) {
    // centred on the canvas: the original put the cloud's middle half the
    // short side in from the left, which on a wide page pinned it left
    vec2 uv = (fragCoord - iResolution * 0.5) / min(iResolution.x, iResolution.y);
    vec3 col = vec3(0.0);
    float d = 2.5;

    // the supplied default palette, or the cover's
    vec3 deep = mix(vec3(0.1,0.3,0.4), uDeep, uTinted);
    vec3 glow = mix(vec3(5.0,2.5,3.0), uGlow, uTinted);

    for (int i = 0; i <= 5; i++) {
        vec3 p = vec3(0,0,5.) + normalize(vec3(uv, -1.)) * d;
        float rz = map(p);
        float f  = clamp((rz - map(p + 0.1)) * 0.5, -0.1, 1.0);
        vec3 base = deep + glow*f;
        col = col * base + smoothstep(2.5, 0.0, rz) * 0.7 * base;
        d += min(rz, 1.0);
    }

    float dist   = distance(fragCoord, iResolution*0.5);
    float radius = min(iResolution.x, iResolution.y) * 0.5;
    float dim    = disableCenterDimming ? 1.0 : smoothstep(radius*0.3, radius*0.5, dist);

    O = vec4(col, 1.0);
    if (!disableCenterDimming) O.rgb = mix(O.rgb * 0.3, O.rgb, dim);
}

void main() {
    vec4 c;
    mainImage(c, gl_FragCoord.xy);
    // light on nothing: premultiplied, as bright as it is opaque
    vec3 rgb = clamp(c.rgb, 0.0, 1.0);
    fragColor = vec4(rgb, max(rgb.r, max(rgb.g, rgb.b)));
}`

// the scale the cloud is drawn at, against css pixels
const SCALE = 1 / 3

// an hsl() from lib/palette as linear-ish rgb 0..1
function rgb_of(colour: string | undefined): [number, number, number] | null {
    const match = colour?.match(/hsl\((\d+)\s+(\d+)%\s+(\d+)%\)/)
    if (!match) return null

    const h = Number(match[1]) / 360
    const s = Number(match[2]) / 100
    const l = Number(match[3]) / 100
    const k = (n: number) => (n + h * 12) % 12
    const a = s * Math.min(l, 1 - l)
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))

    return [f(0), f(8), f(4)]
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader')
    return shader
}

export function Nebula({ className, strength = 1, dimmed = true }: { className?: string; strength?: number; dimmed?: boolean }) {
    const ref = useRef<HTMLCanvasElement>(null)
    const motion = useStore(fx, (s) => s.motion)
    const palette = useStore(fx, (s) => s.palette)
    // the cloud's clock outlives the canvas being set up again, so a change of
    // motion setting carries on from where it was
    const clock = useRef(8)
    // the colours are set from outside the drawing loop: a new track recolours
    // the cloud without tearing the program down and starting the clock over
    const tint = useRef<(palette: string[]) => void>(() => {})

    useEffect(() => {
        const canvas = ref.current
        const gl = canvas?.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false })
        if (!canvas || !gl) return

        let program: WebGLProgram
        try {
            program = gl.createProgram()!
            gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
            gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT))
            gl.linkProgram(program)
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return
        } catch {
            return
        }

        gl.useProgram(program)

        // one triangle that covers the screen
        const buffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
        const at = gl.getAttribLocation(program, 'a_pos')
        gl.enableVertexAttribArray(at)
        gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0)

        const u = (name: string) => gl.getUniformLocation(program, name)
        const u_res = u('iResolution')
        const u_time = u('iTime')

        // the cover's colours: the deepest of the first two as the tone, the
        // other, pushed bright, as the glow the shader multiplies up
        // set once the draw below exists: a still cloud is drawn again in its new colours
        let redraw = () => {}

        tint.current = (colours: string[]) => {
            const first = rgb_of(colours[0])
            const second = rgb_of(colours[1]) ?? first

            gl.useProgram(program)
            gl.uniform1f(u('uTinted'), first ? 0.85 : 0)
            if (first && second) {
                gl.uniform3f(u('uDeep'), first[0] * 0.35, first[1] * 0.35, first[2] * 0.35)
                gl.uniform3f(u('uGlow'), second[0] * 5.5, second[1] * 5.5, second[2] * 5.5)
            }

            redraw()
        }
        tint.current(fx.get().palette)
        gl.uniform1i(u('disableCenterDimming'), dimmed ? 0 : 1)

        let width = 0
        let height = 0

        const resize = () => {
            const box = canvas.getBoundingClientRect()
            width = Math.max(1, Math.round(box.width * SCALE))
            height = Math.max(1, Math.round(box.height * SCALE))
            canvas.width = width
            canvas.height = height
            gl.viewport(0, 0, width, height)
            gl.uniform2f(u_res, width, height)
        }

        resize()
        const sized = new ResizeObserver(() => {
            resize()
            draw(clock.current)
        })
        sized.observe(canvas)

        // the shader's own clock (above) is advanced by frames rather than read
        // off the wall, so a pause holds the picture and a resume carries on
        const draw = (seconds: number) => {
            gl.uniform1f(u_time, seconds)
            gl.drawArrays(gl.TRIANGLES, 0, 3)
        }

        redraw = () => draw(clock.current)

        const still = motion === 'off' || reduced()
        const stop = still
            ? (draw(clock.current), () => {})
            : add_painter(
                  motion === 'calm' ? 30 : 60,
                  (_, dt) => {
                      clock.current += dt * (motion === 'calm' ? 0.5 : 1)
                      draw(clock.current)
                  },
                  { page: true },
              )

        return () => {
            stop()
            tint.current = () => {}
            sized.disconnect()
            gl.deleteBuffer(buffer)
            gl.deleteProgram(program)
        }
    }, [motion, dimmed])

    // a new track: new colours, the same cloud
    useEffect(() => tint.current(palette), [palette])

    return <canvas ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 size-full ${className ?? ''}`} style={{ opacity: strength }} />
}

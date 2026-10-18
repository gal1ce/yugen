import { CELL_H, CELL_W, DOTS, GLYPHS, atlas_canvas, type FieldOptions } from './field'

/*
 * The glyph field on the gpu: the same picture field.ts draws one character at
 * a time, worked out per pixel in a fragment shader instead. The two crossing
 * waves and which character a cell shows run on the gpu in one draw, so a
 * frame costs the cpu a handful of uniforms whatever the refresh rate. 2D
 * drawImage of thousands of cells, by contrast, cost a core and a half at
 * 165 Hz.
 *
 * The characters are drawn once, white, into an atlas texture; the colour is
 * the shader's. Which character a cell shows changes now and then - a hash of
 * the cell and a step of time, rather than the 2D version's per-frame coin
 * toss, which a shader has no memory for.
 */
const VERTEX = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`

const FRAGMENT = `#version 300 es
precision highp float;
uniform vec2 u_size;          // css px
uniform float u_dpr;
uniform float u_time;
uniform float u_glow;
uniform float u_ceiling;
uniform float u_fade;
uniform vec3 u_base;
uniform sampler2D u_atlas;
uniform float u_glyphs;
uniform float u_dots;
out vec4 colour;

const vec2 CELL = vec2(${CELL_W}.0, ${CELL_H}.0);

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
    vec2 p = vec2(gl_FragCoord.x, u_size.y * u_dpr - gl_FragCoord.y) / u_dpr;
    vec2 cell = floor(p / CELL);
    vec2 origin = cell * CELL;
    vec2 local = p - origin;

    // smoothstep wants its edges in order in glsl, so the fall is written as a rise turned over
    float falloff = u_fade > 0.5 ? 1.0 - smoothstep(u_size.y * 0.35, u_size.y * 0.98, origin.y) : 1.0;
    if (falloff < 0.02) discard;

    // two slow waves crossing: bright ridges where they agree, nothing between
    float w1 = sin(origin.x * 0.0072 + u_time * 0.32 + sin(origin.y * 0.0041 - u_time * 0.17) * 2.3);
    float w2 = sin((origin.x * 0.7 - origin.y) * 0.0048 - u_time * 0.21);
    float wave = w1 * 0.62 + w2 * 0.38;
    float band = smoothstep(0.12, 0.9, wave);
    float fringe = smoothstep(-0.45, 0.4, wave) * 0.13;

    float lit = min(1.0, (band * 0.6 + fringe) * u_glow);
    if (lit < 0.04) discard;

    // which character: one now and then
    float pick = hash(cell + floor(u_time * 0.06 + hash(cell * 1.7) * 9.0));
    float index = lit < 0.16 ? (lit < 0.09 ? 0.0 : 1.0) : u_dots + floor(pick * u_glyphs);

    vec2 uv = vec2((index * CELL.x + local.x) / ((u_dots + u_glyphs) * CELL.x), local.y / CELL.y);
    float a = lit * u_ceiling * falloff * texture(u_atlas, uv).a;
    if (a < 0.003) discard;

    colour = vec4(u_base * a, a);
}`

// a css colour as 0..1 rgb, read by painting it: the shader has no parser
function rgb(colour: string): [number, number, number] {
    const probe = atlas_canvas(1, 1)
    const ctx = probe.getContext('2d') as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D
    ctx.fillStyle = colour
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data

    return [r / 255, g / 255, b / 255]
}

function compile(gl: WebGL2RenderingContext, type: number, source: string) {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'shader')

    return shader
}

// null when the engine has no webgl2 here: the 2D field is used then
export function create_gl_field(canvas: OffscreenCanvas | HTMLCanvasElement, options: FieldOptions) {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, antialias: false, alpha: true }) as WebGL2RenderingContext | null
    if (!gl) return null

    const program = gl.createProgram()!
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX))
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT))
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null

    gl.useProgram(program)

    // one triangle over the whole canvas
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const at = gl.getAttribLocation(program, 'a_pos')
    gl.enableVertexAttribArray(at)
    gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0)

    const u = (name: string) => gl.getUniformLocation(program, name)
    let { dpr, ceiling } = options

    // the characters, white, at the device's own pixel density
    const upload_atlas = () => {
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas_canvas_for(DOTS + GLYPHS, dpr) as TexImageSource)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
        gl.uniform1i(u('u_atlas'), 0)
    }

    upload_atlas()

    gl.uniform1f(u('u_glyphs'), GLYPHS.length)
    gl.uniform1f(u('u_dots'), DOTS.length)
    gl.uniform1f(u('u_fade'), options.fade ? 1 : 0)
    gl.uniform3fv(u('u_base'), rgb(options.base))

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)

    let width = 0
    let height = 0
    let clock = 12

    return {
        resize(w: number, h: number, ratio = dpr) {
            const sharper = ratio !== dpr
            width = w
            height = h
            dpr = ratio
            canvas.width = Math.max(1, Math.round(width * dpr))
            canvas.height = Math.max(1, Math.round(height * dpr))
            gl.viewport(0, 0, canvas.width, canvas.height)
            if (sharper) upload_atlas()
        },
        recolour(base: string, next_ceiling: number) {
            gl.uniform3fv(u('u_base'), rgb(base))
            ceiling = next_ceiling
        },
        // level: how loud it is, 0..1
        frame(dt: number, level: number) {
            clock += dt * (1 + level * 2.2)

            gl.uniform2f(u('u_size'), width, height)
            gl.uniform1f(u('u_dpr'), dpr)
            gl.uniform1f(u('u_time'), clock)
            gl.uniform1f(u('u_glow'), 1 + level * 0.9)
            gl.uniform1f(u('u_ceiling'), ceiling)

            gl.clearColor(0, 0, 0, 0)
            gl.clear(gl.COLOR_BUFFER_BIT)
            gl.drawArrays(gl.TRIANGLES, 0, 3)
        },
    }
}

// white characters in a strip, for the atlas texture
function atlas_canvas_for(chars: string, dpr: number) {
    return atlas_canvas(chars.length * CELL_W * dpr, CELL_H * dpr, (ctx) => {
        ctx.scale(dpr, dpr)
        ctx.fillStyle = '#fff'
        ctx.font = `11px ui-monospace, 'DejaVu Sans Mono', monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        for (let i = 0; i < chars.length; i++) ctx.fillText(chars[i], i * CELL_W + CELL_W / 2, CELL_H / 2 + 0.5)
    })
}

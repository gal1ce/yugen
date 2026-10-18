import { create_field, type Field, type FieldMessage } from './field'
import { create_gl_field } from './field_gl'

// the glyph field, off the ui thread. the page sends it a frame when it wants
// one - so it stops whenever the page's own clock stops - and the canvas it
// draws into is the page's, handed over whole
let field: Field | null = null

self.onmessage = (event: MessageEvent<FieldMessage>) => {
    const message = event.data

    if (message.kind === 'init') {
        // the gpu if it is there - one draw a frame - the 2D atlas copies if not
        const gl = (() => {
            try {
                return create_gl_field(message.canvas, message.options)
            } catch {
                return null
            }
        })()
        field = gl ?? create_field(message.canvas, message.options)
        // which way it is drawn, for whoever is looking at the page
        self.postMessage({ mode: gl ? 'gl' : '2d' })
        field.resize(message.width, message.height)
        return
    }

    if (!field) return

    if (message.kind === 'resize') field.resize(message.width, message.height, message.dpr)
    else if (message.kind === 'recolour') field.recolour(message.base, message.ceiling)
    else field.frame(message.dt, message.level)
}

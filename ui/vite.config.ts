import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// the bundle is baked into the binary and served off a saucer:// url, so every
// path in it has to be relative
export default defineConfig({
    base: './',
    plugins: [react(), tailwindcss()],
})

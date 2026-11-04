// The interface is the desktop's own bundle (../ui, built with vite). It is
// copied into the apk's assets at prebuild, and the WebView opens it from
// file:///android_asset/ui/index.html - the way saucer serves it off its own
// scheme on the desktop. Build ui/ first: `npm run build` in ../ui.
const fs = require('node:fs')
const path = require('node:path')
const { withDangerousMod } = require('expo/config-plugins')

module.exports = function withUiAssets(config) {
    return withDangerousMod(config, [
        'android',
        async (config) => {
            const from = path.resolve(config.modRequest.projectRoot, '..', 'ui', 'dist')
            const to = path.join(config.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets', 'ui')

            if (!fs.existsSync(path.join(from, 'index.html'))) {
                throw new Error(`no ui build at ${from} - run \`npm run build\` in ui/ first`)
            }

            fs.rmSync(to, { recursive: true, force: true })
            fs.cpSync(from, to, { recursive: true })
            return config
        },
    ])
}

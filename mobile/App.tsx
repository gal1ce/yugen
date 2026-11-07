import { useCallback, useEffect, useRef, useState, type ComponentType, type Ref } from 'react'
import { BackHandler, StatusBar, StyleSheet, View } from 'react-native'
import { initialWindowMetrics } from 'react-native-safe-area-context'
import { WebView as Bare, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview'
import { Boot } from './src/Boot'
import { answer, type Call } from './src/bridge/host'
import { INJECTED } from './src/bridge/inject'
import { listen_remote } from './src/native/player'
import { keep_current } from './src/native/ytdlp'

// what the page is held by. the package types its WebView as a function
// component without a ref, though it forwards one to the native view
type Handle = { injectJavaScript(script: string): void }
const WebView = Bare as unknown as ComponentType<WebViewProps & { ref?: Ref<Handle> }>

/*
 * The whole app is the desktop's interface (../ui), opened from the apk's
 * assets in a WebView - the phone layout is its own (ui/src/hooks/phone.ts).
 * Everything it asks of the backend comes over the bridge (src/bridge) and is
 * answered here, by the same names main.cpp answers to on the desktop.
 */
const UI = 'file:///android_asset/ui/index.html'
// the palette's ground, under the page before it has drawn
const GROUND = '#100f0e'

/*
 * The system bars' heights, handed to the page before it draws. Edge to edge,
 * the page runs under both, and an android webview reports no safe-area
 * insets of its own: without these the page's head sat under the clock.
 */
const insets = initialWindowMetrics?.insets ?? { top: StatusBar.currentHeight ?? 24, bottom: 0 }
// run before the page exists, maybe before its root element does: written
// once there is one, and never in the way of the bridge after it
const INSETS = `
(() => {
    const put = () => {
        const root = document.documentElement
        if (!root) return false
        root.style.setProperty('--inset-top', '${insets.top}px')
        root.style.setProperty('--inset-bottom', '${insets.bottom}px')
        return true
    }
    if (!put()) document.addEventListener('readystatechange', put, { once: true })
})();
true;
`

// the longest the opening screen waits on the page: past this a scan still
// going is shown going, rather than an app that seems not to open
const BOOT_MAX = 10000

function Window() {
    const view = useRef<Handle>(null)
    const [ready, set_ready] = useState(false)
    const [booting, set_booting] = useState(true)
    const gone = useCallback(() => set_booting(false), [])

    // anything sent into the page goes as one statement, its values as json
    const send = (script: string) => view.current?.injectJavaScript(`${script};true;`)

    useEffect(() => {
        // youtube moves faster than the bundled yt-dlp does
        void keep_current()

        // the lock screen and the notification, told to the page the way
        // mpris tells it on the desktop
        listen_remote(
            (cmd, arg) => send(`window.__yugen_mpris && window.__yugen_mpris(${JSON.stringify(cmd)}, ${arg})`),
            (path) => send(`window.__yugen_now && window.__yugen_now(${JSON.stringify(path)})`),
        )

        // back is escape: it closes the player, the search, a menu or a dialog
        const back = BackHandler.addEventListener('hardwareBackPress', () => {
            send(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
            return true
        })

        const most = setTimeout(() => set_ready(true), BOOT_MAX)

        return () => {
            back.remove()
            clearTimeout(most)
        }
    }, [])

    const on_message = async (event: WebViewMessageEvent) => {
        let call: Call
        try {
            call = JSON.parse(event.nativeEvent.data)
        } catch {
            return
        }

        // the page has its library in and drawn: the opening screen can go
        if (call.method === 'app_ready') set_ready(true)

        const [ok, value] = call.method === 'app_ready' ? [true, null] : await answer(call)
        send(`window.__yugen_reply(${call.id}, ${ok}, ${JSON.stringify(value ?? null)})`)
    }

    return (
        // edge to edge: the page reads the system bars' insets itself (env(safe-area-inset-*)),
        // so the glass at its foot runs down under the gesture bar
        <View style={styles.window}>
            <StatusBar barStyle='light-content' />
            <WebView
                ref={view}
                source={{ uri: UI }}
                originWhitelist={['*']}
                injectedJavaScriptBeforeContentLoaded={INJECTED + INSETS}
                onMessage={on_message}
                // the bundle's module scripts and fonts are files beside the page
                allowFileAccess
                allowFileAccessFromFileURLs
                allowUniversalAccessFromFileURLs
                // the system's font size is the interface's own setting here
                textZoom={100}
                overScrollMode='never'
                // an app, not a document: no pinch, no double-tap zoom
                scalesPageToFit={false}
                setBuiltInZoomControls={false}
                setDisplayZoomControls={false}
                setSupportMultipleWindows={false}
                mediaPlaybackRequiresUserAction={false}
                webviewDebuggingEnabled
                style={styles.page}
            />
            {booting && <Boot ground={GROUND} ready={ready} on_gone={gone} />}
        </View>
    )
}

export default function App() {
    return <Window />
}

const styles = StyleSheet.create({
    window: { flex: 1, backgroundColor: GROUND },
    page: { flex: 1, backgroundColor: GROUND },
})

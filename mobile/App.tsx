import { useEffect, useRef, type ComponentType, type Ref } from 'react'
import { BackHandler, StatusBar, StyleSheet, View } from 'react-native'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView as Bare, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview'

// what the page is held by. the package types its WebView as a function
// component without a ref, though it forwards one to the native view
type Handle = { injectJavaScript(script: string): void }
const WebView = Bare as unknown as ComponentType<WebViewProps & { ref?: Ref<Handle> }>
import { answer, type Call } from './src/bridge/host'
import { INJECTED } from './src/bridge/inject'
import { listen_remote } from './src/native/player'

/*
 * The whole app is the desktop's interface (../ui), opened from the apk's
 * assets in a WebView - the phone layout is its own (ui/src/hooks/phone.ts).
 * Everything it asks of the backend comes over the bridge (src/bridge) and is
 * answered here, by the same names main.cpp answers to on the desktop.
 */
const UI = 'file:///android_asset/ui/index.html'
// the palette's ground, under the page before it has drawn
const GROUND = '#100f0e'

function Window() {
    const view = useRef<Handle>(null)
    const insets = useSafeAreaInsets()

    // anything sent into the page goes as one statement, its values as json
    const send = (script: string) => view.current?.injectJavaScript(`${script};true;`)

    useEffect(() => {
        // the lock screen and the notification, told to the page the way
        // mpris tells it on the desktop
        listen_remote((cmd, arg) => send(`window.__yugen_mpris && window.__yugen_mpris(${JSON.stringify(cmd)}, ${arg})`))

        // back is escape: it closes the player, the search, a menu or a dialog
        const back = BackHandler.addEventListener('hardwareBackPress', () => {
            send(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
            return true
        })

        return () => back.remove()
    }, [])

    const on_message = async (event: WebViewMessageEvent) => {
        let call: Call
        try {
            call = JSON.parse(event.nativeEvent.data)
        } catch {
            return
        }

        const [ok, value] = await answer(call)
        send(`window.__yugen_reply(${call.id}, ${ok}, ${JSON.stringify(value ?? null)})`)
    }

    return (
        <View style={[styles.window, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <StatusBar barStyle='light-content' />
            <WebView
                ref={view}
                source={{ uri: UI }}
                originWhitelist={['*']}
                injectedJavaScriptBeforeContentLoaded={INJECTED}
                onMessage={on_message}
                // the bundle's module scripts and fonts are files beside the page
                allowFileAccess
                allowFileAccessFromFileURLs
                allowUniversalAccessFromFileURLs
                // the system's font size is the interface's own setting here
                textZoom={100}
                overScrollMode='never'
                setSupportMultipleWindows={false}
                mediaPlaybackRequiresUserAction={false}
                androidLayerType='hardware'
                webviewDebuggingEnabled={__DEV__}
                style={styles.page}
            />
        </View>
    )
}

export default function App() {
    return (
        <SafeAreaProvider>
            <Window />
        </SafeAreaProvider>
    )
}

const styles = StyleSheet.create({
    window: { flex: 1, backgroundColor: GROUND },
    page: { flex: 1, backgroundColor: GROUND },
})

import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, View } from 'react-native'

/*
 * The opening screen, held over the page while it reads the library in, so
 * the first thing seen of the app is its own screen with everything on it
 * rather than one filling up. It takes over from the system's splash (the
 * same mark, the same place, app.json) and keeps it moving: the light sinks a
 * little behind its wave and comes up again, slowly, until the page says it
 * is ready (app_ready), then comes up whole and the screen fades off it.
 *
 * Drawn as the mark is cut: a disc that clips, the light a disc of its own
 * moving inside it (sunk, its top is an arc, as a sun going down is), and over the light the wave and the dim water under it
 * (assets/boot-veil.png, from assets/logo.svg).
 */
const SIZE = 104
const SHU = '#e5654a'
const BREATH = 1600

export function Boot({ ground, ready, on_gone }: { ground: string; ready: boolean; on_gone: () => void }) {
    const sink = useRef(new Animated.Value(0)).current
    const shown = useRef(new Animated.Value(1)).current
    const loop = useRef<Animated.CompositeAnimation | null>(null)
    const [still, set_still] = useState(false)

    useEffect(() => {
        let live = true
        void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
            if (!live) return
            if (reduce) return set_still(true)

            // a moment as the splash left it, then the breathing
            loop.current = Animated.loop(
                Animated.sequence([
                    Animated.timing(sink, { toValue: 1, duration: BREATH, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                    Animated.timing(sink, { toValue: 0, duration: BREATH, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                ]),
            )
            Animated.sequence([Animated.delay(300), loop.current]).start()
        })

        return () => {
            live = false
            loop.current?.stop()
        }
    }, [sink])

    useEffect(() => {
        if (!ready) return
        loop.current?.stop()

        Animated.sequence([
            Animated.timing(sink, { toValue: 0, duration: still ? 0 : 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
            Animated.timing(shown, { toValue: 0, duration: 360, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]).start(({ finished }) => finished && on_gone())
    }, [ready, still, sink, shown, on_gone])

    // sunk, the light's top sits just over the wave
    const translateY = sink.interpolate({ inputRange: [0, 1], outputRange: [0, SIZE * 0.36] })

    return (
        <Animated.View pointerEvents={ready ? 'none' : 'auto'} style={[styles.screen, { backgroundColor: ground, opacity: shown }]}>
            <View style={[styles.disc, { backgroundColor: ground }]}>
                <Animated.View style={[styles.light, { transform: [{ translateY }] }]} />
                <Image source={require('../assets/boot-veil.png')} style={styles.veil} />
            </View>
        </Animated.View>
    )
}

const styles = StyleSheet.create({
    screen: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
    disc: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, overflow: 'hidden' },
    light: { ...StyleSheet.absoluteFill, borderRadius: SIZE / 2, backgroundColor: SHU },
    veil: { ...StyleSheet.absoluteFill, width: SIZE, height: SIZE },
})

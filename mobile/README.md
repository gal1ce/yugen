# yugen for Android

The same interface as the desktop (`../ui`), in an Expo app. The app opens the
built bundle in a WebView and answers every call the interface makes, under the
names `main.cpp` exposes through saucer on the desktop:

- `src/bridge/inject.ts` puts `window.saucer.exposed` in the page, and posts each call to the app
- `src/bridge/host.ts` answers them
- `src/native/library.ts` is the library: the phone's media store, with the ID3 tags read by `id3.ts`
- `src/native/player.ts` plays it with expo-audio: in the background, with the lock screen
- `src/native/services.ts` keeps playlists, liked songs, the profile and settings in the
  desktop's own json shapes, and fetches lyrics from lrclib

Not on the phone yet: searching and downloading (yt-dlp needs a native module of
its own), last.fm suggestions, the wave (no audio frames over the bridge yet),
and next/previous on the lock screen. Discord and the volume control are left out
on purpose.

## Building

The interface is built first; prebuild copies it into the apk
(`plugins/with-ui-assets.js`):

```sh
cd ../ui && npm run build
cd ../mobile && npm install
npx expo prebuild --platform android
npx expo run:android
```

`run:android` needs a JDK 17 or 21 and the Android SDK (`ANDROID_HOME`). Without
them, `npx eas-cli@latest build --profile development --platform android`
builds it in the cloud. Expo Go cannot run it: the app has native modules of
its own.

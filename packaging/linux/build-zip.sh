#!/usr/bin/env bash
#
# Builds yugen-linux-x86_64.zip: the Qt build with its Qt and QtWebEngine, plus
# yt-dlp and ffmpeg, in one folder that runs where it is unpacked.
#
#   ./packaging/linux/build-in-container.sh     (the release way: old glibc)
#   ./packaging/linux/build-zip.sh              (on this machine, for a test)
#
# Unlike the AppImage, which leaves WebKitGTK to the distro, nothing here is
# left to the host but glibc and the graphics stack: QtWebEngine is a chromium
# of its own and a system copy of a different Qt cannot stand in for it, so the
# whole of Qt travels with the app, laid out the way Qt lays itself out - lib,
# libexec, plugins, resources, translations - with a qt.conf saying the prefix
# is one folder up. Qt and its QtWebEngineProcess then find everything relative
# to themselves, with nothing set in the environment.
#
# Knobs, all optional:
#   QMAKE=...           the qmake of the Qt to bundle (default: qmake6 on PATH)
#   YUGEN_SKIP_UI=1     reuse ui/dist instead of running npm
#   YUGEN_SKIP_BUILD=1  reuse the cmake build tree
#   FFMPEG_URL=...      override the ffmpeg tarball
#   YT_DLP_URL=...      override the yt-dlp binary (pin a release here)

set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
work="$root/build-linux-zip"
appdir="$work/yugen-linux-x86_64"
cache="$work/cache"
out="$work/yugen-linux-x86_64.zip"

FFMPEG_URL=${FFMPEG_URL:-https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz}
YT_DLP_URL=${YT_DLP_URL:-https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux}
QMAKE=${QMAKE:-$(command -v qmake6 || command -v qmake || true)}

say() { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

for tool in cmake curl tar zip; do
    command -v "$tool" >/dev/null || die "$tool is not installed"
done
[ -x "$QMAKE" ] || die "no qmake found - set QMAKE to the Qt to bundle"

qt_prefix=$("$QMAKE" -query QT_INSTALL_PREFIX)
say "bundling Qt $("$QMAKE" -query QT_VERSION) from $qt_prefix"

mkdir -p "$cache"
if [ ! -x "$cache/linuxdeploy-x86_64.AppImage" ]; then
    say "fetching linuxdeploy"
    curl -fL --retry 3 -o "$cache/linuxdeploy-x86_64.AppImage" \
        https://github.com/linuxdeploy/linuxdeploy/releases/download/continuous/linuxdeploy-x86_64.AppImage
    chmod +x "$cache/linuxdeploy-x86_64.AppImage"
fi

rm -rf "$appdir" "$out"
mkdir -p "$appdir"

# --- the app itself -------------------------------------------------------

if [ -z "${YUGEN_SKIP_UI:-}" ]; then
    say "building the ui bundle"
    # saucer_embed() globs ui/dist when cmake configures, so this has to be first
    ( cd "$root/ui" && npm ci && npm run build )
fi

if [ -z "${YUGEN_SKIP_BUILD:-}" ]; then
    say "building yugen"
    cmake -S "$root" -B "$work/build" -G Ninja \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_INSTALL_PREFIX=/usr \
        -DCMAKE_PREFIX_PATH="$qt_prefix" \
        -DCMAKE_INSTALL_RPATH="$qt_prefix/lib" \
        -Dsaucer_backend=Qt
    cmake --build "$work/build" --parallel
fi

# installed with a runpath to the Qt being bundled: install strips the build's
# own, and without one linuxdeploy cannot see the Qt libraries to deploy them.
# it rewrites the runpath to the bundle's own lib folder when it is done
DESTDIR="$appdir" cmake --install "$work/build"

desktop="$appdir/usr/share/applications/yugen.desktop"
# assets/yugen.desktop points Exec at /usr/local/bin, which is meaningless in a
# bundle and makes linuxdeploy's validation fail
sed -i 's|^Exec=.*|Exec=yugen|' "$desktop"

# --- yt-dlp and ffmpeg ----------------------------------------------------

say "fetching yt-dlp"
curl -fL --retry 3 -o "$appdir/usr/bin/yt-dlp" "$YT_DLP_URL"
chmod +x "$appdir/usr/bin/yt-dlp"
"$appdir/usr/bin/yt-dlp" --version >/dev/null || die "the yt-dlp binary does not run"

say "fetching ffmpeg"
if [ ! -f "$cache/ffmpeg.tar.xz" ]; then
    curl -fL --retry 3 -o "$cache/ffmpeg.tar.xz" "$FFMPEG_URL" \
        || die "could not download $FFMPEG_URL - set FFMPEG_URL to a mirror"
fi
tar -xf "$cache/ffmpeg.tar.xz" -C "$appdir/usr/bin" \
    --strip-components=1 --wildcards '*/ffmpeg' '*/ffprobe'
chmod +x "$appdir/usr/bin/ffmpeg" "$appdir/usr/bin/ffprobe"

# every download runs `yt-dlp -x --audio-format mp3`, so a build without the mp3
# encoder would pass this script and fail on the first song
"$appdir/usr/bin/ffmpeg" -hide_banner -encoders 2>/dev/null | grep -q libmp3lame \
    || die "this ffmpeg build has no libmp3lame, mp3 extraction would fail"

# --- Qt ---------------------------------------------------------------------

say "bundling Qt"
usr="$appdir/usr"
mkdir -p "$usr/lib" "$usr/libexec" "$usr/plugins" "$usr/resources" "$usr/translations"

# QtWebEngine's other half: the chromium process that renders the page, the
# resources it reads (icu data, the v8 snapshot, the pak files) and its locales
cp -a "$qt_prefix/libexec/QtWebEngineProcess" "$usr/libexec/"
cp -a "$qt_prefix/resources/." "$usr/resources/"
cp -a "$qt_prefix/translations/qtwebengine_locales" "$usr/translations/"

# the plugins a window needs: wayland first (see main.cpp on the refresh rate),
# xcb as the fallback, the egl and shell glue each one loads, and the image and
# tls plugins the page uses for covers and https
for dir in platforms wayland-shell-integration wayland-decoration-client \
    wayland-graphics-integration-client xcbglintegrations egldeviceintegrations \
    imageformats tls iconengines platforminputcontexts; do
    [ -d "$qt_prefix/plugins/$dir" ] && cp -a "$qt_prefix/plugins/$dir" "$usr/plugins/"
done

# every Qt library anything in the bundle loads, followed through until nothing
# new turns up - each one is looked up against the Qt being bundled, not the
# host's, and copied under its soname
while :; do
    added=0
    while read -r lib; do
        name=$(basename "$lib")
        [ -e "$usr/lib/$name" ] && continue
        cp -L "$lib" "$usr/lib/$name"
        added=1
    done < <(find "$usr/bin/yugen" "$usr/libexec" "$usr/plugins" "$usr/lib" -type f \( -name '*.so*' -o -perm -u+x \) \
        | xargs -r env LD_LIBRARY_PATH="$qt_prefix/lib" ldd 2>/dev/null \
        | awk -v qt="$qt_prefix/lib/" 'index($3, qt) == 1 { print $3 }' | sort -u)
    [ "$added" = 0 ] && break
done

printf '[Paths]\nPrefix = ..\n' > "$usr/bin/qt.conf"
printf '[Paths]\nPrefix = ..\n' > "$usr/libexec/qt.conf"

# --- the rest of the libraries ----------------------------------------------

say "running linuxdeploy"
# the bundled Qt is found first, so linuxdeploy sees it as already in place and
# only brings what Qt and yugen need from the system - nss, taglib, curl - and
# points every runpath into the bundle. yt-dlp and ffmpeg are self-contained
# and not named, so they are left alone
# NSS stays the host's. It loads its crypto modules (softokn, freebl) by its own
# lookup at runtime, which no dependency walk sees, and a bundled libnss3 next
# to a host's modules - or none - takes the page down the first time chromium
# opens an https connection. Every desktop carries NSS (firefox, chromium and
# thunderbird all need it), and Qt's own binary releases expect it from the host.
excludes=()
for pattern in 'libnss3.so*' 'libnssutil3.so*' 'libsmime3.so*' 'libssl3.so*' \
    'libnspr4.so*' 'libplc4.so*' 'libplds4.so*'; do
    excludes+=(--exclude-library "$pattern")
done

plugin_files=()
while read -r f; do plugin_files+=(--deploy-deps-only "$f"); done \
    < <(find "$usr/plugins" "$usr/libexec" -type f \( -name '*.so' -o -name QtWebEngineProcess \))

( cd "$work" && \
    LD_LIBRARY_PATH="$usr/lib:$qt_prefix/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}" \
    "$cache/linuxdeploy-x86_64.AppImage" \
        --appdir "$appdir" \
        --executable "$usr/bin/yugen" \
        "${plugin_files[@]}" \
        "${excludes[@]}" \
        --desktop-file "$desktop" \
        --icon-file "$root/assets/icons/yugen_256.png" \
        --icon-filename yugen )

[ -e "$appdir/AppRun" ] || die "linuxdeploy made no AppRun"
for must in libQt6WebEngineCore.so.6 libQt6Gui.so.6 libQt6Network.so.6; do
    [ -f "$usr/lib/$must" ] || die "$must is not in the bundle"
done
[ -f "$usr/plugins/platforms/libqwayland-egl.so" ] || die "the wayland platform plugin is not in the bundle"
leaked=$(ls "$usr/lib" | grep -E '^lib(nss3|nssutil3|smime3|ssl3|nspr4|plc4|plds4)\.so' || true)
[ -z "$leaked" ] || die "NSS leaked into the bundle: $(echo "$leaked" | tr '\n' ' ')"

# the folder is run as it is unpacked: AppRun sets up the bundled Qt and starts
# the app, and this is the name a person looks for
cat > "$appdir/yugen" <<'EOF'
#!/bin/sh
here=$(dirname "$(readlink -f "$0")")
exec "$here/AppRun" "$@"
EOF
chmod +x "$appdir/yugen"

# --- pack and report ------------------------------------------------------

say "packing"
( cd "$work" && zip -qry "$out" "$(basename "$appdir")" )

# glibc is the one thing that cannot be bundled, so the build host decides the
# oldest distro this will run on
glibc=$(find "$appdir/usr" -type f 2>/dev/null \
    | xargs -r -I{} sh -c 'objdump -T "{}" 2>/dev/null | grep -o "GLIBC_[0-9.]*" || true' \
    | sort -uV | tail -1 || true)

say "done: $out ($(du -h "$out" | cut -f1))"
printf '\n'
printf '  requires glibc %s or newer\n' "${glibc#GLIBC_}"
printf '  built on: %s\n' "$(. /etc/os-release 2>/dev/null && echo "${PRETTY_NAME:-unknown}")"
printf '\n'

#!/usr/bin/env bash
#
# Runs build-zip.sh inside an old base image, with Qt from the Qt installer.
#
# The zip inherits the glibc of whatever machine built it, and glibc is the one
# library that cannot be bundled - built on a rolling distro, it only runs on
# rolling distros. This puts the floor on a release base instead: Ubuntu 24.04,
# glibc 2.39, the same floor the AppImage has.
#
# The distro's own Qt is not used. QtWebEngine is a chromium of its own and the
# base image's (6.4) is far behind what saucer v8 wants, so the official Qt
# builds come in through aqtinstall - they are made against an old glibc and
# bundle without raising the floor. They are kept under build-linux-zip/qt, so
# a second run does not download them again.
#
#   ./packaging/linux/build-in-container.sh

set -euo pipefail

root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
IMAGE=${IMAGE:-docker.io/library/ubuntu:24.04}
QT_VERSION=${QT_VERSION:-6.8.3}

# saucer-embed sets policy CMP0174, which arrived in 3.31, and the base image
# carries 3.28. Kitware's own tarball is the least invasive way to get past it.
CMAKE_VERSION=${CMAKE_VERSION:-3.31.6}

if [ -n "${ENGINE:-}" ]; then
    engine=$ENGINE
elif command -v podman >/dev/null; then
    engine=podman
elif command -v docker >/dev/null; then
    engine=docker
else
    echo "error: podman or docker is required" >&2
    exit 1
fi

# The ui bundle is plain static output and needs a much newer node than the base
# image carries, so it is built on the host and only reused in here.
if [ ! -f "$root/ui/dist/index.html" ]; then
    echo "error: no ui bundle - run 'npm run build' in ui/ first" >&2
    exit 1
fi

exec "$engine" run --rm \
    -v "$root:/src" \
    -w /src \
    -e YUGEN_SKIP_UI=1 \
    -e CXX=g++-14 \
    -e APPIMAGE_EXTRACT_AND_RUN=1 \
    -e CMAKE_VERSION="$CMAKE_VERSION" \
    -e QT_VERSION="$QT_VERSION" \
    "$IMAGE" \
    bash -euc '
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq
        # the build tools, the libraries yugen links itself, and what Qt and
        # QtWebEngine link - the linker has to see those to finish the link,
        # and linuxdeploy has to see them to know which ones not to bundle
        apt-get install -y -qq --no-install-recommends \
            ca-certificates curl xz-utils file git zip python3-venv \
            build-essential g++-14 ninja-build pkg-config \
            libtag1-dev libcurl4-openssl-dev libglib2.0-dev \
            libgl-dev libegl-dev libopengl0 libxkbcommon-dev libxkbcommon-x11-0 \
            libfontconfig1 libfreetype6 libdbus-1-3 libnss3 libxcomposite1 \
            libxdamage1 libxrandr2 libxtst6 libxshmfence1 libgbm1 libasound2t64 \
            libxkbfile1 libxcb-cursor0 libxcb-icccm4 libxcb-image0 libxcb-keysyms1 \
            libxcb-randr0 libxcb-render-util0 libxcb-shape0 libxcb-xinerama0 \
            libxcb-xkb1 libwayland-client0 libwayland-cursor0 libwayland-egl1 \
            libxcb-glx0 libxcb-xfixes0 libxcb-sync1 libxcb-shm0 libx11-xcb1 \
            libxfixes3 libxi6 libatomic1 libgssapi-krb5-2

        # the base image ships gcc 13, which has no <print>. std::println is
        # used throughout the backend.
        update-alternatives --install /usr/bin/g++ g++ /usr/bin/g++-14 100

        curl -fL --retry 3 -o /tmp/cmake.tar.gz \
            "https://github.com/Kitware/CMake/releases/download/v$CMAKE_VERSION/cmake-$CMAKE_VERSION-linux-x86_64.tar.gz"
        mkdir -p /opt/cmake
        tar -xzf /tmp/cmake.tar.gz -C /opt/cmake --strip-components=1
        export PATH=/opt/cmake/bin:$PATH

        qt=/src/build-linux-zip/qt
        if [ ! -x "$qt/$QT_VERSION/gcc_64/bin/qmake" ]; then
            python3 -m venv /opt/aqt
            /opt/aqt/bin/pip install -q aqtinstall
            # from /tmp: aqt leaves its log in the folder it runs in, and that
            # is the source tree otherwise
            ( cd /tmp && /opt/aqt/bin/aqt install-qt linux desktop "$QT_VERSION" linux_gcc_64 \
                -m qtwebengine qtwebchannel qtpositioning -O "$qt" )
        fi

        export QMAKE="$qt/$QT_VERSION/gcc_64/bin/qmake"
        exec ./packaging/linux/build-zip.sh
    '

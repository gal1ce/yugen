cmake_minimum_required(VERSION 3.25)
project(yugen CXX)

# std::println and std::chrono::clock_cast are used throughout, both C++23.
set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# CURL is provided by the platform package manager. TagLib comes from a CMake
# package on Windows and pkg-config on Linux.
find_package(CURL REQUIRED)

if(WIN32)
    # Windows dependencies are supplied as CMake packages (for example by
    # vcpkg); pkg-config and GIO are Linux-only because MPRIS uses D-Bus.
    find_package(TagLib CONFIG REQUIRED)
    if(TARGET TagLib::TagLib)
        set(YUGEN_TAGLIB_TARGET TagLib::TagLib)
    elseif(TARGET TagLib)
        set(YUGEN_TAGLIB_TARGET TagLib)
    else()
        message(FATAL_ERROR "TagLib was found, but it did not define a known CMake target")
    endif()
    set(YUGEN_MPRIS_SOURCE src/mpris_stub.cpp)
    # the exe's own icon, compiled in from a resource script
    enable_language(RC)
    set(YUGEN_WINDOWS_RESOURCES assets/yugen.rc)
else()
    find_package(PkgConfig REQUIRED)
    pkg_check_modules(TAGLIB REQUIRED IMPORTED_TARGET taglib)
    pkg_check_modules(GIO REQUIRED IMPORTED_TARGET gio-2.0)
    set(YUGEN_TAGLIB_TARGET PkgConfig::TAGLIB)
    set(YUGEN_MPRIS_SOURCE src/mpris.cpp)
endif()

# EXCLUDE_FROM_ALL keeps their own install rules out of ours, so installing
# yugen does not drop saucer's headers and cmake config into the prefix.
#
# saucer (webview), nlohmann_json and the discord rpc library are pinned and
# built from source on the first configure, then cached under build/_deps.
#
# discord-presence pulls glaze in itself, but only when the target does not
# exist yet - saucer already brings the same version, so it is reused.
include(FetchContent)

# saucer maps every webkit permission request it knows of, pointer lock
# included - but WebKitGTK only declares that one when it was built with
# ENABLE_POINTER_LOCK, and Arch's 2.54 is not, so v8.0.5 stopped compiling
# there. The patch makes that one mapping optional. It is applied only if it
# is not already in, so a reconfigure over a populated source tree is a no-op.
if(WIN32)
    set(YUGEN_SAUCER_PATCH_COMMAND
        PATCH_COMMAND
        "${CMAKE_COMMAND}"
        "-DSAUCER_SOURCE_DIR=<SOURCE_DIR>"
        -P
        "${CMAKE_CURRENT_SOURCE_DIR}/cmake/patches/apply-saucer-windows.cmake"
    )
else()
    set(YUGEN_SAUCER_PATCH "${CMAKE_CURRENT_SOURCE_DIR}/cmake/patches/saucer-optional-pointer-lock.patch")
    set(YUGEN_SAUCER_PATCH_COMMAND
        PATCH_COMMAND
        "${CMAKE_COMMAND}"
        "-DPATCH=${YUGEN_SAUCER_PATCH}"
        -P
        "${CMAKE_CURRENT_SOURCE_DIR}/cmake/patches/apply.cmake"
    )
endif()

FetchContent_Declare(
    saucer
    GIT_REPOSITORY "https://github.com/saucer/saucer"
    GIT_TAG v8.0.5
    ${YUGEN_SAUCER_PATCH_COMMAND}
    # on both platforms the Qt page is handed saucer's own on-disk profile, so
    # the ui's storage survives a restart (the script says which bug it works around)
    COMMAND "${CMAKE_COMMAND}" -DSAUCER_SOURCE_DIR=<SOURCE_DIR> -P "${CMAKE_CURRENT_SOURCE_DIR}/cmake/patches/apply-saucer-page-profile.cmake"
    EXCLUDE_FROM_ALL
)

FetchContent_Declare(
    json
    GIT_REPOSITORY "https://github.com/nlohmann/json.git"
    GIT_TAG v3.11.3
    EXCLUDE_FROM_ALL
)

FetchContent_Declare(
    saucer-embed
    GIT_REPOSITORY "https://github.com/saucer/embed"
    GIT_TAG v1.1.1
    EXCLUDE_FROM_ALL
)

FetchContent_Declare(
    discord-presence
    GIT_REPOSITORY "https://github.com/onegen-dev/discord-presence.git"
    GIT_TAG 3b50b0854ec24f9b2d4cc8e28f9145f276bb998e
    EXCLUDE_FROM_ALL
)

# The engine the window is drawn with. QtWebEngine is chromium: it paces frames
# by the display - 165 Hz is 165 Hz - where WebKitGTK falls back to a fixed 60 fps
# timer whenever the driver will not let it wait on the vblank itself (nvidia, for
# one). WebKitGtk still builds: -Dsaucer_backend=WebKitGtk.
if(NOT saucer_backend OR saucer_backend STREQUAL "Default")
    set(saucer_backend "Qt" CACHE STRING "The webview backend saucer is built with" FORCE)
endif()

FetchContent_MakeAvailable(saucer json saucer-embed discord-presence)

# The built ui is baked into the executable, so there is nothing to serve at
# runtime and nothing to install next to the binary. The directory is globbed
# when cmake configures, so `npm run build` in ui/ has to have run at least
# once; after that the generated sources are refreshed on every build.
set(YUGEN_UI_DIR "${CMAKE_CURRENT_SOURCE_DIR}/ui/dist")

# The executable itself.
add_executable(${PROJECT_NAME}
    src/main.cpp
    ${YUGEN_MPRIS_SOURCE}
    src/services.cpp
    ${YUGEN_WINDOWS_RESOURCES}
)

target_include_directories(${PROJECT_NAME} PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
)

# what the DBG tracing in services.cpp is compiled behind. a release build never
# defines it, so those lines are not in the binary at all rather than being calls
# that print nothing
target_compile_definitions(yugen PRIVATE $<$<CONFIG:Debug>:DEBUG>)
if(WIN32)
    target_compile_definitions(yugen PRIVATE NOMINMAX WIN32_LEAN_AND_MEAN)

    # a window, not a console program: without this a terminal opens behind the
    # app. main() stays the entry point rather than WinMain - the linker is told
    # to start the c runtime the way a console program would, and nothing else
    # changes. stdout then goes nowhere, which the println tracing survives
    set_target_properties(yugen PROPERTIES WIN32_EXECUTABLE ON)
    if(MSVC)
        target_link_options(yugen PRIVATE /ENTRY:mainCRTStartup)
    endif()
endif()

# main() only steers WebKitGTK around nvidia's wayland fault when it is the engine.
# on Qt it asks the screen its refresh rate instead, which wants QtGui directly,
# and keeps to one instance through a local socket, which wants QtNetwork
if(saucer_backend STREQUAL "WebKitGtk")
    target_compile_definitions(yugen PRIVATE YUGEN_WEBKITGTK)
elseif(saucer_backend STREQUAL "Qt")
    find_package(Qt6 REQUIRED COMPONENTS Gui Network)
    target_link_libraries(yugen PRIVATE Qt6::Gui Qt6::Network)
endif()
if(MSVC)
    target_compile_options(${PROJECT_NAME} PRIVATE /W4 /utf-8)
else()
    target_compile_options(${PROJECT_NAME} PRIVATE -Wall -Wextra)
endif()

if (NOT EXISTS "${YUGEN_UI_DIR}/index.html")
    message(FATAL_ERROR
        "No ui bundle at ${YUGEN_UI_DIR} - run `npm run build` in ui/ first.")
endif()

saucer_embed("${YUGEN_UI_DIR}"
    NAME        ui
    TARGET      ${PROJECT_NAME}
    DESTINATION "${CMAKE_CURRENT_BINARY_DIR}/embedded"
)

target_link_libraries(${PROJECT_NAME} PRIVATE
    nlohmann_json::nlohmann_json
    saucer::ui
    ${YUGEN_TAGLIB_TARGET}
    saucer::saucer
    CURL::libcurl
    discord-rpc
)

if(NOT WIN32)
    target_link_libraries(${PROJECT_NAME} PRIVATE PkgConfig::GIO)
endif()

# Installation. Linux also registers the desktop entry and hicolor icons.
if(WIN32)
    install(TARGETS ${PROJECT_NAME} RUNTIME DESTINATION bin)
else()
    install(TARGETS ${PROJECT_NAME} DESTINATION bin)
endif()

if(NOT WIN32)
    install(FILES assets/yugen.desktop DESTINATION share/applications)

    # the icon theme wants one file per size, each named after the application,
    # so the sizes that exist in assets/icons are renamed into hicolor folders.
    foreach(SIZE 16 32 48 128 256 512)
        install(FILES assets/icons/yugen_${SIZE}.png
                DESTINATION share/icons/hicolor/${SIZE}x${SIZE}/apps
                RENAME yugen.png)
    endforeach()
endif()

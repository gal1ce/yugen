# saucer v8.0.5's Qt backend builds its QWebEngineProfile - named, on disk -
# and then makes the page with a bare QWebEnginePage(), which Qt 6 puts on its
# default profile instead. That one is off the record: localStorage, IndexedDB
# and the http cache live in memory and are gone with the process, so every
# preference the ui keeps and the track it was on start over on each launch.
# The page is handed the profile saucer made for it. Applied once; a rerun over
# a patched tree changes nothing.
set(source_file "${SAUCER_SOURCE_DIR}/src/qt.webview.cpp")
file(READ "${source_file}" contents)

set(patched "std::make_unique<QWebEnginePage>(platform->profile.get())")

string(FIND "${contents}" "${patched}" already)
if(NOT already EQUAL -1)
    return()
endif()

string(REGEX MATCH "std::make_unique<QWebEnginePage>\\([ \t]*\\)" original "${contents}")
if(NOT original)
    message(FATAL_ERROR "Could not find the QWebEnginePage construction in ${source_file}")
endif()

string(REPLACE "${original}" "${patched}" contents "${contents}")
file(WRITE "${source_file}" "${contents}")

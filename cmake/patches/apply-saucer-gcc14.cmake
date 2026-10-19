# saucer v8.0.5's Qt backend calls optional::value_or with a bare braced list,
# which only deduces since C++26 gave value_or a default template argument.
# GCC 15's libstdc++ and MSVC's STL have that; GCC 14's - the newest on the
# Ubuntu 24.04 base the release builds on - does not. The type is spelled out,
# which means the same thing everywhere. Applied once; a rerun changes nothing.
set(source_file "${SAUCER_SOURCE_DIR}/src/qt.app.cpp")
file(READ "${source_file}" contents)

set(original "value_or({native::id.data()})")
set(patched "value_or(std::vector<char *>{native::id.data()})")

string(FIND "${contents}" "${patched}" already)
if(NOT already EQUAL -1)
    return()
endif()

string(FIND "${contents}" "${original}" found)
if(found EQUAL -1)
    message(FATAL_ERROR "Could not find the argv default in ${source_file}")
endif()

string(REPLACE "${original}" "${patched}" contents "${contents}")
file(WRITE "${source_file}" "${contents}")

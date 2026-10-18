# Applies PATCH to the source tree it runs in, once.
#
# FetchContent runs the patch step again whenever the declaration changes, and
# git apply refuses a patch that is already in - so a patch that reverses
# cleanly is taken as applied and left alone, and anything else is applied
# (and fails loudly if it does not fit).
execute_process(
    COMMAND git apply --reverse --check "${PATCH}"
    RESULT_VARIABLE already_applied
    OUTPUT_QUIET ERROR_QUIET
)

if(already_applied EQUAL 0)
    return()
endif()

execute_process(
    COMMAND git apply "${PATCH}"
    RESULT_VARIABLE failed
)

if(NOT failed EQUAL 0)
    message(FATAL_ERROR "could not apply ${PATCH}")
endif()

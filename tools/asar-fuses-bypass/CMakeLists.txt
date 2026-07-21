cmake_minimum_required(VERSION 3.16)
cmake_policy(SET CMP0091 NEW)
project(asar_fuses_bypass C)

set(CMAKE_C_STANDARD 11)

#[[
add_executable(asar_fuses_bypass main.c)
]]

set(CMAKE_SHARED_LIBRARY_PREFIX "")
set(CMAKE_STATIC_LIBRARY_PREFIX "")

add_library(version SHARED library.c library.def fuses.c)

if(MSVC)
	set_property(TARGET version PROPERTY
		MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
elseif(CMAKE_C_COMPILER_ID MATCHES "GNU|Clang")
	target_link_options(version PRIVATE -static -static-libgcc -static-libstdc++)
endif()

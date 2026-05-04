cmake_minimum_required(VERSION 3.16)
project(asar_fuses_bypass C)

set(CMAKE_C_STANDARD 11)

#[[
add_executable(asar_fuses_bypass main.c)
]]

set(CMAKE_SHARED_LIBRARY_PREFIX "")
set(CMAKE_STATIC_LIBRARY_PREFIX "")

if(CMAKE_C_COMPILER_ID MATCHES "GNU|Clang")
	add_link_options(-static -static-libgcc -static-libstdc++)
endif()

add_library(version SHARED library.c library.def fuses.c)
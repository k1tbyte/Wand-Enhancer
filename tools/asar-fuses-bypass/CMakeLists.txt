cmake_minimum_required(VERSION 3.16)
project(asar_fuses_bypass C)

set(CMAKE_C_STANDARD 11)

#[[
add_executable(asar_fuses_bypass main.c)
]]

set(CMAKE_SHARED_LIBRARY_PREFIX "")
set(CMAKE_STATIC_LIBRARY_PREFIX "")

add_link_options(-static -static-libgcc -static-libstdc++)

add_library(version SHARED library.c library.def fuses.c)
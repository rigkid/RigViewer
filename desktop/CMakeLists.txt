cmake_minimum_required(VERSION 3.19)

project(RigViewer VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Prefer submodule, then sibling RigKit checkout (local monorepo layout).
if(NOT RIGKIT_DIR)
	if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/rigkit/CMakeLists.txt")
		set(RIGKIT_DIR "${CMAKE_CURRENT_SOURCE_DIR}/rigkit")
	elseif(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/../../RigKit/CMakeLists.txt")
		set(RIGKIT_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../RigKit")
	elseif(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/../RigKit/CMakeLists.txt")
		set(RIGKIT_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../RigKit")
	endif()
endif()
set(RIGKIT_DIR "${RIGKIT_DIR}" CACHE PATH "Path to RigKit checkout")

if(NOT EXISTS "${RIGKIT_DIR}/CMakeLists.txt")
	message(FATAL_ERROR
		"RigKit not found at RIGKIT_DIR=${RIGKIT_DIR}.\n"
		"  git submodule add https://github.com/rigkid/RigKit.git desktop/rigkit\n"
		"  git submodule update --init --recursive\n"
		"  or: cmake -S desktop -B desktop/build -DRIGKIT_DIR=/path/to/RigKit")
endif()

include("${RIGKIT_DIR}/cmake/CPM.cmake")
add_subdirectory("${RIGKIT_DIR}" "${CMAKE_BINARY_DIR}/rigkit")
add_rigkit_application(SOURCE_DIR "${CMAKE_CURRENT_SOURCE_DIR}")

# ImGuizmo is vendored under rigImGui but not linked into the pack; product apps
# that draw Tools gizmos compile the translation unit (same as example_ImGuizmo).
if(TARGET RigViewer)
	target_sources(RigViewer PRIVATE
		"${RIGKIT_DIR}/packs/rigImGui/third_party/ImGuizmo/ImGuizmo.cpp")
	target_include_directories(RigViewer PRIVATE
		"${RIGKIT_DIR}/packs/rigImGui/third_party/ImGuizmo")
endif()


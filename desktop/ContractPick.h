#pragma once

#include "ecs/MEcs.h"

/** @brief Ray-pick closest CMesh under a viewport pixel (GLFW top-left mouse). */
entt::entity pickContractMeshAt(rigkit::MEcs& ecs, int viewportW, int viewportH, float mouseX,
								float mouseY);

/** @brief Clear multi-select and select @p e (adds CSelection if needed). */
void selectContractEntity(rigkit::MEcs& ecs, entt::entity e);

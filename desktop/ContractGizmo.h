#pragma once

#include "core/IMui.h"
#include "ecs/MEcs.h"

/**
 * @brief ImGuizmo TRS for the first CSelection entity (Tools menu Move/Rotate/Scale).
 * @param x,y,w,h SetRect + projection aspect — must match GL present (full window).
 * @param clipX,clipY,clipW,clipH Optional draw clip (dock central hole). Pass zeros to clip to SetRect.
 */
void drawContractGizmo(rigkit::MEcs& ecs, float x, float y, float w, float h,
					   rigkit::IMui::GizmoOp op, float clipX = 0.f, float clipY = 0.f,
					   float clipW = 0.f, float clipH = 0.f);

/** @brief True while dragging the gizmo — pause camera orbit. */
bool contractGizmoBusy();

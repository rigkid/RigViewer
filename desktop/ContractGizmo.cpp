#include "ContractGizmo.h"

#include "CCamera.h"
#include "CRelationship.h"
#include "CSelection.h"
#include "CTransform.h"
#include "SHierarchy.h"

#include <imgui.h>
#include <ImGuizmo.h>
#include <glm/gtc/type_ptr.hpp>

namespace {

entt::entity firstSelected(rigkit::MEcs& ecs) {
	auto view = ecs.view<rigkit::ecs::CSelection, rigkit::ecs::CTransform>();
	for (auto entity : view) {
		const auto& sel = view.get<rigkit::ecs::CSelection>(entity);
		if (sel.isSelected || sel.isMultiSelected) {
			return entity;
		}
	}
	return entt::null;
}

entt::entity activeCamera(rigkit::MEcs& ecs) {
	auto view = ecs.view<rigkit::ecs::CTransform, rigkit::ecs::CCamera>();
	for (auto entity : view) {
		if (view.get<rigkit::ecs::CCamera>(entity).active) {
			return entity;
		}
	}
	return entt::null;
}

ImGuizmo::OPERATION toOp(rigkit::IMui::GizmoOp op) {
	switch (op) {
	case rigkit::IMui::GizmoOp::Rotate:
		return ImGuizmo::ROTATE;
	case rigkit::IMui::GizmoOp::Scale:
		return ImGuizmo::SCALE;
	case rigkit::IMui::GizmoOp::Translate:
	default:
		return ImGuizmo::TRANSLATE;
	}
}

void applyLocalMatrix(rigkit::ecs::CTransform& transform, const glm::mat4& local) {
	float t[3], rDeg[3], s[3];
	ImGuizmo::DecomposeMatrixToComponents(glm::value_ptr(local), t, rDeg, s);
	transform.position = {t[0], t[1], t[2]};
	transform.setEulerRadians(
		{glm::radians(rDeg[0]), glm::radians(rDeg[1]), glm::radians(rDeg[2])});
	transform.scale = {s[0], s[1], s[2]};
}

} // namespace

void drawContractGizmo(rigkit::MEcs& ecs, float x, float y, float w, float h,
					   rigkit::IMui::GizmoOp op, float clipX, float clipY, float clipW,
					   float clipH) {
	if (w <= 1.f || h <= 1.f || op == rigkit::IMui::GizmoOp::Select) {
		return;
	}

	rigkit::ecs::SHierarchy(ecs);

	const entt::entity sel = firstSelected(ecs);
	const entt::entity cam = activeCamera(ecs);
	if (sel == entt::null || cam == entt::null) {
		return;
	}

	const auto& camera = ecs.getComponent<rigkit::ecs::CCamera>(cam);
	const auto& camXf = ecs.getComponent<rigkit::ecs::CTransform>(cam);
	auto& xf = ecs.getComponent<rigkit::ecs::CTransform>(sel);

	// Match MeshGizmo + SMeshPresent3D: same view/proj as the GL bed (full window).
	const float aspect = w / h;
	const glm::mat4 view = rigkit::ecs::CCamera::viewMatrix(camXf);
	const glm::mat4 proj = camera.projectionMatrix(aspect);

	glm::mat4 matrix = xf.world;
	glm::mat4 parentWorld(1.0f);
	if (ecs.hasComponent<rigkit::ecs::CRelationship>(sel)) {
		const auto parent = ecs.getComponent<rigkit::ecs::CRelationship>(sel).parent;
		if (parent != entt::null && ecs.hasComponent<rigkit::ecs::CTransform>(parent)) {
			parentWorld = ecs.getComponent<rigkit::ecs::CTransform>(parent).world;
		}
	}

	const float cx = clipW > 1.f ? clipX : x;
	const float cy = clipH > 1.f ? clipY : y;
	const float cw = clipW > 1.f ? clipW : w;
	const float ch = clipH > 1.f ? clipH : h;

	ImGuizmo::BeginFrame();
	ImGuizmo::SetOrthographic(camera.projection ==
							  rigkit::ecs::CCamera::Projection::Orthographic);
	ImDrawList* dl = ImGui::GetBackgroundDrawList();
	ImGuizmo::SetDrawlist(dl);
	// SetRect must match the GL present viewport (full window), not the dock hole —
	// otherwise aspect/mouse map drift from the meshes.
	ImGuizmo::SetRect(x, y, w, h);
	dl->PushClipRect(ImVec2(cx, cy), ImVec2(cx + cw, cy + ch), true);

	if (ImGuizmo::Manipulate(glm::value_ptr(view), glm::value_ptr(proj), toOp(op), ImGuizmo::LOCAL,
							 glm::value_ptr(matrix))) {
		const glm::mat4 local = glm::inverse(parentWorld) * matrix;
		applyLocalMatrix(xf, local);
		rigkit::ecs::SHierarchy(ecs);
	}

	dl->PopClipRect();
}

bool contractGizmoBusy() {
	return ImGuizmo::IsUsing() || ImGuizmo::IsOver();
}

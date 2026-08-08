#include "ContractPick.h"

#include "CCamera.h"
#include "CMesh.h"
#include "CSelectable.h"
#include "CSelection.h"
#include "CTransform.h"
#include "SHierarchy.h"

#include <glm/gtc/matrix_transform.hpp>
#include <algorithm>
#include <cmath>
#include <limits>

namespace {

entt::entity activeCamera(rigkit::MEcs& ecs) {
	auto view = ecs.view<rigkit::ecs::CTransform, rigkit::ecs::CCamera>();
	for (auto entity : view) {
		if (view.get<rigkit::ecs::CCamera>(entity).active) {
			return entity;
		}
	}
	return entt::null;
}

bool selectable(rigkit::MEcs& ecs, entt::entity e) {
	if (!ecs.hasComponent<rigkit::ecs::CSelectable>(e)) {
		return true;
	}
	return ecs.getComponent<rigkit::ecs::CSelectable>(e).enabled;
}

bool meshBounds(const rigkit::ecs::CMesh& mesh, glm::vec3& outMin, glm::vec3& outMax) {
	if (mesh.positions.empty()) {
		return false;
	}
	outMin = outMax = mesh.positions.front();
	for (const auto& p : mesh.positions) {
		outMin = glm::min(outMin, p);
		outMax = glm::max(outMax, p);
	}
	return true;
}

bool rayAabb(const glm::vec3& orig, const glm::vec3& dir, const glm::vec3& bmin,
			 const glm::vec3& bmax, float& outT) {
	float tmin = 0.f;
	float tmax = std::numeric_limits<float>::max();
	for (int i = 0; i < 3; ++i) {
		const float o = orig[i];
		const float d = dir[i];
		float mn = bmin[i];
		float mx = bmax[i];
		if (std::fabs(d) < 1e-8f) {
			if (o < mn || o > mx) {
				return false;
			}
			continue;
		}
		float t0 = (mn - o) / d;
		float t1 = (mx - o) / d;
		if (t0 > t1) {
			std::swap(t0, t1);
		}
		tmin = std::max(tmin, t0);
		tmax = std::min(tmax, t1);
		if (tmax < tmin) {
			return false;
		}
	}
	outT = tmin;
	return tmax >= 0.f;
}

} // namespace

entt::entity pickContractMeshAt(rigkit::MEcs& ecs, int viewportW, int viewportH, float mouseX,
								float mouseY) {
	if (viewportW <= 0 || viewportH <= 0) {
		return entt::null;
	}
	rigkit::ecs::SHierarchy(ecs);
	const entt::entity cam = activeCamera(ecs);
	if (cam == entt::null) {
		return entt::null;
	}
	const auto& camera = ecs.getComponent<rigkit::ecs::CCamera>(cam);
	const auto& camXf = ecs.getComponent<rigkit::ecs::CTransform>(cam);
	const float aspect = static_cast<float>(viewportW) / static_cast<float>(viewportH);
	const glm::mat4 view = rigkit::ecs::CCamera::viewMatrix(camXf);
	const glm::mat4 proj = camera.projectionMatrix(aspect);
	const glm::mat4 inv = glm::inverse(proj * view);

	const float ndcX = (mouseX / static_cast<float>(viewportW)) * 2.f - 1.f;
	const float ndcY = 1.f - (mouseY / static_cast<float>(viewportH)) * 2.f;
	glm::vec4 nearH = inv * glm::vec4(ndcX, ndcY, -1.f, 1.f);
	glm::vec4 farH = inv * glm::vec4(ndcX, ndcY, 1.f, 1.f);
	if (std::fabs(nearH.w) < 1e-8f || std::fabs(farH.w) < 1e-8f) {
		return entt::null;
	}
	const glm::vec3 nearP = glm::vec3(nearH) / nearH.w;
	const glm::vec3 farP = glm::vec3(farH) / farH.w;
	const glm::vec3 orig = nearP;
	const glm::vec3 dir = glm::normalize(farP - nearP);

	entt::entity best = entt::null;
	float bestT = std::numeric_limits<float>::max();
	for (auto entity : ecs.view<rigkit::ecs::CTransform, rigkit::ecs::CMesh>()) {
		if (!selectable(ecs, entity) || ecs.hasComponent<rigkit::ecs::CCamera>(entity)) {
			continue;
		}
		glm::vec3 bmin;
		glm::vec3 bmax;
		if (!meshBounds(ecs.getComponent<rigkit::ecs::CMesh>(entity), bmin, bmax)) {
			continue;
		}
		const glm::mat4& world = ecs.getComponent<rigkit::ecs::CTransform>(entity).world;
		// Transform AABB corners to world (coarse but enough for viewer pick).
		glm::vec3 wmin(1e30f);
		glm::vec3 wmax(-1e30f);
		for (int i = 0; i < 8; ++i) {
			const glm::vec3 corner((i & 1) ? bmax.x : bmin.x, (i & 2) ? bmax.y : bmin.y,
								  (i & 4) ? bmax.z : bmin.z);
			const glm::vec3 w = glm::vec3(world * glm::vec4(corner, 1.f));
			wmin = glm::min(wmin, w);
			wmax = glm::max(wmax, w);
		}
		float t = 0.f;
		if (rayAabb(orig, dir, wmin, wmax, t) && t < bestT) {
			bestT = t;
			best = entity;
		}
	}
	return best;
}

void selectContractEntity(rigkit::MEcs& ecs, entt::entity e) {
	auto& reg = ecs.registry();
	for (auto ent : reg.view<rigkit::ecs::CSelection>()) {
		auto& sel = reg.get<rigkit::ecs::CSelection>(ent);
		sel.isSelected = (ent == e);
		sel.isMultiSelected = false;
		sel.selectionIndex = (ent == e) ? 0 : -1;
	}
	if (e != entt::null && !reg.all_of<rigkit::ecs::CSelection>(e)) {
		rigkit::ecs::CSelection sel;
		sel.isSelected = true;
		sel.selectionIndex = 0;
		reg.emplace<rigkit::ecs::CSelection>(e, sel);
	}
}

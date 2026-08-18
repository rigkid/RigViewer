#include "RigViewerApp.h"

#include <algorithm>
#include <cmath>

#include <GLFW/glfw3.h>
#include <imgui.h>

#include "CCamera.h"
#include "CCode.h"
#include "CMesh.h"
#include "CSelectable.h"
#include "CSelection.h"
#include "CTransform.h"
#include "ContractGizmo.h"
#include "ContractImport.h"
#include "ContractPick.h"
#include "ContractUiWindow.h"
#include "core/IMui.h"
#include "core/RigKitEngine.h"
#include "core/pack/MPack.h"
#include "packs/rigComponent/src/rigComponent.h"
#include "packs/rigDocumentShell/src/rigDocumentShell.h"
#include "packs/rigImGui/src/Mui.h"
#include "packs/rigImGui/src/MWindow.h"
#include "packs/rigImGui/src/rigImGui.h"
#include "packs/rigProject/src/rigProject.h"
#include "packs/rigRender3D/src/rigRender3D.h"
#include "packs/rigSystems/src/rigSystems.h"
#include "rig/create.h"

#include <spdlog/spdlog.h>

namespace {

using rigkit::project::importContractFile;

} // namespace

void RigViewerApp::parseCommandLineArgs(const rigkit::CommandLineArgs& args) {
	IApp::parseCommandLineArgs(args);
	const auto& positional = args.getPositionalArgs();
	if (!positional.empty()) {
		m_pendingPath = positional.front();
	}
}

void RigViewerApp::ensureContractUiWindow() {
	if (m_uiWindowReady) {
		return;
	}
	auto* ui = m_engine ? m_engine->getUiManager() : nullptr;
	auto* wm = ui ? ui->getWindowManager() : nullptr;
	if (!wm) {
		return;
	}
	wm->createWindow<ContractUiWindow>(this);
	wm->showWindow("Contract UI");
	m_uiWindowReady = true;
}

void RigViewerApp::resetOrbitFromCamera() {
	m_orbitEnabled = false;
	m_camera = entt::null;
	m_orbitDragging = false;
	auto* ecs = m_engine ? m_engine->getECSManager() : nullptr;
	if (!ecs || !m_doc.ok) {
		return;
	}
	for (auto entity : ecs->view<rigkit::ecs::CTransform, rigkit::ecs::CCamera>()) {
		const auto& cam = ecs->getComponent<rigkit::ecs::CCamera>(entity);
		if (!cam.active) {
			continue;
		}
		if (cam.projection != rigkit::ecs::CCamera::Projection::Perspective) {
			return;
		}
		m_camera = entity;
		const auto& xf = ecs->getComponent<rigkit::ecs::CTransform>(entity);
		const glm::mat3 R = glm::mat3_cast(xf.rotation);
		const glm::vec3 fwd = -glm::normalize(glm::vec3(R[2]));
		float t = glm::dot(-xf.position, fwd);
		if (t < 0.5f) {
			t = std::max(0.5f, glm::length(xf.position));
		}
		m_orbitTarget = xf.position + fwd * t;
		m_orbitRadius = t;
		const glm::vec3 offset = xf.position - m_orbitTarget;
		m_orbitYaw = std::atan2(offset.x, offset.z);
		m_orbitPitch = std::asin(std::clamp(offset.y / m_orbitRadius, -0.99f, 0.99f));
		m_orbitEnabled = true;
		applyOrbitToCamera();
		return;
	}
}

void RigViewerApp::applyOrbitToCamera() {
	auto* ecs = m_engine ? m_engine->getECSManager() : nullptr;
	if (!ecs || !m_orbitEnabled || m_camera == entt::null ||
		!ecs->hasComponent<rigkit::ecs::CTransform>(m_camera)) {
		return;
	}
	const float cp = std::cos(m_orbitPitch);
	const glm::vec3 eye =
		m_orbitTarget +
		glm::vec3(std::sin(m_orbitYaw) * cp, std::sin(m_orbitPitch), std::cos(m_orbitYaw) * cp) *
			m_orbitRadius;
	rig::lookAt(ecs->getComponent<rigkit::ecs::CTransform>(m_camera), eye, m_orbitTarget);
}

void RigViewerApp::updateOrbitInput() {
	if (!m_orbitEnabled || !m_engine) {
		return;
	}
	if (contractGizmoBusy()) {
		m_orbitDragging = false;
		return;
	}
	GLFWwindow* win = m_engine->getWindow();
	if (!win) {
		return;
	}
	const ImGuiIO& io = ImGui::GetIO();
	if (io.WantCaptureMouse) {
		m_orbitDragging = false;
		return;
	}

	auto* ui = m_engine->getUiManager();
	const auto op = ui ? ui->gizmoOp() : rigkit::IMui::GizmoOp::Select;
	const bool selectTool = op == rigkit::IMui::GizmoOp::Select;

	if (std::fabs(io.MouseWheel) > 0.f) {
		m_orbitRadius *= (io.MouseWheel > 0.f) ? 0.9f : (1.f / 0.9f);
		m_orbitRadius = std::clamp(m_orbitRadius, 0.5f, 200.f);
		applyOrbitToCamera();
	}

	double mx = 0.0;
	double my = 0.0;
	glfwGetCursorPos(win, &mx, &my);
	const bool right = glfwGetMouseButton(win, GLFW_MOUSE_BUTTON_RIGHT) == GLFW_PRESS;
	const bool left = glfwGetMouseButton(win, GLFW_MOUSE_BUTTON_LEFT) == GLFW_PRESS;

	// Right-drag always orbits. In Select tool, left-drag also orbits after a small
	// threshold; a short click picks instead.
	bool wantOrbit = right;
	if (selectTool && left) {
		if (!m_pickArmed) {
			m_pickArmed = true;
			m_pickX = mx;
			m_pickY = my;
			m_pickDragged = false;
		} else {
			const float dx = static_cast<float>(mx - m_pickX);
			const float dy = static_cast<float>(my - m_pickY);
			if (dx * dx + dy * dy > 16.f) {
				m_pickDragged = true;
				wantOrbit = true;
			}
		}
	} else if (m_pickArmed && !left) {
		if (!m_pickDragged) {
			auto* ecs = m_engine->getECSManager();
			// Same projection as SMeshPresent3D / gizmo: full window.
			const int vw = m_engine->getWindowWidth();
			const int vh = m_engine->getWindowHeight();
			const float localX = static_cast<float>(m_pickX);
			const float localY = static_cast<float>(m_pickY);
			if (ecs && localX >= 0.f && localY >= 0.f && localX <= static_cast<float>(vw) &&
				localY <= static_cast<float>(vh)) {
				const auto hit = pickContractMeshAt(*ecs, vw, vh, localX, localY);
				selectContractEntity(*ecs, hit);
			}
		}
		m_pickArmed = false;
		m_pickDragged = false;
	} else if (!left) {
		m_pickArmed = false;
		m_pickDragged = false;
	}

	if (wantOrbit) {
		if (!m_orbitDragging) {
			m_orbitDragging = true;
			m_lastMouseX = mx;
			m_lastMouseY = my;
		} else {
			const float dx = static_cast<float>(mx - m_lastMouseX);
			const float dy = static_cast<float>(my - m_lastMouseY);
			m_lastMouseX = mx;
			m_lastMouseY = my;
			// Follow the finger (previous signs felt inverted vs the scene).
			m_orbitYaw += dx * 0.005f;
			m_orbitPitch += dy * 0.005f;
			m_orbitPitch = std::clamp(m_orbitPitch, -1.4f, 1.4f);
			applyOrbitToCamera();
		}
	} else {
		m_orbitDragging = false;
	}
}

void RigViewerApp::setup() {
	m_engine->setClearColor(0.043f, 0.051f, 0.063f, 1.0f);
	// Opt into Edit Mode (Ctrl+E). Start ON so Scene / pick / Tools work.
	m_engine->enableEditMode(true);

	auto* packs = m_engine->getPackManager();
	if (!packs) {
		return;
	}
	packs->registerPack<rigkit::rigComponent>();
	packs->registerPack<rigkit::rigSystems>();
	packs->registerPack<rigkit::rigProject>();
	packs->registerPack<rigkit::rigRender3D>();
	packs->registerPack<rigkit::rigImGui>();
	packs->registerPack<rigkit::rigDocumentShell>();
	packs->initAll();
	packs->setupAll();
	m_packsReady = true;

	if (auto shellPack = packs->getPack<rigkit::rigDocumentShell>()) {
		auto& shell = shellPack->shell();
		shell.setOnOpenPath([this](const std::string& path) { m_pendingPath = path; });
		shell.setOpenFilters({".rig", ".json"});
		shell.setOnNeedsPlayer([this]() {
			// Playable document: surface the honesty window instead of a silent log.
			window().title += "  [open in RigPlayer]";
			if (auto* ui = m_engine->getUiManager()) {
				if (auto* wm = ui->getWindowManager()) {
					wm->showWindow("Skipped keys");
				}
			}
		});
		if (auto* ui = m_engine->getUiManager()) {
			m_engine->enableEditMode(true);
			shell.attachChrome(*ui, true, true);
		}
	}

	if (auto* ui = m_engine->getUiManager()) {
		if (auto* mui = dynamic_cast<rigkit::Mui*>(ui)) {
			mui->addAllHostPanels();
			mui->setGizmoOp(rigkit::IMui::GizmoOp::Select);
			mui->setGizmoDrawer([this](float cx, float cy, float cw, float ch,
									   rigkit::IMui::GizmoOp op) {
				auto* ecs = m_engine ? m_engine->getECSManager() : nullptr;
				if (!ecs || !m_doc.ok) {
					return;
				}
				// GL present is full-window; gizmo SetRect/aspect must match. Clip to the
				// dock hole so handles stay in the visible bed.
				const float fw = static_cast<float>(m_engine->getWindowWidth());
				const float fh = static_cast<float>(m_engine->getWindowHeight());
				drawContractGizmo(*ecs, 0.f, 0.f, fw, fh, op, cx, cy, cw, ch);
			});
			if (auto* wm = ui->getWindowManager()) {
				wm->showWindow("Scene");
				wm->showWindow("Properties");
				wm->hideWindow("Viewport");
			}
		}
	}
	ensureContractUiWindow();

	if (!m_pendingPath.empty()) {
		openPath(m_pendingPath);
		m_pendingPath.clear();
	} else {
		spdlog::info("RigViewer ready — Edit Mode ON (Ctrl+E). Select tool: click pick; "
					 "right-drag orbit; Tools → Move for gizmo.");
	}
}

void RigViewerApp::update(float dt) {
	if (!m_pendingPath.empty() && m_packsReady) {
		openPath(m_pendingPath);
		m_pendingPath.clear();
	}
	if (!m_packsReady || !m_doc.ok) {
		return;
	}
	m_timeSec += dt;
	// Modulators: SModulators runs via engine Update systems (CModLfo + CModBinding).
	updateOrbitInput();
}

void RigViewerApp::openPath(const std::string& path) {
	auto* ecs = m_engine ? m_engine->getECSManager() : nullptr;
	if (!ecs) {
		return;
	}
	const auto result = importContractFile(*ecs, path);
	if (!result.ok) {
		spdlog::error("Failed to open '{}': {}", path, result.error);
		window().title = "RigViewer — load failed";
		m_orbitEnabled = false;
		return;
	}
	m_doc = result;
	m_timeSec = 0.f;
	m_loadedPath = path;
	window().title = "RigViewer — " + result.title;
	ensureContractUiWindow();

	bool hasLua = false;
	bool hasCode = false;
	for (auto e : ecs->registry().view<rigkit::ecs::CCode>()) {
		hasCode = true;
		const auto& code = ecs->getComponent<rigkit::ecs::CCode>(e);
		if (code.language == "lua" || code.language == "pico8") {
			hasLua = true;
		}
	}
	if (auto* packs = m_engine->getPackManager()) {
		if (auto shellPack = packs->getPack<rigkit::rigDocumentShell>()) {
			auto& shell = shellPack->shell();
			shell.setDocumentTitle(result.title);
			shell.setSkippedKeys(result.skipped);
			if (rigkit::DocumentShell::needsPlayer(result.skipped, hasLua)) {
				shell.notifyNeedsPlayer();
			}
			if (auto* ui = m_engine->getUiManager()) {
				if (auto* wm = ui->getWindowManager()) {
					if (!result.skipped.empty()) {
						wm->showWindow("Skipped keys");
					}
				}
			}
		}
	}
	if (auto* ui = m_engine->getUiManager()) {
		if (!result.panels.empty() || hasCode) {
			ui->setWindowVisibility("Contract UI", true);
		}
	}
	resetOrbitFromCamera();
	// Selectable meshes + seed selection for gizmo / Scene.
	bool any = false;
	for (auto entity : ecs->view<rigkit::ecs::CMesh, rigkit::ecs::CTransform>()) {
		if (ecs->hasComponent<rigkit::ecs::CCamera>(entity)) {
			continue;
		}
		if (!ecs->hasComponent<rigkit::ecs::CSelectable>(entity)) {
			rigkit::ecs::CSelectable sel;
			sel.enabled = true;
			ecs->addComponent(entity, sel);
		}
		rigkit::ecs::CSelection sel;
		sel.isSelected = !any;
		sel.selectionIndex = any ? -1 : 0;
		if (ecs->hasComponent<rigkit::ecs::CSelection>(entity)) {
			ecs->getComponent<rigkit::ecs::CSelection>(entity) = sel;
		} else {
			ecs->addComponent(entity, sel);
		}
		any = true;
	}
	spdlog::info("Loaded {} — {} geometries, {} panel(s), {} skipped key(s){}", path,
				 result.geometryCount, result.panels.size(), result.skipped.size(),
				 m_orbitEnabled ? " (orbit: right-drag / scroll; Select: click)" : "");
	for (const auto& key : result.skipped) {
		spdlog::warn("Skipped component key: {}", key);
	}
}

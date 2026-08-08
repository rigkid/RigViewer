#pragma once

#include <string>

#include <entt/entt.hpp>
#include <glm/glm.hpp>

#include "ContractImport.h"
#include "core/U_core.h"

class RigViewerApp : public rigkit::IApp {
  public:
	RigViewerApp() {
		window().width = 1100;
		window().height = 720;
		window().title = "RigViewer";
	}

	void parseCommandLineArgs(const rigkit::CommandLineArgs& args) override;
	void setup() override;
	void update(float dt) override;
	void draw() override {}

	const rigkit::project::ContractImportResult& doc() const { return m_doc; }
	rigkit::project::ContractImportResult& docMutable() { return m_doc; }
	float docTimeSec() const { return m_timeSec; }

  private:
	void openPath(const std::string& path);
	void ensureContractUiWindow();
	void resetOrbitFromCamera();
	void applyOrbitToCamera();
	void updateOrbitInput();

	std::string m_pendingPath;
	std::string m_loadedPath;
	bool m_packsReady = false;
	bool m_uiWindowReady = false;
	rigkit::project::ContractImportResult m_doc;
	float m_timeSec = 0.f;

	bool m_orbitEnabled = false;
	entt::entity m_camera = entt::null;
	glm::vec3 m_orbitTarget{0.f};
	float m_orbitRadius = 8.f;
	float m_orbitYaw = 0.f;
	float m_orbitPitch = 0.35f;
	bool m_orbitDragging = false;
	double m_lastMouseX = 0.0;
	double m_lastMouseY = 0.0;

	bool m_pickArmed = false;
	bool m_pickDragged = false;
	double m_pickX = 0.0;
	double m_pickY = 0.0;
};

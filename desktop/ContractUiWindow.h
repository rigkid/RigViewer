#pragma once

#include "packs/rigImGui/src/IWindow.h"

class RigViewerApp;

/** @brief ImGui fulfillment of rig.ui.panel / group / control / action (web parity). */
class ContractUiWindow : public rigkit::IWindow {
  public:
	explicit ContractUiWindow(RigViewerApp* app);

  protected:
	void renderContents() override;

  private:
	RigViewerApp* m_app = nullptr;
};

#include "ContractUiWindow.h"

#include <algorithm>
#include <string>
#include <vector>

#include <imgui.h>

#include "CCode.h"
#include "ContractImport.h"
#include "RigViewerApp.h"
#include "core/RigKitEngine.h"
#include "ecs/MEcs.h"

namespace {

using rigkit::project::ContractImportResult;
using rigkit::project::contractGetFloat;
using rigkit::project::contractGetRgba;
using rigkit::project::contractGetString;
using rigkit::project::contractRunAction;
using rigkit::project::contractSetFloat;
using rigkit::project::contractSetRgba;
using rigkit::project::contractSetString;

std::string widgetOf(const ContractImportResult::Control& ctrl) {
	if (ctrl.widget != "auto" && !ctrl.widget.empty()) {
		return ctrl.widget;
	}
	if (ctrl.propertyKey == "rgba" || ctrl.type == "vec4") {
		return "color";
	}
	if (ctrl.type == "enum" || !ctrl.options.empty()) {
		return "dropdown";
	}
	if (ctrl.type == "bool") {
		return "toggle";
	}
	if (ctrl.min && ctrl.max) {
		return "slider";
	}
	return "field";
}

void drawControl(ContractImportResult& doc, rigkit::MEcs& ecs, float timeSec,
				 const ContractImportResult::Control& ctrl) {
	(void)timeSec;
	if (!ctrl.enabled) {
		ImGui::BeginDisabled();
	}
	const bool readOnly = ctrl.readOnly;
	ImGui::PushID(ctrl.id.c_str());

	const std::string widget = widgetOf(ctrl);
	const char* label = ctrl.name.empty() ? ctrl.id.c_str() : ctrl.name.c_str();

	if (widget == "color" || ctrl.type == "vec4" || ctrl.propertyKey == "rgba") {
		auto rgba = contractGetRgba(doc, ctrl.target, ctrl.propertyKey)
						.value_or(std::array<float, 4>{1.f, 1.f, 1.f, 1.f});
		float col[4] = {rgba[0], rgba[1], rgba[2], rgba[3]};
		ImGuiColorEditFlags flags = ImGuiColorEditFlags_NoInputs | ImGuiColorEditFlags_AlphaBar;
		if (readOnly) {
			flags |= ImGuiColorEditFlags_NoPicker;
		}
		if (ImGui::ColorEdit4(label, col, flags) && !readOnly) {
			contractSetRgba(doc, ecs, ctrl.target, ctrl.propertyKey,
							{col[0], col[1], col[2], col[3]});
		}
	} else if (widget == "dropdown" || ctrl.type == "enum") {
		auto cur = contractGetString(doc, ctrl.target, ctrl.propertyKey).value_or("");
		int idx = 0;
		for (int i = 0; i < static_cast<int>(ctrl.options.size()); ++i) {
			if (ctrl.options[static_cast<size_t>(i)] == cur) {
				idx = i;
				break;
			}
		}
		if (ctrl.options.empty()) {
			ImGui::Text("%s: %s", label, cur.c_str());
		} else if (ImGui::BeginCombo(label, ctrl.options[static_cast<size_t>(idx)].c_str())) {
			for (int i = 0; i < static_cast<int>(ctrl.options.size()); ++i) {
				const bool selected = i == idx;
				if (ImGui::Selectable(ctrl.options[static_cast<size_t>(i)].c_str(), selected) &&
					!readOnly) {
					contractSetString(doc, ctrl.target, ctrl.propertyKey,
									  ctrl.options[static_cast<size_t>(i)]);
				}
				if (selected) {
					ImGui::SetItemDefaultFocus();
				}
			}
			ImGui::EndCombo();
		}
	} else if (widget == "toggle" || ctrl.type == "bool") {
		float v = contractGetFloat(doc, ctrl.target, ctrl.propertyKey).value_or(0.f);
		bool on = v != 0.f;
		if (ImGui::Checkbox(label, &on) && !readOnly) {
			contractSetFloat(doc, ecs, ctrl.target, ctrl.propertyKey, on ? 1.f : 0.f);
		}
	} else if (widget == "slider" || widget == "knob" || ctrl.type == "float" ||
			   ctrl.type == "int") {
		float min = ctrl.min.value_or(0.f);
		float max = ctrl.max.value_or(1.f);
		float v = contractGetFloat(doc, ctrl.target, ctrl.propertyKey).value_or(min);
		if (ctrl.type == "int") {
			int iv = static_cast<int>(v);
			if (ImGui::SliderInt(label, &iv, static_cast<int>(min), static_cast<int>(max)) &&
				!readOnly) {
				contractSetFloat(doc, ecs, ctrl.target, ctrl.propertyKey, static_cast<float>(iv));
			}
		} else {
			if (ImGui::SliderFloat(label, &v, min, max) && !readOnly) {
				contractSetFloat(doc, ecs, ctrl.target, ctrl.propertyKey, v);
			}
		}
	} else {
		float v = contractGetFloat(doc, ctrl.target, ctrl.propertyKey).value_or(0.f);
		if (ImGui::InputFloat(label, &v) && !readOnly) {
			contractSetFloat(doc, ecs, ctrl.target, ctrl.propertyKey, v);
		}
	}

	ImGui::PopID();
	if (!ctrl.enabled) {
		ImGui::EndDisabled();
	}
}

void drawAction(ContractImportResult& doc, float timeSec, const ContractImportResult::Action& act) {
	if (!act.enabled) {
		ImGui::BeginDisabled();
	}
	ImGui::PushID(act.id.c_str());
	const char* label = act.name.empty() ? act.actionId.c_str() : act.name.c_str();
	if (ImGui::Button(label)) {
		contractRunAction(doc, act.actionId, timeSec);
	}
	ImGui::PopID();
	if (!act.enabled) {
		ImGui::EndDisabled();
	}
}

void appendItems(ContractImportResult& doc, rigkit::MEcs& ecs, float timeSec,
				 const std::string& panelId, const std::string& groupId) {
	std::vector<const ContractImportResult::Control*> ctrls;
	std::vector<const ContractImportResult::Action*> acts;
	for (const auto& c : doc.controls) {
		if (c.panel == panelId && c.group == groupId) {
			ctrls.push_back(&c);
		}
	}
	for (const auto& a : doc.actions) {
		if (a.panel == panelId && a.group == groupId) {
			acts.push_back(&a);
		}
	}
	std::sort(ctrls.begin(), ctrls.end(),
			  [](const auto* a, const auto* b) { return a->order < b->order; });
	std::sort(acts.begin(), acts.end(),
			  [](const auto* a, const auto* b) { return a->order < b->order; });

	struct Item {
		int order = 0;
		bool isAction = false;
		const void* ptr = nullptr;
	};
	std::vector<Item> items;
	items.reserve(ctrls.size() + acts.size());
	for (const auto* c : ctrls) {
		items.push_back({c->order, false, c});
	}
	for (const auto* a : acts) {
		items.push_back({a->order, true, a});
	}
	std::sort(items.begin(), items.end(),
			  [](const Item& a, const Item& b) { return a.order < b.order; });

	for (const auto& it : items) {
		if (it.isAction) {
			drawAction(doc, timeSec, *static_cast<const ContractImportResult::Action*>(it.ptr));
		} else {
			drawControl(doc, ecs, timeSec,
						*static_cast<const ContractImportResult::Control*>(it.ptr));
		}
	}
}

} // namespace

ContractUiWindow::ContractUiWindow(RigViewerApp* app)
	: rigkit::IWindow("Contract UI", 0), m_app(app) {
	setCategory("Contract");
}

void ContractUiWindow::renderContents() {
	if (!m_app || !m_app->doc().ok) {
		ImGui::TextUnformatted("Open a Rig document with rig.ui.* panels.");
		return;
	}
	auto& doc = m_app->docMutable();
	auto* engine = m_app->getEngine();
	auto* ecs = engine ? engine->getECSManager() : nullptr;
	if (!ecs) {
		return;
	}
	const float timeSec = m_app->docTimeSec();

	std::vector<entt::entity> codeEntities;
	for (auto e : ecs->registry().view<rigkit::ecs::CCode>()) {
		codeEntities.push_back(e);
	}
	std::sort(codeEntities.begin(), codeEntities.end(), [ecs](entt::entity a, entt::entity b) {
		const auto& ca = ecs->getComponent<rigkit::ecs::CCode>(a);
		const auto& cb = ecs->getComponent<rigkit::ecs::CCode>(b);
		if (ca.order != cb.order) {
			return ca.order < cb.order;
		}
		return ca.name < cb.name;
	});

	if (doc.panels.empty() && codeEntities.empty()) {
		ImGui::TextUnformatted("No rig.ui.panel or rig.media.code in this document.");
		return;
	}

	std::vector<const ContractImportResult::Panel*> panels;
	for (const auto& p : doc.panels) {
		if (p.visible) {
			panels.push_back(&p);
		}
	}
	std::sort(panels.begin(), panels.end(),
			  [](const auto* a, const auto* b) { return a->order < b->order; });

	for (const auto* panel : panels) {
		ImGui::PushID(panel->id.c_str());
		if (ImGui::CollapsingHeader(panel->name.empty() ? panel->id.c_str() : panel->name.c_str(),
									ImGuiTreeNodeFlags_DefaultOpen)) {
			if (!panel->role.empty()) {
				ImGui::TextDisabled("%s", panel->role.c_str());
			}

			std::vector<const ContractImportResult::Group*> groups;
			for (const auto& g : doc.groups) {
				if (g.panel == panel->id && g.parent.empty()) {
					groups.push_back(&g);
				}
			}
			std::sort(groups.begin(), groups.end(),
					  [](const auto* a, const auto* b) { return a->order < b->order; });

			for (const auto* g : groups) {
				ImGui::PushID(g->id.c_str());
				if (ImGui::TreeNodeEx(g->name.empty() ? g->id.c_str() : g->name.c_str(),
									  ImGuiTreeNodeFlags_DefaultOpen)) {
					const bool horizontal = g->orientation == "horizontal";
					if (horizontal) {
						ImGui::BeginGroup();
					}
					appendItems(doc, *ecs, timeSec, panel->id, g->id);
					for (const auto& child : doc.groups) {
						if (child.parent != g->id) {
							continue;
						}
						ImGui::PushID(child.id.c_str());
						if (ImGui::TreeNodeEx(child.name.empty() ? child.id.c_str()
																 : child.name.c_str(),
											  ImGuiTreeNodeFlags_DefaultOpen)) {
							appendItems(doc, *ecs, timeSec, panel->id, child.id);
							ImGui::TreePop();
						}
						ImGui::PopID();
					}
					if (horizontal) {
						ImGui::EndGroup();
					}
					ImGui::TreePop();
				}
				ImGui::PopID();
			}

			appendItems(doc, *ecs, timeSec, panel->id, "");
		}
		ImGui::PopID();
	}

	if (!codeEntities.empty() &&
		ImGui::CollapsingHeader("Code buffers", ImGuiTreeNodeFlags_DefaultOpen)) {
		for (auto e : codeEntities) {
			auto& code = ecs->getComponent<rigkit::ecs::CCode>(e);
			ImGui::PushID(static_cast<int>(entt::to_integral(e)));
			const std::string label =
				(code.name.empty() ? "buffer" : code.name) + " (" +
				(code.language.empty() ? "text" : code.language) + ")";
			ImGui::TextUnformatted(label.c_str());
			if (code.readOnly) {
				ImGui::BeginDisabled();
			}
			// Keep a growable scratch so we don't need imgui_stdlib linked into the app.
			std::vector<char> buf(code.text.begin(), code.text.end());
			buf.push_back('\0');
			if (buf.size() < 65536) {
				buf.resize(65536, '\0');
			}
			if (ImGui::InputTextMultiline("##code", buf.data(), buf.size(), ImVec2(-1.f, 220.f),
										 ImGuiInputTextFlags_AllowTabInput)) {
				code.text = buf.data();
				code.dirty = true;
			}
			if (code.readOnly) {
				ImGui::EndDisabled();
			}
			ImGui::PopID();
		}
	}
}

# Port map — Rig ↔ RigViewer

How this viewer relates to [RigWorks](https://github.com/rigkid/RigWorks) schemas.

**Viewer presents; Player plays.** Documents with a play loop (`rig.pixel.*`, Lua `rig.media.code`, music/input) need **RigPlayer**. Opening one here yields skipped keys or a still frame, not a game.

RigViewer has two fulfillments that share the same **known key** list (`web/parse.mjs` `KNOWN_PASS` and `rigProject` `ContractImport`):

| Fulfillment | Path | Present |
|-------------|------|---------|
| **Web** | `web/` (Three.js + Shadertoy for GLSL) | Browser |
| **Desktop** | `desktop/` (RigKit host via `importContractFile`) | GLES / `rigRender3D` |

Unknown `rig.*` keys are reported as **skipped** (overlay on web; log on desktop). Vendor keys `x.*` are ignored without skip noise.

**Legend**

| Mark | Meaning |
|------|---------|
| **Yes** | Fields read and affect present / UI |
| **Partial** | Some fields or a reduced present |
| **Silent** | Accepted (not skipped) but no behavior yet |
| **No** | Not in the known set — shows as skipped |
| **—** | N/A for that fulfillment |

Upstream host map (POD packs): [RigKit port-map](https://github.com/rigkid/RigKit/blob/main/docs/contract/port-map.md). Schema prose: [RigWorks schemas](https://github.com/rigkid/RigWorks/tree/main/schemas).

When you add or drop a key, update `KNOWN_PASS` / `ContractImport` **and** this table in the same change.

---

## Geometry

| Schema | Web | Desktop | Honesty |
|--------|-----|---------|---------|
| `rig.geometry.rectangle` | Yes | Yes | Corner radius → rounded rect when &gt; 0 (desktop). |
| `rig.geometry.ellipse` | Yes | Yes | |
| `rig.geometry.line` | Yes | Yes | |
| `rig.geometry.polygon` | Yes | Yes | |
| `rig.geometry.regular_polygon` | Yes | Yes | |
| `rig.geometry.star` | Yes | Yes | |
| `rig.geometry.arc` | Yes | Yes | |
| `rig.geometry.ring` | Yes | Yes | |
| `rig.geometry.path` | Partial | Partial | Common commands (`moveTo` / `lineTo` / …); exotic path ops may approximate. |
| `rig.geometry.mesh` | Yes | Yes | Positions / indices / mode; face colours when present. |
| `rig.geometry.sphere` | Yes | No | Viewer-authored primitive (`radius` + optional `widthSegments`/`heightSegments`), tessellated client-side. Falls back to the **Preferences → Sphere resolution** default when segments are omitted. Not yet in RigWorks schemas or desktop `ContractImport` — authors should keep using `rig.geometry.mesh` for cross-host documents until it lands upstream. |

---

## Spatial / paint / render

| Schema | Web | Desktop | Honesty |
|--------|-----|---------|---------|
| `rig.spatial.transform` | Yes | Yes | `position` / `rotation` (quat) / `scale`. |
| `rig.spatial.relationship` | Yes | Yes | `parent` → hierarchy. |
| `rig.spatial.camera` | Yes | Yes | No camera → ortho 2D (Y-down). Active perspective → 3D orbit. |
| `rig.spatial.group` | Silent | Silent | Marker; children use relationship. |
| `rig.spatial.layer` | Silent | Silent | Accepted; no layer compositor in the viewer. |
| `rig.paint.fill_stroke` | Yes | Yes | Fill / stroke rgba + widths → style / `CDrawStyle`. |
| `rig.paint.solid` | Yes | Yes | Swatch / paint-only entity; UI can bind `rgba`. |
| `rig.render.visibility` | Yes | Yes | `visible: false` skips the entity. |
| `rig.render.material` | Yes | Yes | Albedo (and emissive when present) → mesh colour / `CDrawStyle`. |
| `rig.render.light` | Yes | Yes | Directional / point; desktop defaults `banded=false` to match web. |
| `rig.meta.named` | Yes | Yes | Display name / stable id chrome. |
| `rig.interact.selectable` | Silent | Yes | Desktop pick / Scene honor `enabled`. Web scene pick not wired. |

---

## Modulators

| Schema | Web | Desktop | Honesty |
|--------|-----|---------|---------|
| `rig.mod.lfo` | Yes | Yes | Waveforms: sine / tri / saw / square. |
| `rig.mod.binding` | Yes | Yes | LFO → transform channels (`position.*` / …); min/max/depth/additive. |

Shared action id: `lfo.resetPhase` (web UI + desktop Contract UI).

---

## UI

| Schema | Web | Desktop | Honesty |
|--------|-----|---------|---------|
| `rig.ui.panel` | Yes | Yes | Web: floating HTML panels. Desktop: **Contract UI** ImGui window. |
| `rig.ui.group` | Yes | Yes | Nested groups. |
| `rig.ui.control` | Yes | Yes | Slider / toggle / colour / dropdown / field (widget auto or explicit). |
| `rig.ui.action` | Yes | Yes | Buttons → known `actionId`s. |

Viewer-local property (not a schema): `viewer` / `activeCodeId` switches the active `rig.media.code` buffer on web.

---

## Media

| Schema | Web | Desktop | Honesty |
|--------|-----|---------|---------|
| `rig.media.code` | Partial | Partial | **GLSL:** web Shadertoy-style preview + live textarea; desktop imports `CCode` (no live GLES FBO yet). **Lua / pico8:** not played here — banner / shell points at **RigPlayer** (`.rig`). |
| `rig.media.asset_ref` | No | No | Skipped. |
| `rig.media.text` | No | No | Skipped. |

---

## Not in this viewer (skipped)

Everything else in the Rig catalog — including but not limited to:

| Family | Examples |
|--------|----------|
| `rig.music.*` | transport, sequencer, pattern, note, midi |
| `rig.anim.*` | tween |
| `rig.node.*` | graph, node, pin, link |
| `rig.pixel.*` | canvas, palette, tile-map, effect-chain |
| `rig.io.*` / `rig.sensor.*` | OSC, sACN, serial, GPIO |
| `rig.led.*` / `rig.sim.*` / `rig.layout.*` | |
| Remaining `rig.paint.*` | gradient, library (beyond solid / fill_stroke) |

Open those documents anyway: known entities still draw; unknown keys list under **Skipped**.

---

## Host chrome (not schemas)

| Capability | Web | Desktop |
|------------|-----|---------|
| Open / drop / `?src=` | Yes | File → Open / CLI path |
| `?doc=` inline sketch | Yes (soft 4k / hard 8k encoded; banner feedback) | — |
| Save local / `?local=1` | Yes (`localStorage`) | — |
| Orbit (perspective) | Drag + scroll | Right-drag (always); Select left-drag after threshold; scroll zoom |
| Pan / zoom (ortho) | Drag + scroll | Host camera (no dedicated pan tool yet) |
| Edit Mode / Tools | — | Yes (Ctrl+E); Select pick; Move/Rotate/Scale ImGuizmo |
| Scene / Properties | — | rigImGui host panels |
| Code editor (GLSL) | Yes | Multiline over `CCode` |
| Live shader preview | Yes | No (import only) |
| Single-file offline | `dist/rigviewer.html` | — |
| Preferences (shading, sphere resolution) | Yes (`localStorage`) | — |

---

## Examples → coverage

| Example | Exercises |
|---------|-----------|
| `examples/minimal-scene.json` | 2D geometry + ortho camera |
| `examples/demo-3d.json` | Mesh + material + light + perspective orbit |
| `examples/demo-solar.json` | `rig.geometry.sphere` primitives + point lights + LFO orbit bindings |
| `examples/demo-gleditor.json` | `rig.media.code` + UI buffer switch + editor |
| `examples/lfo-binding.json` | LFO + binding + reset action |
| `examples/ui-panel.json` / `portable-tool.json` | UI + `paint.solid` |

Smoke: `npm test` (parser over examples). Desktop: build `RigViewer` and open the same files.

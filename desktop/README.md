# Desktop RigViewer

RigKit product app. Loads Contract JSON (`rig.*` keys) via `rigProject::importContractFile` into host PODs, then presents with `rigSystems` / `rigRender3D`. Contract UI chrome stays app-local (`ContractUiWindow`).

## Build

```bash
# One-time: RigKit as submodule (or pass -DRIGKIT_DIR=...)
git submodule add https://github.com/rigkid/RigKit.git desktop/rigkit
git submodule update --init --recursive

cmake -S desktop -B desktop/build -DRIGKIT_DIR=desktop/rigkit
cmake --build desktop/build --config Release --target RigViewer
```

Local monorepo shortcut (sibling `../RigKit`):

```bash
cmake -S desktop -B desktop/build -DRIGKIT_DIR=../RigKit
cmake --build desktop/build --config Release --target RigViewer
```

## Run

```bash
desktop/build/bin/RigViewer path/to/scene.json
# or open File → Open... in the window
```

The center of the window is the live GL present (shapes / lit meshes). Side panels include Scene / Properties / Log plus **Contract UI** when the document has `rig.ui.*`. Materials map to `CDrawStyle` albedo; lights to `CLight` (same keys as the web viewer). Perspective docs: **right-drag** (or left-drag in Tools → Select) to orbit, scroll to zoom. **Edit Mode** starts ON (Ctrl+E toggles). Tools → **Select** click-picks a mesh; Tools → Move / Rotate / Scale draws ImGuizmo. Scene / Properties panels are available.

Supported Contract keys: [docs/port-map.md](../docs/port-map.md).

Desktop chrome (File → Open, skipped keys, Edit Mode) comes from **rigDocumentShell** — document-host UI only (not load/serialize; that is **rigProject**). Shared with RigPlayer.

If an old `imgui.ini` covered the center with a docked panel, delete `desktop/build/bin/data/user/workspaces/` and relaunch.

Pi risk: low — uses existing GLES present paths only. Emscripten/wasm is a separate RigKit host issue.


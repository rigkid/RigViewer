/**
 * Shared ImTui host — grid widgets, dock, document-panel fulfillment (no WebGL).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tuiUrl = pathToFileURL(path.join(root, "web/tui/index.mjs")).href;
const {
	ImTui,
	C,
	TuiDock,
	gridMetrics,
	documentHasChrome,
	drawDocumentControls,
	syncHostWindows,
	viewMenuItems,
	WIN,
} = await import(tuiUrl);
const { parseDocumentText, getProperty, setProperty, runAction, SUPPORTED_ACTION_IDS } = await import(
	pathToFileURL(path.join(root, "web/parse.mjs"))
);

function boot(tui, cols = 80, rows = 24) {
	tui.beginScreen(0, 0, 8, 16, cols, rows);
	tui.fillDesk();
}

function accessors() {
	return { getProperty, setProperty, runAction, supportedActions: SUPPORTED_ACTION_IDS, onChange: () => {} };
}

test("gridMetrics fills a typical viewport", () => {
	const m = gridMetrics(1280, 720);
	assert.ok(m.cols >= 48);
	assert.ok(m.rows >= 20);
	assert.ok(m.cellW >= 8);
	assert.ok(m.cellH >= 14);
});

test("ImTui button click + slider drag", () => {
	const tui = new ImTui();
	boot(tui);
	const client = tui.window(0, 0, 40, 12, "Test");
	assert.equal(client.x, 1);
	tui.setPointer(tui.originX + 2 * tui.cellW, tui.originY + 1 * tui.cellH, true, true, false);
	assert.equal(tui.button("go", "Go"), false);
	assert.equal(tui.activeId, "go");
	tui.setPointer(tui.originX + 2 * tui.cellW, tui.originY + 1 * tui.cellH, false, false, true);
	tui.cx = client.x;
	tui.cy = client.y;
	assert.equal(tui.button("go", "Go"), true);

	boot(tui);
	tui.window(0, 0, 40, 8, "Sliders");
	tui.setPointer(tui.originX + 20 * tui.cellW, tui.originY + 1 * tui.cellH, true, true, false);
	assert.ok(tui.slider("ax", "wght", 0, 0, 100) > 0);
});

test("menubar opens a dropdown command", () => {
	const tui = new ImTui();
	boot(tui, 80, 20);
	const menus = [{ id: "file", label: "File", items: [{ id: "open", label: "Open..." }] }];
	const brand = "RigViewer";
	const x = 1 + brand.length + 2;
	tui.setPointer(tui.originX + (x + 2) * tui.cellW, tui.originY, true, true, false);
	const bar = tui.menubar(menus, "", brand);
	assert.equal(bar.open, "file");
	tui.setPointer(tui.originX + (x + 2) * tui.cellW, tui.originY + 2 * tui.cellH, true, true, false);
	assert.equal(tui.menuDropdown(menus, "file", bar.anchors).cmd, "open");
});

test("ui-panel.json and portable-tool.json draw without throwing", () => {
	for (const name of ["ui-panel.json", "portable-tool.json", "demo-gleditor.json"]) {
		const parsed = parseDocumentText(fs.readFileSync(path.join(root, "examples", name), "utf8"));
		assert.ok(documentHasChrome(parsed, SUPPORTED_ACTION_IDS) || (parsed.codes || []).length > 0, name);
		const tui = new ImTui();
		boot(tui, 40, 30);
		tui.window(0, 0, 40, 30, "Document");
		drawDocumentControls(tui, parsed, accessors());
		assert.ok(tui.visible().filter((c) => c.ch !== " ").length > 10, name);
	}
	assert.ok(C.live);
});

test("unknown actionId is hidden; lfo.resetPhase is shown", () => {
	const tui = new ImTui();
	boot(tui, 40, 16);
	tui.window(0, 0, 40, 16, "Document");
	drawDocumentControls(
		tui,
		{
			panels: [{ id: "p", name: "Tool", visible: true, role: "mod.lfo" }],
			groups: [],
			controls: [],
			actions: [
				{ id: "a1", panel: "p", group: null, order: 0, actionId: "lfo.resetPhase", name: "Reset" },
				{ id: "a2", panel: "p", group: null, order: 1, actionId: "host.private", name: "Secret" },
			],
		},
		accessors(),
	);
	const text = tui
		.visible()
		.map((c) => c.ch)
		.join("");
	assert.match(text, /Reset/);
	assert.doesNotMatch(text, /Secret/);
});

test("dock snaps a dragged window to the right and View lists it", () => {
	const dock = new TuiDock();
	const parsed = {
		panels: [{ id: "tool", name: "Tool", visible: true, role: "mod.lfo" }],
		controls: [],
		actions: [],
		groups: [],
	};
	syncHostWindows(dock, {
		parsed,
		report: { issues: [] },
		hasCode: false,
		showInfo: true,
		showPrefs: true,
		supportedActions: SUPPORTED_ACTION_IDS,
	});
	assert.ok(dock.get(WIN.info));
	assert.ok(dock.get("panel:tool"));
	const labels = viewMenuItems(dock).map((it) => it.label);
	assert.ok(labels.some((l) => l.includes("Tool")));
	assert.ok(labels.some((l) => l.includes("Info")));
	assert.ok(labels.some((l) => l.includes("Preferences")));

	const storyDock = new TuiDock();
	syncHostWindows(storyDock, {
		parsed: { stories: [{ name: "varbook", blocks: [] }], geometryCount: 0, panels: [], controls: [], actions: [], groups: [] },
		report: { issues: [] },
		hasStory: true,
		storyOnly: true,
		storyTitle: "varbook",
		showInfo: true,
		supportedActions: SUPPORTED_ACTION_IDS,
	});
	const book = storyDock.get(WIN.book);
	assert.ok(book);
	assert.equal(book.kind, "book");
	assert.equal(book.dock, "center");

	const tui = new ImTui();
	boot(tui, 80, 24);
	const work = { x: 0, y: 1, w: 80, h: 22 };
	dock.begin(tui, work);
	const tool = dock.get("panel:tool");
	assert.equal(tool.dock, "right");
	tool.dock = "float";
	tool.x = 70;
	tool.y = 4;
	tool.w = 20;
	tool.h = 10;
	dock.dropDock(tool, work);
	assert.equal(tool.dock, "right");

	dock.toggle(WIN.info);
	assert.equal(dock.get(WIN.info).visible, false);
	dock.toggle(WIN.info);
	assert.equal(dock.get(WIN.info).visible, true);
});

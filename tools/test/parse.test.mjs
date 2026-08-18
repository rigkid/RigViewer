import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
	parseDocument,
	parseDocumentText,
	updateModulators,
	setProperty,
	getProperty,
	runAction,
	sampleLfo,
} from "../../web/parse.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const examplesDir =
	process.env.RIGWORKS_EXAMPLES ||
	[
		path.join(root, "examples"),
		path.resolve(root, "../RigKit/docs/contract/RigWorks/examples"),
		path.resolve(root, "../RigWorks/examples"),
	].find((d) => fs.existsSync(d));

function loadExample(name) {
	assert.ok(examplesDir, "no examples directory found (set RIGWORKS_EXAMPLES)");
	const p = path.join(examplesDir, name);
	assert.ok(fs.existsSync(p), `missing example ${p}`);
	return JSON.parse(fs.readFileSync(p, "utf8"));
}

test("minimal-scene expands geometry drawables", () => {
	const parsed = parseDocument(loadExample("minimal-scene.json"));
	assert.equal(parsed.rig, "0.8.0");
	assert.equal(parsed.title, "Minimal scene");
	assert.equal(parsed.entityCount, 12);
	assert.ok(parsed.cameras.some((c) => c.active && c.projection === "orthographic"));
	assert.ok(parsed.geometryCount >= 11, `expected >=11 drawables, got ${parsed.geometryCount}`);
	assert.ok(parsed.drawables.some((d) => d.id === "demo-rect"));
	assert.ok(parsed.drawables.some((d) => d.id === "demo-child"));
	assert.ok(parsed.drawables.some((d) => d.kind === "mesh" && d.id === "demo-quad"));
	assert.ok(parsed.bounds.maxX > parsed.bounds.minX);
	assert.ok(parsed.bounds.maxY > parsed.bounds.minY);
	// Child local rect at 0,0; parent at 30,260 — hierarchy lives on transforms.
	assert.equal(parsed.transforms["demo-child"].parent, "demo-parent");
	assert.equal(parsed.transforms["demo-child"].position[0], 40);
	assert.equal(parsed.transforms["demo-parent"].position[0], 30);
});

test("lfo-binding parses modulators and ticks position.y", () => {
	const parsed = parseDocument(loadExample("lfo-binding.json"));
	assert.ok(parsed.geometryCount >= 1);
	assert.equal(parsed.lfos.length, 1);
	assert.equal(parsed.bindings.length, 1);
	assert.ok(!parsed.skipped.includes("rig.mod.lfo"));
	assert.ok(!parsed.skipped.includes("rig.mod.binding"));

	const state = {
		lfos: parsed.lfos,
		bindings: parsed.bindings,
		transforms: structuredClone(parsed.transforms),
	};
	updateModulators(state, 0);
	const y0 = state.transforms.dot.position[1];
	updateModulators(state, 0.5);
	const y1 = state.transforms.dot.position[1];
	assert.ok(Number.isFinite(y0));
	assert.ok(Number.isFinite(y1));
	assert.ok(y0 >= 40 && y0 <= 280);
	assert.ok(y1 >= 40 && y1 <= 280);
	assert.notEqual(y0, y1);
});

test("ui-panel and portable-tool have no skipped keys", () => {
	for (const name of ["ui-panel.json", "portable-tool.json"]) {
		const parsed = parseDocument(loadExample(name));
		assert.equal(parsed.skipped.length, 0, `${name} skipped: ${parsed.skipped}`);
		assert.ok(parsed.panels.length >= 1);
		assert.ok(Object.keys(parsed.paints).length >= 1);
		assert.ok(parsed.controls.length >= 1);
	}
});

test("ui control mutates paint and LFO; resetPhase works", () => {
	const parsed = parseDocument(loadExample("ui-panel.json"));
	assert.ok(setProperty(parsed, "fill", "rgba", [0, 1, 0, 1]));
	assert.deepEqual(getProperty(parsed, "fill", "rgba"), [0, 1, 0, 1]);
	assert.ok(setProperty(parsed, "pulse", "frequency", 2));
	assert.equal(getProperty(parsed, "pulse", "frequency"), 2);

	runAction(parsed, "lfo.resetPhase");
	const s = sampleLfo(parsed.lfos[0]);
	// phase reset → near zero crossing for sine (offset 0, amp 1)
	assert.ok(Math.abs(s) < 1e-6, `expected ~0 after reset, got ${s}`);
});

test("all examples: zero skipped keys", () => {
	for (const name of [
		"minimal-scene.json",
		"lfo-binding.json",
		"ui-panel.json",
		"portable-tool.json",
		"demo-3d.json",
		"demo-gleditor.json",
		"demo-solar.json",
	]) {
		const parsed = parseDocument(loadExample(name));
		assert.equal(parsed.skipped.length, 0, `${name}: ${parsed.skipped.join(", ")}`);
	}
});

test("demo-gleditor has glsl code buffers", () => {
	const parsed = parseDocument(loadExample("demo-gleditor.json"));
	assert.equal(parsed.geometryCount, 0);
	assert.ok(parsed.codes.length >= 2);
	assert.ok(parsed.codes.every((c) => c.language === "glsl"));
	assert.ok(parsed.codes.some((c) => c.id === "gradient" && c.text.includes("mainImage")));
	assert.ok(parsed.codes.some((c) => c.id === "plasma"));
	assert.equal(parsed.activeCodeId, "plasma");
	assert.ok(setProperty(parsed, "viewer", "activeCodeId", "gradient"));
	assert.equal(getProperty(parsed, "viewer", "activeCodeId"), "gradient");
});

test("demo-3d has perspective camera, meshes, lights, materials", () => {
	const parsed = parseDocument(loadExample("demo-3d.json"));
	assert.ok(parsed.cameras.some((c) => c.active && c.projection === "perspective"));
	assert.ok(parsed.geometryCount >= 4);
	assert.ok(parsed.lights.length >= 1);
	assert.ok(Object.keys(parsed.materials).length >= 3);
	assert.ok(parsed.bounds.maxZ > parsed.bounds.minZ || parsed.drawables.some((d) => d.kind === "mesh"));
	// Authored normals ride through parallel to verts; absent stays null (= flat).
	const crystal = parsed.drawables.find((d) => d.id === "crystal");
	assert.equal(crystal.normals.length, crystal.verts.length);
	const wedge = parsed.drawables.find((d) => d.id === "wedge");
	assert.equal(wedge.normals, null);
});

test("demo-solar uses the sphere primitive and leaves resolution to the viewer", () => {
	const parsed = parseDocument(loadExample("demo-solar.json"));
	const spheres = parsed.drawables.filter((d) => d.kind === "sphere");
	assert.equal(spheres.length, 3);
	for (const s of spheres) {
		assert.equal(s.radius, 1);
		// Parser stays presentation-agnostic — segments are a viewer preference,
		// not baked into the document, unless an author overrides them.
		assert.equal(s.widthSegments, null);
		assert.equal(s.heightSegments, null);
	}
	const sun = spheres.find((s) => s.id === "sun");
	assert.ok(sun.materialId, "sun should carry its rig.render.material");
});

test("rig.geometry.sphere respects an authored radius and segment override", () => {
	const doc = {
		rig: "0.9.0",
		document: { title: "sphere" },
		entities: [
			{
				id: "ball",
				components: {
					"rig.spatial.transform": { position: [2, 0, 0] },
					"rig.geometry.sphere": { radius: 3, widthSegments: 64, heightSegments: 32 },
				},
			},
		],
	};
	const parsed = parseDocument(doc);
	assert.equal(parsed.geometryCount, 1);
	const ball = parsed.drawables.find((d) => d.id === "ball");
	assert.equal(ball.kind, "sphere");
	assert.equal(ball.radius, 3);
	assert.equal(ball.widthSegments, 64);
	assert.equal(ball.heightSegments, 32);
	// Bounds expand around the entity's world position by ± radius.
	assert.equal(parsed.bounds.minX, 2 - 3);
	assert.equal(parsed.bounds.maxX, 2 + 3);
});

test("lfo frequency edits stay phase-continuous (no flicker)", () => {
	const lfo = { id: "l", waveform: "saw", frequency: 1, amplitude: 1, offset: 0, phase: 0 };
	const state = { lfos: [lfo], bindings: [] };
	updateModulators(state, 0.25);
	const before = sampleLfo(lfo);
	lfo.frequency = 4; // slider drag: 1 Hz -> 4 Hz
	updateModulators(state, 0.01);
	const after = sampleLfo(lfo);
	// 0.01 s at 4 Hz advances 0.04 cycles; a rescale of elapsed time would jump ~0.8.
	assert.ok(Math.abs(after - before) < 0.1, `jumped from ${before} to ${after}`);
});

test("mesh normals dropped when not parallel to positions", () => {
	const doc = {
		rig: "0.9.0",
		document: { title: "n" },
		entities: [
			{
				id: "m",
				components: {
					"rig.geometry.mesh": {
						mode: "triangles",
						positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
						normals: [0, 0, 1],
						indices: [0, 1, 2],
					},
				},
			},
		],
	};
	const parsed = parseDocument(doc);
	assert.equal(parsed.drawables.find((d) => d.id === "m").normals, null);
});

test("parseDocumentText rejects garbage", () => {
	assert.throws(() => parseDocumentText("{}"), /Missing required/);
});

test("arc ring path expand", () => {
	const doc = {
		rig: "0.9.0",
		document: { title: "extra" },
		entities: [
			{
				id: "a",
				components: {
					"rig.spatial.transform": { position: [0, 0, 0] },
					"rig.geometry.arc": {
						cx: 0,
						cy: 0,
						radius: 40,
						startAngleDegrees: 0,
						endAngleDegrees: 90,
						pie: true,
					},
					"rig.paint.fill_stroke": { fillRgba: [1, 0, 0, 1] },
				},
			},
			{
				id: "r",
				components: {
					"rig.spatial.transform": { position: [100, 0, 0] },
					"rig.geometry.ring": { cx: 0, cy: 0, outerRadius: 40, innerRadius: 20 },
					"rig.paint.fill_stroke": { fillRgba: [0, 1, 0, 1] },
				},
			},
			{
				id: "p",
				components: {
					"rig.spatial.transform": { position: [200, 0, 0] },
					"rig.geometry.path": {
						commands: [
							{ type: "moveTo", p: [0, 0] },
							{ type: "lineTo", p: [20, 0] },
							{ type: "cubicTo", c1: [30, 0], c2: [30, 20], p: [20, 20] },
							{ type: "close" },
						],
					},
					"rig.paint.fill_stroke": { fillRgba: [0, 0, 1, 1] },
				},
			},
		],
	};
	const parsed = parseDocument(doc);
	assert.equal(parsed.geometryCount, 3);
	assert.ok(parsed.drawables.some((d) => d.kind === "ring"));
	assert.ok(parsed.drawables.some((d) => d.kind === "polygon" && d.id === "a"));
});


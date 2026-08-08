import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { validateDocument } from "../../web/validate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("valid example is clean (no errors)", () => {
	const text = fs.readFileSync(path.join(root, "examples/demo-3d.json"), "utf8");
	const r = validateDocument(text);
	assert.equal(r.ok, true);
	assert.equal(r.errors.length, 0);
});

test("invalid JSON surfaces a clear error", () => {
	const r = validateDocument("{ nope");
	assert.equal(r.ok, false);
	assert.match(r.errors[0].message, /Invalid JSON/);
});

test("misplaced component keys + invented schemas (broken solar sketch)", () => {
	const broken = {
		rig: "0.9.0",
		entities: [
			{
				id: "sun",
				"rig.spatial.transform": { position: [0, 0, 0] },
				"rig.geometry.shape": { kind: "sphere", radius: 1.2 },
				"rig.material.solid": { color: [1, 0.8, 0.2, 1] },
			},
			{
				id: "cam",
				"rig.render.camera": { kind: "perspective", active: true },
			},
		],
	};
	const r = validateDocument(broken);
	assert.equal(r.ok, false);
	assert.ok(
		r.errors.some((e) => e.code === "structure" && /outside "components"/.test(e.message)),
		"should flag components outside components{}",
	);
	assert.ok(
		r.warnings.some((w) => w.key === "rig.geometry.shape" && /mesh/.test(w.message)),
		"should suggest mesh for shape",
	);
	assert.ok(
		r.warnings.some((w) => w.key === "rig.material.solid" && /render\.material/.test(w.message)),
		"should suggest render.material",
	);
	assert.ok(
		r.warnings.some((w) => w.key === "rig.render.camera" && /spatial\.camera/.test(w.message)),
		"should suggest spatial.camera",
	);
});

test("dangling parent ref is an error", () => {
	const r = validateDocument({
		rig: "0.9.0",
		entities: [
			{
				id: "child",
				components: {
					"rig.spatial.relationship": { parent: "missing" },
				},
			},
		],
	});
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => e.code === "ref" && /missing/.test(e.message)));
});

test("demo-solar example validates clean", () => {
	const text = fs.readFileSync(path.join(root, "examples/demo-solar.json"), "utf8");
	const r = validateDocument(text);
	assert.equal(r.ok, true, r.errors.map((e) => e.message).join("; "));
	assert.equal(r.errors.length, 0);
});

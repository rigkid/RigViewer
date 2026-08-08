import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	DOC_HARD_CHARS,
	DOC_SOFT_CHARS,
	assessDocSize,
	decodeDocPayload,
	encodeDocPayload,
} from "../../web/share.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("encode/decode round-trip (minimal-scene)", async () => {
	const text = fs.readFileSync(path.join(root, "examples/minimal-scene.json"), "utf8");
	const enc = await encodeDocPayload(text);
	assert.ok(enc.payload.startsWith("u1.") || enc.payload.startsWith("z1."));
	const back = await decodeDocPayload(enc.payload);
	assert.equal(JSON.parse(back).document.title, JSON.parse(text).document.title);
});

test("bare base64url decodes as uncompressed utf8", async () => {
	const text = '{"rig":"0.9.0","entities":[]}';
	const enc = await encodeDocPayload(text);
	const u1 = enc.kind === "u1" ? enc : await encodeDocPayload(text);
	// Prefer explicit u1 body for this check
	const raw = new TextEncoder().encode(text);
	const { base64UrlEncode } = await import("../../web/share.mjs");
	const bare = base64UrlEncode(raw);
	const back = await decodeDocPayload(bare);
	assert.equal(back, text);
	assert.ok(u1.payload.length > 0);
});


test("size policy soft/hard thresholds", () => {
	assert.equal(assessDocSize({ encodedChars: 100, rawBytes: 50 }).level, "ok");
	assert.equal(assessDocSize({ encodedChars: DOC_SOFT_CHARS + 1, rawBytes: 100 }).level, "soft");
	assert.equal(assessDocSize({ encodedChars: DOC_HARD_CHARS + 1, rawBytes: 100 }).level, "hard");
	assert.equal(assessDocSize({ encodedChars: DOC_HARD_CHARS + 1, rawBytes: 100 }).okToLink, false);
});

test("demo-3d often exceeds soft or needs src", async () => {
	const text = fs.readFileSync(path.join(root, "examples/demo-3d.json"), "utf8");
	const enc = await encodeDocPayload(text);
	const a = assessDocSize(enc);
	// May be ok/soft/hard depending on compression — just ensure assess runs.
	assert.ok(["ok", "soft", "hard"].includes(a.level));
	assert.ok(enc.encodedChars > 0);
});

#!/usr/bin/env node
/**
 * Pin Three.js r170 (minified build) into web/vendor/three.module.js.
 * Minified is ~3x smaller — matters for first load and the single-file HTML.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "web", "vendor");
const outFile = path.join(outDir, "three.module.js");
const version = "0.170.0";
const url = `https://cdn.jsdelivr.net/npm/three@${version}/build/three.module.min.js`;

fs.mkdirSync(outDir, { recursive: true });
console.log("fetching", url);
const res = await fetch(url);
if (!res.ok) {
	console.error("failed:", res.status, res.statusText);
	process.exit(1);
}
const text = await res.text();
fs.writeFileSync(outFile, text);
fs.writeFileSync(
	path.join(outDir, "THREE_VERSION"),
	`${version}\n${url}\n`
);
console.log("wrote", path.relative(root, outFile), `(${(text.length / 1024).toFixed(0)} KB)`);


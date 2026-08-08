#!/usr/bin/env node
/**
 * Build dist/rigviewer.html — one self-contained file (Three.js + modules inlined).
 * Double-click / file:// friendly via blob-URL ES modules.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const web = path.join(root, "web");
const threePath = path.join(web, "vendor", "three.module.js");
const parsePath = path.join(web, "parse.mjs");
const viewerPath = path.join(web, "viewer.mjs");
const uiPath = path.join(web, "ui.mjs");
const sharePath = path.join(web, "share.mjs");
const shaderPath = path.join(web, "shader.mjs");
const appPath = path.join(web, "app.mjs");
const indexPath = path.join(web, "index.html");
const outPath = path.join(root, "dist", "rigviewer.html");

if (!fs.existsSync(threePath)) {
	console.error("Missing web/vendor/three.module.js — run: node tools/vendor-three.mjs");
	process.exit(1);
}

const threeSrc = fs.readFileSync(threePath, "utf8");
let parseSrc = fs.readFileSync(parsePath, "utf8");
const viewerSrc = fs.readFileSync(viewerPath, "utf8");
const uiSrc = fs.readFileSync(uiPath, "utf8");
const shareSrc = fs.readFileSync(sharePath, "utf8");
const shaderSrc = fs.readFileSync(shaderPath, "utf8");
const appSrc = fs.readFileSync(appPath, "utf8");
const indexHtml = fs.readFileSync(indexPath, "utf8");

parseSrc = parseSrc.replace(/^export /gm, "").replace(/export \{[^}]+\};?\s*/g, "");
parseSrc +=
	"\nexport { parseDocument, parseDocumentText, tickModulators, sampleLfo, getProperty, setProperty, runAction };\n";

const styleMatch = indexHtml.match(/<style>([\s\S]*?)<\/style>/);
const bodyMatch = indexHtml.match(/<body>([\s\S]*?)<script/);
const style = styleMatch ? styleMatch[1] : "";
const bodyChrome = bodyMatch
	? bodyMatch[1]
			.replace(/href="rigviewer\.html"/g, 'href="#"')
			.replace(/\s*hidden/, "")
	: "";

const boot = `
const threeUrl = URL.createObjectURL(new Blob([${JSON.stringify(threeSrc)}], { type: "text/javascript" }));
const parseUrl = URL.createObjectURL(new Blob([${JSON.stringify(parseSrc)}], { type: "text/javascript" }));
const shareUrl = URL.createObjectURL(new Blob([${JSON.stringify(shareSrc)}], { type: "text/javascript" }));
const shaderUrl = URL.createObjectURL(new Blob([${JSON.stringify(shaderSrc)}], { type: "text/javascript" }));

const viewerBody = ${JSON.stringify(viewerSrc)}
	.replace(/from ["']\\.\\/vendor\\/three\\.module\\.js["']/, \`from "\${threeUrl}"\`)
	.replace(/from ["']\\.\\/parse\\.mjs["']/, \`from "\${parseUrl}"\`)
	.replace(/from ["']\\.\\/shader\\.mjs["']/, \`from "\${shaderUrl}"\`);
const uiBody = ${JSON.stringify(uiSrc)}
	.replace(/from ["']\\.\\/parse\\.mjs["']/, \`from "\${parseUrl}"\`);
const appBody = ${JSON.stringify(appSrc)}
	.replace(/from ["']\\.\\/viewer\\.mjs["']/, "from \\"__VIEWER__\\"")
	.replace(/from ["']\\.\\/ui\\.mjs["']/, "from \\"__UI__\\"")
	.replace(/from ["']\\.\\/share\\.mjs["']/, \`from "\${shareUrl}"\`);

const viewerUrl = URL.createObjectURL(new Blob([viewerBody], { type: "text/javascript" }));
const uiUrl = URL.createObjectURL(new Blob([uiBody], { type: "text/javascript" }));
const appResolved = appBody.replaceAll("__VIEWER__", viewerUrl).replaceAll("__UI__", uiUrl);
const appUrl = URL.createObjectURL(new Blob([appResolved], { type: "text/javascript" }));
await import(appUrl);
`;

const out = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>RigViewer</title>
	<style>${style}</style>
</head>
<body>
${bodyChrome}
<script type="module">
${boot}
</script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out);
fs.writeFileSync(path.join(web, "rigviewer.html"), out);
console.log("wrote", path.relative(root, outPath), `(${(out.length / 1024).toFixed(0)} KB)`);
console.log("wrote", path.relative(root, path.join(web, "rigviewer.html")));

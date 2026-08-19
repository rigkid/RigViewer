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
const editorPath = path.join(web, "editor.mjs");
const sharePath = path.join(web, "share.mjs");
const shaderPath = path.join(web, "shader.mjs");
const validatePath = path.join(web, "validate.mjs");
const tuiEnginePath = path.join(web, "tui", "engine.mjs");
const tuiDrawPath = path.join(web, "tui", "draw.mjs");
const tuiDockPath = path.join(web, "tui", "dock.mjs");
const tuiPanelsPath = path.join(web, "tui", "panels.mjs");
const tuiHostPath = path.join(web, "tui", "host.mjs");
const tuiIndexPath = path.join(web, "tui", "index.mjs");
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
const editorSrc = fs.readFileSync(editorPath, "utf8");
const shareSrc = fs.readFileSync(sharePath, "utf8");
const shaderSrc = fs.readFileSync(shaderPath, "utf8");
const validateSrc = fs.readFileSync(validatePath, "utf8");
const tuiEngineSrc = fs.readFileSync(tuiEnginePath, "utf8");
const tuiDrawSrc = fs.readFileSync(tuiDrawPath, "utf8");
const tuiDockSrc = fs.readFileSync(tuiDockPath, "utf8");
const tuiPanelsSrc = fs.readFileSync(tuiPanelsPath, "utf8");
const tuiHostSrc = fs.readFileSync(tuiHostPath, "utf8");
const tuiIndexSrc = fs.readFileSync(tuiIndexPath, "utf8");
const appSrc = fs.readFileSync(appPath, "utf8");
const indexHtml = fs.readFileSync(indexPath, "utf8");

parseSrc = parseSrc.replace(/^export /gm, "").replace(/export \{[^}]+\};?\s*/g, "");
parseSrc +=
	"\nexport { parseDocument, parseDocumentText, updateModulators, sampleLfo, getProperty, setProperty, runAction, SUPPORTED_ACTION_IDS };\n";

const styleMatch = indexHtml.match(/<style>([\s\S]*?)<\/style>/);
const bodyMatch = indexHtml.match(/<body>([\s\S]*?)<script/);
const style = styleMatch ? styleMatch[1] : "";
const bodyChrome = bodyMatch ? bodyMatch[1] : "";

const boot = `
const threeUrl = URL.createObjectURL(new Blob([${JSON.stringify(threeSrc)}], { type: "text/javascript" }));
const parseUrl = URL.createObjectURL(new Blob([${JSON.stringify(parseSrc)}], { type: "text/javascript" }));
const shareUrl = URL.createObjectURL(new Blob([${JSON.stringify(shareSrc)}], { type: "text/javascript" }));
const shaderUrl = URL.createObjectURL(new Blob([${JSON.stringify(shaderSrc)}], { type: "text/javascript" }));
const editorUrl = URL.createObjectURL(new Blob([${JSON.stringify(editorSrc)}], { type: "text/javascript" }));
const validateUrl = URL.createObjectURL(new Blob([${JSON.stringify(validateSrc)}], { type: "text/javascript" }));
const tuiEngineUrl = URL.createObjectURL(new Blob([${JSON.stringify(tuiEngineSrc)}], { type: "text/javascript" }));
const tuiDrawBody = ${JSON.stringify(tuiDrawSrc)}.replace(/from ["']\\.\\/engine\\.mjs["']/, \`from "\${tuiEngineUrl}"\`);
const tuiDrawUrl = URL.createObjectURL(new Blob([tuiDrawBody], { type: "text/javascript" }));
const tuiDockUrl = URL.createObjectURL(new Blob([${JSON.stringify(tuiDockSrc)}], { type: "text/javascript" }));
const tuiPanelsBody = ${JSON.stringify(tuiPanelsSrc)}.replace(/from ["']\\.\\/engine\\.mjs["']/, \`from "\${tuiEngineUrl}"\`);
const tuiPanelsUrl = URL.createObjectURL(new Blob([tuiPanelsBody], { type: "text/javascript" }));
const tuiHostBody = ${JSON.stringify(tuiHostSrc)}.replace(/from ["']\\.\\/panels\\.mjs["']/, \`from "\${tuiPanelsUrl}"\`);
const tuiHostUrl = URL.createObjectURL(new Blob([tuiHostBody], { type: "text/javascript" }));
const tuiIndexBody = ${JSON.stringify(tuiIndexSrc)}
	.replace(/from ["']\\.\\/engine\\.mjs["']/, \`from "\${tuiEngineUrl}"\`)
	.replace(/from ["']\\.\\/draw\\.mjs["']/, \`from "\${tuiDrawUrl}"\`)
	.replace(/from ["']\\.\\/dock\\.mjs["']/, \`from "\${tuiDockUrl}"\`)
	.replace(/from ["']\\.\\/panels\\.mjs["']/, \`from "\${tuiPanelsUrl}"\`)
	.replace(/from ["']\\.\\/host\\.mjs["']/, \`from "\${tuiHostUrl}"\`);
const tuiUrl = URL.createObjectURL(new Blob([tuiIndexBody], { type: "text/javascript" }));

const viewerBody = ${JSON.stringify(viewerSrc)}
	.replace(/from ["']\\.\\/vendor\\/three\\.module\\.js["']/, \`from "\${threeUrl}"\`)
	.replace(/from ["']\\.\\/parse\\.mjs["']/, \`from "\${parseUrl}"\`)
	.replace(/from ["']\\.\\/shader\\.mjs["']/, \`from "\${shaderUrl}"\`);
const appBody = ${JSON.stringify(appSrc)}
	.replace(/from ["']\\.\\/viewer\\.mjs["']/, "from \\"__VIEWER__\\"")
	.replace(/from ["']\\.\\/editor\\.mjs["']/, \`from "\${editorUrl}"\`)
	.replace(/from ["']\\.\\/share\\.mjs["']/, \`from "\${shareUrl}"\`)
	.replace(/from ["']\\.\\/validate\\.mjs["']/, \`from "\${validateUrl}"\`)
	.replace(/from ["']\\.\\/parse\\.mjs["']/, \`from "\${parseUrl}"\`)
	.replace(/from ["']\\.\\/tui\\/index\\.mjs["']/, \`from "\${tuiUrl}"\`);

const viewerUrl = URL.createObjectURL(new Blob([viewerBody], { type: "text/javascript" }));
const appResolved = appBody.replaceAll("__VIEWER__", viewerUrl);
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
	<script>
		(function () {
			var e = new URLSearchParams(location.search).get("embed");
			if (e === "1" || e === "true") document.documentElement.classList.add("embed");
		})();
	</script>
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

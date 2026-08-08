/**
 * Page boot for RigViewer web (used by index.html; inlined by tools/bundle.mjs).
 */
import { parseDocumentText, mountViewer, documentWantsShaderPreview } from "./viewer.mjs";
import { mountUiPanels, wirePanelHead } from "./ui.mjs";
import { validateDocument } from "./validate.mjs";
import {
	assessDocSize,
	buildDocUrl,
	decodeDocPayload,
	encodeDocPayload,
	loadLocalSketch,
	saveLocalSketch,
} from "./share.mjs";

const canvas = document.getElementById("view");
const stage = document.getElementById("stage");
const status = document.getElementById("status");
const overlay = document.getElementById("overlay");
const shareBanner = document.getElementById("share-banner");
const panelsHost = document.getElementById("panels");
const empty = document.getElementById("empty");
const fileInput = document.getElementById("file");
const btnCopy = document.getElementById("btn-copy-link");
const btnSave = document.getElementById("btn-save-local");
const btnRestore = document.getElementById("btn-restore-local");

let handle = null;
let uiHandle = null;
/** @type {string | null} */
let currentText = null;
/** @type {string} */
let currentTitle = "";
let currentParsed = null;
let currentLabel = "";
/** @type {ReturnType<typeof validateDocument> | null} */
let currentReport = null;

let statusTimer = 0;
function flashStatus(message) {
	clearTimeout(statusTimer);
	status.textContent = message;
	statusTimer = setTimeout(() => {
		status.textContent = currentParsed?.title || currentTitle || "";
	}, 4000);
}

function setShareBanner(level, message) {
	if (!shareBanner) return;
	if (!message) {
		shareBanner.hidden = true;
		shareBanner.replaceChildren();
		shareBanner.dataset.level = "";
		return;
	}
	// Informational messages flash in the status text — no banner, no layout shift.
	if (!level || level === "ok") {
		flashStatus(message);
		return;
	}
	shareBanner.hidden = false;
	shareBanner.dataset.level = level;
	const text = document.createElement("span");
	text.textContent = message;
	const close = document.createElement("button");
	close.type = "button";
	close.className = "banner-close";
	close.textContent = "×";
	close.title = "Dismiss";
	close.addEventListener("click", () => setShareBanner("", ""));
	shareBanner.replaceChildren(text, close);
}

function refreshLocalButton() {
	if (!btnRestore) return;
	const local = loadLocalSketch();
	btnRestore.hidden = !local;
	if (local) {
		btnRestore.title = `Restore “${local.title || "sketch"}” (${local.bytes || "?"} bytes)`;
	}
}

const infoPanel = document.getElementById("info-panel");
const infoList = document.getElementById("info-list");
const infoSrc = document.getElementById("info-src");
const viewItems = document.getElementById("view-items");
const prefsPanel = document.getElementById("prefs-panel");
const prefShading = document.getElementById("pref-shading");
const issuesPanel = document.getElementById("issues-panel");
const issuesList = document.getElementById("issues-list");
const issuesRole = document.getElementById("issues-role");

// Viewer preferences — persisted per browser, applied on (re)mount.
const PREFS_KEY = "rigviewer.prefs.v1";
function loadPrefs() {
	const defaults = { shading: "auto" };
	try {
		return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
	} catch {
		return defaults;
	}
}
const prefs = loadPrefs();
function savePrefs() {
	try {
		localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
	} catch {
		/* private mode — prefs just won't stick */
	}
}
function remountViewer() {
	if (!currentParsed) return;
	handle?.dispose();
	handle = mountViewer(canvas, currentParsed, prefs);
}
if (prefShading) {
	prefShading.value = prefs.shading;
	prefShading.addEventListener("change", () => {
		prefs.shading = prefShading.value;
		savePrefs();
		remountViewer();
	});
}

/** Windows owned by the current document (rebuilt on load). */
let docWindows = [];

// View menu = window registry. Future window kinds (node editor, timeline, …)
// just add entries here — same close/reopen/drag/fold behavior for free.
function viewMenuItem(title, checked, onClick) {
	const b = document.createElement("button");
	b.type = "button";
	b.className = "menu-item";
	const check = document.createElement("span");
	check.className = "menu-check";
	check.textContent = checked ? "✓" : "";
	b.append(document.createTextNode(title), check);
	b.addEventListener("click", onClick);
	return b;
}

function refreshViewMenu() {
	if (!viewItems) return;
	viewItems.replaceChildren();
	const wins = [
		{ id: "__info", title: "Info", el: infoPanel },
		{ id: "__issues", title: "Issues", el: issuesPanel },
		...docWindows,
	];
	for (const w of wins) {
		if (!w.el) continue;
		viewItems.appendChild(
			viewMenuItem(w.title, !w.el.hidden, () => {
				w.el.hidden = !w.el.hidden;
				w.el.classList.remove("collapsed");
				if (w.el === infoPanel && !w.el.hidden) renderInfo();
				refreshViewMenu();
			}),
		);
	}
	const sep = document.createElement("div");
	sep.className = "menu-sep";
	viewItems.appendChild(sep);
	viewItems.appendChild(
		viewMenuItem("Full screen", !!document.fullscreenElement, () => {
			if (document.fullscreenElement) document.exitFullscreen();
			else document.documentElement.requestFullscreen();
		}),
	);
}
document.addEventListener("fullscreenchange", () => refreshViewMenu());

function controlsHint(parsed) {
	if (parsed.codes?.some((c) => c.language === "glsl") && !parsed.geometryCount) {
		return "live GLSL preview — edit the buffers";
	}
	if (parsed.cameras?.some((c) => c.active && c.projection === "perspective")) {
		return "drag to orbit, scroll to zoom";
	}
	if (parsed.cameras?.some((c) => c.active)) {
		return "drag to pan, scroll to zoom";
	}
	return "";
}

function renderInfo() {
	if (!infoList || infoPanel.hidden) return;
	infoList.replaceChildren();
	if (!currentParsed) {
		infoSrc.textContent = "Nothing loaded.";
		return;
	}
	const p = currentParsed;
	const rows = [
		["Title", p.title || "Untitled"],
		["Loaded from", currentLabel || "—"],
		["Entities", String(p.entityCount ?? "—")],
		["Drawables", String(p.geometryCount ?? 0)],
		["Code buffers", String(p.codes?.length ?? 0)],
		["Panels", String(p.panels?.length ?? 0)],
		["LFOs", String(p.lfos?.length ?? 0)],
		["Controls", controlsHint(p) || "—"],
		["Skipped keys", p.skipped?.length ? p.skipped.join(", ") : "none"],
		[
			"Validation",
			currentReport
				? `${currentReport.errors.length} error(s), ${currentReport.warnings.length} warning(s)`
				: "—",
		],
	];
	for (const [k, v] of rows) {
		const dt = document.createElement("dt");
		dt.textContent = k;
		const dd = document.createElement("dd");
		dd.textContent = v;
		infoList.append(dt, dd);
	}
	infoSrc.textContent = currentText || "(source text unavailable)";
}

function renderIssues(report, { autoOpen = true } = {}) {
	currentReport = report;
	if (!issuesPanel || !issuesList) return;
	issuesList.replaceChildren();
	const issues = report?.issues || [];
	if (issuesRole) {
		const e = report?.errors?.length || 0;
		const w = report?.warnings?.length || 0;
		issuesRole.textContent = e || w ? `${e}× err · ${w}× warn` : "clean";
	}
	if (!issues.length) {
		issuesPanel.hidden = true;
		refreshViewMenu();
		return;
	}
	for (const it of issues) {
		const li = document.createElement("li");
		li.className = "rig-issue";
		li.dataset.level = it.level || "note";
		const code = document.createElement("span");
		code.className = "rig-issue-code";
		code.textContent = it.level || "note";
		li.append(code, document.createTextNode(it.message));
		if (it.hint) {
			const hint = document.createElement("span");
			hint.className = "rig-issue-hint";
			hint.textContent = it.hint;
			li.appendChild(hint);
		}
		issuesList.appendChild(li);
	}
	const serious = (report.errors?.length || 0) + (report.warnings?.length || 0) > 0;
	if (autoOpen && serious) {
		issuesPanel.hidden = false;
		issuesPanel.classList.remove("collapsed");
	}
	refreshViewMenu();
}

if (infoPanel) {
	wirePanelHead(infoPanel, document.getElementById("info-head"), refreshViewMenu);
}
if (prefsPanel) {
	wirePanelHead(prefsPanel, document.getElementById("prefs-head"), refreshViewMenu);
	document.getElementById("btn-prefs")?.addEventListener("click", () => {
		prefsPanel.hidden = false;
		prefsPanel.classList.remove("collapsed");
		refreshViewMenu();
	});
}
if (issuesPanel) {
	wirePanelHead(issuesPanel, document.getElementById("issues-head"), refreshViewMenu);
}
refreshViewMenu();

function needsPlayer(parsed) {
	if (parsed.codes?.some((c) => c.language === "lua" || c.language === "pico8")) {
		return true;
	}
	return (parsed.skipped || []).some(
		(k) =>
			k.startsWith("rig.pixel.") ||
			k.startsWith("rig.music.") ||
			k.startsWith("rig.input.") ||
			k.startsWith("rig.media.code"),
	);
}

function showParsed(parsed, label, sourceText) {
	handle?.dispose();
	uiHandle?.dispose();
	handle = mountViewer(canvas, parsed, prefs);
	// Shader docs get the Hydra-style layout: code floating over the visual.
	panelsHost.classList.toggle("code-overlay", documentWantsShaderPreview(parsed));
	uiHandle = mountUiPanels(panelsHost, parsed, {
		getTime: () => handle?.getTime?.() ?? 0,
		onChange: () => handle?.invalidate?.(),
		onWindowState: refreshViewMenu,
	});
	docWindows = uiHandle.windows || [];
	refreshViewMenu();
	empty.style.display = "none";
	if (typeof sourceText === "string") {
		currentText = sourceText;
		currentTitle = parsed.title || "";
	}
	currentParsed = parsed;
	currentLabel = label || "";
	// Keep the bar quiet — details live in File → Info.
	status.textContent = parsed.title || "Untitled";
	renderInfo();
	if (needsPlayer(parsed)) {
		setShareBanner(
			"soft",
			"This document has a play loop — Viewer presents; Player plays. Open the .rig in RigPlayer.",
		);
	} else {
		setShareBanner("", "");
	}
	// Skipped keys also surface via the validator (unknown schemas).
	if (overlay) {
		overlay.style.display = "none";
		overlay.textContent = "";
	}
	document.title = `${parsed.title} · RigViewer`;
	refreshLocalButton();
}

async function loadText(text, label) {
	const report = validateDocument(text);
	renderIssues(report);

	if (!report.doc) {
		status.textContent = report.errors[0]?.message || "Invalid document";
		empty.style.display = "grid";
		return false;
	}

	try {
		const parsed = parseDocumentText(text);
		// Parser skip list can catch keys validate didn't (keep them visible).
		if (parsed.skipped?.length) {
			for (const key of parsed.skipped) {
				if (report.issues.some((i) => i.key === key)) continue;
				report.warnings.push({
					level: "warn",
					code: "skipped",
					message: `Skipped component key "${key}"`,
					key,
				});
				report.issues.push(report.warnings[report.warnings.length - 1]);
			}
			renderIssues(report);
		}
		showParsed(parsed, label, text);
		if (!report.ok || report.warnings.length) {
			const n = report.errors.length + report.warnings.length;
			status.textContent = `${parsed.title || "Untitled"} · ${n} issue${n === 1 ? "" : "s"}`;
		}
		return true;
	} catch (err) {
		status.textContent = `Load failed: ${err.message || err}`;
		if (!report.errors.length) {
			report.errors.push({
				level: "error",
				code: "parse",
				message: String(err.message || err),
			});
			report.issues = [...report.errors, ...report.warnings, ...report.notes];
			report.ok = false;
			renderIssues(report);
		}
		console.error(err);
		empty.style.display = "grid";
		return false;
	}
}

async function loadFile(file) {
	await loadText(await file.text(), file.name);
}

async function tryFetch(urls) {
	for (const url of urls) {
		try {
			const r = await fetch(url);
			if (!r.ok) continue;
			const text = await r.text();
			await loadText(text, url);
			return true;
		} catch {
			/* try next */
		}
	}
	return false;
}

async function copyShareLink() {
	if (!currentText) {
		setShareBanner("hard", "Nothing loaded to share yet.");
		return;
	}
	const encoded = await encodeDocPayload(currentText);
	const assessment = assessDocSize(encoded);
	if (!assessment.okToLink) {
		setShareBanner("hard", assessment.message);
		status.textContent = "Too large for ?doc= — saved locally instead if possible";
		const saved = saveLocalSketch(currentText, currentTitle);
		setShareBanner(
			"hard",
			assessment.message + (saved.ok ? " · " + saved.message : " · " + saved.message)
		);
		refreshLocalButton();
		return;
	}
	const url = buildDocUrl(encoded.payload);
	try {
		await navigator.clipboard.writeText(url);
		setShareBanner(
			assessment.level === "soft" ? "soft" : "ok",
			(assessment.level === "ok" ? "Copied ?doc= link. " : "") + assessment.message
		);
		status.textContent = `Copied share link (${encoded.encodedChars} chars)`;
	} catch (err) {
		setShareBanner("soft", `Clipboard blocked — copy from the address bar after Replace URL, or: ${err.message || err}`);
		if (assessment.okToLink) {
			history.replaceState(null, "", url);
		}
	}
}

function saveCurrentLocal() {
	if (!currentText) {
		setShareBanner("hard", "Nothing loaded to save.");
		return;
	}
	const saved = saveLocalSketch(currentText, currentTitle);
	setShareBanner(saved.ok ? "ok" : "hard", saved.message);
	refreshLocalButton();
}

async function restoreLocal() {
	const local = loadLocalSketch();
	if (!local) {
		setShareBanner("hard", "No local sketch saved.");
		return;
	}
	const ok = await loadText(local.text, "localStorage");
	if (ok) {
		setShareBanner(
			"ok",
			`Restored local sketch (${local.bytes || "?"} bytes). Use Copy link for a ?doc= URL if it still fits.`
		);
	}
}

fileInput?.addEventListener("change", () => {
	const f = fileInput.files?.[0];
	if (f) loadFile(f);
	fileInput.value = "";
});

// Only light up for real file drags — text drags (selecting code) must not.
const isFileDrag = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");
["dragenter", "dragover"].forEach((ev) => {
	stage.addEventListener(ev, (e) => {
		if (!isFileDrag(e)) return;
		e.preventDefault();
		stage.classList.add("drag");
	});
});
["dragleave", "drop"].forEach((ev) => {
	stage.addEventListener(ev, (e) => {
		e.preventDefault();
		stage.classList.remove("drag");
	});
});
window.addEventListener("dragend", () => stage.classList.remove("drag"));
stage.addEventListener("drop", (e) => {
	const f = e.dataTransfer?.files?.[0];
	if (f) loadFile(f);
});

btnCopy?.addEventListener("click", () => {
	copyShareLink();
});
btnSave?.addEventListener("click", () => {
	saveCurrentLocal();
});
btnRestore?.addEventListener("click", () => {
	restoreLocal();
});

// Menu bar behavior: close on item click or click-away.
const menus = document.querySelectorAll("details.menu");
document.addEventListener("pointerdown", (e) => {
	for (const m of menus) {
		if (m.open && !m.contains(e.target)) m.open = false;
	}
});
for (const m of menus) {
	m.addEventListener("click", (e) => {
		if (e.target.closest?.(".menu-item")) m.open = false;
	});
}
document.addEventListener("keydown", (e) => {
	if (e.key === "Escape") {
		for (const m of menus) m.open = false;
	}
});

refreshLocalButton();

const params = new URLSearchParams(location.search);
const docParam = params.get("doc");
const src = params.get("src");
const embed =
	params.get("embed") === "1" ||
	params.get("embed") === "true" ||
	document.documentElement.classList.contains("embed");
if (embed) document.documentElement.classList.add("embed");
if (src) {
	for (const a of document.querySelectorAll("#menu-examples a")) {
		const q = a.getAttribute("href")?.split("?")[1] || "";
		if (new URLSearchParams(q).get("src") === src) {
			a.setAttribute("aria-current", "page");
		}
	}
}
const wantLocal = params.get("local") === "1" || params.get("local") === "true";

// The site can live at a domain root or under a project prefix (github.io/RigViewer/),
// so relative candidates come first; "../" covers local dev serving the page at /web/.
function srcCandidates(s) {
	if (/^([a-z]+:)?\/\//i.test(s) || s.startsWith("/")) return [s];
	return [s, "../" + s];
}
const demoUrls = srcCandidates("examples/demo-3d.json");

if (docParam) {
	status.textContent = "Decoding ?doc=…";
	try {
		const text = await decodeDocPayload(docParam);
		const encodedChars = docParam.length;
		const assessment = assessDocSize({
			encodedChars,
			rawBytes: new TextEncoder().encode(text).byteLength,
		});
		const ok = await loadText(text, "?doc=");
		if (ok) {
			setShareBanner(
				assessment.level === "ok" ? "ok" : assessment.level,
				assessment.level === "ok"
					? `Loaded from ?doc= (${encodedChars} chars).`
					: assessment.message
			);
		}
	} catch (err) {
		status.textContent = `?doc= decode failed: ${err.message || err}`;
		setShareBanner("hard", `Could not decode ?doc=: ${err.message || err}`);
	}
} else if (src) {
	status.textContent = `Fetching ${src}…`;
	const ok = await tryFetch(srcCandidates(src));
	if (!ok) status.textContent = `Fetch failed: ${src}`;
	else setShareBanner("ok", "Loaded via ?src= (good for larger documents).");
} else if (wantLocal) {
	await restoreLocal();
} else {
	status.textContent = "Loading 3D demo…";
	const ok = await tryFetch(demoUrls);
	if (!ok) {
		empty.querySelector("p").textContent = "Drop a Rig document, or use Open";
		status.textContent = "Drop a Rig document, or Open a file";
	}
}

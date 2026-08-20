/**
 * RigViewer web host — ImTui chrome (same shell as RigPlayer), present only.
 */
import { parseDocumentText, mountViewer, documentWantsShaderPreview } from "./viewer.mjs";
import { validateDocument } from "./validate.mjs";
import { createCodeEditor } from "./editor.mjs";
import {
	assessDocSize,
	buildDocUrl,
	decodeDocPayload,
	encodeDocPayload,
	loadLocalSketch,
	saveLocalSketch,
} from "./share.mjs";
import { getProperty, setProperty, runAction, SUPPORTED_ACTION_IDS } from "./parse.mjs";
import { clampStoryScroll, drawStory, storyRows } from "./story.mjs";
import {
	C,
	ImTui,
	TuiDock,
	drawTui,
	gridMetrics,
	drawDocumentPanel,
	drawOrphanControls,
	WIN,
	issueColor,
	viewMenuItems,
	syncHostWindows,
} from "./tui/index.mjs";

const tuiCanvas = document.getElementById("tui");
const view = document.getElementById("view");
const codeHost = document.getElementById("code-host");
const fileInput = document.getElementById("file");
const boot = document.getElementById("boot");
const embed = document.documentElement.classList.contains("embed");

const tuiCtx = tuiCanvas?.getContext("2d");
const tui = new ImTui();
const dock = new TuiDock();

/** @type {{ dispose: () => void, invalidate?: () => void, getTime?: () => number, resize?: () => void } | null} */
let handle = null;
/** @type {string | null} */
let currentText = null;
/** @type {string} */
let currentTitle = "";
/** @type {string} */
let currentLabel = "";
/** @type {object | null} */
let currentParsed = null;
/** @type {ReturnType<typeof validateDocument> | null} */
let currentReport = null;
let storyScroll = 0;
let hideStageForStory = false;

const PREFS_KEY = "rigviewer.prefs.v1";
function loadPrefs() {
	const defaults = { shading: "auto", sphereResolution: 24 };
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
		/* private mode */
	}
}

let statusLine = "Ready — drop a Rig document";
let menuOpen = "";
let banner = "";
let bannerLevel = "";

function panelAccess() {
	return {
		getProperty,
		setProperty,
		runAction,
		supportedActions: SUPPORTED_ACTION_IDS,
		getTime: () => handle?.getTime?.() ?? 0,
		onChange: () => handle?.invalidate?.(),
	};
}

let ptrDown = false;
let ptrClicked = false;
let ptrReleased = false;
let ptrX = 0;
let ptrY = 0;

let last = performance.now();
let fps = 60;
let lastStageKey = "";

function hideBoot() {
	if (boot) boot.hidden = true;
}
function showBoot(msg, isError = false) {
	if (!boot) return;
	boot.hidden = false;
	boot.textContent = msg;
	boot.classList.toggle("error", isError);
}

function flashStatus(message) {
	statusLine = message;
}

function setShareBanner(level, message) {
	if (!message || !level || level === "ok") {
		banner = message && level === "ok" ? message : "";
		bannerLevel = level === "ok" ? "ok" : "";
		if (message && level === "ok") flashStatus(message);
		return;
	}
	banner = message;
	bannerLevel = level;
	flashStatus(message);
}

const editor = createCodeEditor({
	onInput: (text) => {
		const codes = currentParsed?.codes || [];
		const code = codes.find((c) => c.id === currentParsed.activeCodeId) || codes[0];
		if (!code || code.readOnly) return;
		code.text = text;
		handle?.invalidate?.();
	},
});
if (codeHost) codeHost.appendChild(editor.el);

function activeCode() {
	const codes = currentParsed?.codes || [];
	if (!codes.length) return null;
	return codes.find((c) => c.id === currentParsed.activeCodeId) || codes[0];
}

function syncEditor() {
	const code = activeCode();
	if (!code) return;
	editor.setLanguage(code.language || "glsl");
	editor.setReadOnly(!!code.readOnly);
	editor.setValue(code.text ?? "");
}

function remountViewer() {
	if (!currentParsed) return;
	handle?.dispose();
	handle = mountViewer(view, currentParsed, prefs);
	lastStageKey = "";
}

function disposeAll() {
	handle?.dispose();
	handle = null;
	lastStageKey = "";
	if (codeHost) codeHost.hidden = true;
}

function placeRect(el, r) {
	if (!el || !r) return;
	el.style.left = `${r.x}px`;
	el.style.top = `${r.y}px`;
	el.style.width = `${Math.max(1, r.w)}px`;
	el.style.height = `${Math.max(1, r.h)}px`;
}

function needsPlayer(parsed) {
	if (parsed.codes?.some((c) => c.language === "lua" || c.language === "pico8")) return true;
	return (parsed.skipped || []).some(
		(k) =>
			k.startsWith("rig.pixel.") ||
			k.startsWith("rig.music.") ||
			k.startsWith("rig.input.") ||
			k.startsWith("rig.media.code"),
	);
}

function controlsHint(parsed) {
	if (parsed.codes?.some((c) => c.language === "glsl") && !parsed.geometryCount) {
		return "live GLSL — edit buffers";
	}
	if (parsed.cameras?.some((c) => c.active && c.projection === "perspective")) {
		return "drag orbit · scroll zoom";
	}
	if (parsed.cameras?.some((c) => c.active)) {
		return "drag pan · scroll zoom";
	}
	if (parsed.stories?.length) return "wheel scroll · drag title to dock";
	return "";
}

function showParsed(parsed, label, sourceText) {
	disposeAll();
	storyScroll = 0;
	const storyOnly = !!(parsed.stories?.length && !parsed.geometryCount);
	hideStageForStory = storyOnly;
	if (!storyOnly && (parsed.geometryCount || (parsed.codes || []).some((c) => c.language === "glsl"))) {
		dock.setVisible(WIN.stage, true);
	}
	handle = mountViewer(view, parsed, prefs);
	if (typeof sourceText === "string") {
		currentText = sourceText;
		currentTitle = parsed.title || "";
	}
	currentParsed = parsed;
	currentLabel = label || "";
	document.title = `${parsed.title || "Untitled"} · RigViewer`;
	flashStatus(parsed.title || "Untitled");
	dock.setVisible(WIN.code, (parsed.codes || []).length > 0);
	syncEditor();
	if (needsPlayer(parsed)) {
		setShareBanner("soft", "Play loop — Viewer presents; open the .rig in RigPlayer.");
	}
}

async function loadText(text, label) {
	const report = validateDocument(text);
	currentReport = report;
	const serious = (report?.errors?.length || 0) + (report?.warnings?.length || 0);
	dock.setVisible(WIN.issues, serious > 0);

	if (!report.doc) {
		flashStatus(report.errors[0]?.message || "Invalid document");
		return false;
	}

	try {
		const parsed = parseDocumentText(text);
		if (parsed.skipped?.length) {
			for (const key of parsed.skipped) {
				if (report.issues.some((i) => i.key === key)) continue;
				const w = {
					level: "warn",
					code: "skipped",
					message: `Skipped component key "${key}"`,
					key,
				};
				report.warnings.push(w);
				report.issues.push(w);
			}
			currentReport = report;
		}
		showParsed(parsed, label, text);
		if (!report.ok || report.warnings.length) {
			const n = report.errors.length + report.warnings.length;
			flashStatus(`${parsed.title || "Untitled"} · ${n} issue${n === 1 ? "" : "s"}`);
		}
		return true;
	} catch (err) {
		flashStatus(`Load failed: ${err.message || err}`);
		console.error(err);
		disposeAll();
		if (!report.errors.length) {
			const e = { level: "error", code: "parse", message: String(err.message || err) };
			report.errors.push(e);
			report.issues = [...report.errors, ...report.warnings, ...report.notes];
			report.ok = false;
			currentReport = report;
			dock.setVisible(WIN.issues, true);
		}
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
			await loadText(await r.text(), url);
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
		const saved = saveLocalSketch(currentText, currentTitle);
		setShareBanner("hard", assessment.message + " · " + saved.message);
		return;
	}
	const url = buildDocUrl(encoded.payload);
	try {
		await navigator.clipboard.writeText(url);
		setShareBanner(
			assessment.level === "soft" ? "soft" : "ok",
			(assessment.level === "ok" ? "Copied ?doc= link. " : "") + assessment.message,
		);
	} catch (err) {
		setShareBanner(
			"soft",
			`Clipboard blocked — copy from the address bar after Replace URL, or: ${err.message || err}`,
		);
		if (assessment.okToLink) history.replaceState(null, "", url);
	}
}

function saveCurrentLocal() {
	if (!currentText) {
		setShareBanner("hard", "Nothing loaded to save.");
		return;
	}
	const saved = saveLocalSketch(currentText, currentTitle);
	setShareBanner(saved.ok ? "ok" : "hard", saved.message);
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
			`Restored local sketch (${local.bytes || "?"} bytes). Use Copy link for a ?doc= URL if it still fits.`,
		);
	}
}

function runCmd(cmd) {
	switch (cmd) {
		case "open":
			fileInput?.click();
			break;
		case "copy-link":
			void copyShareLink();
			break;
		case "save-local":
			saveCurrentLocal();
			break;
		case "restore-local":
			void restoreLocal();
			break;
		case "single":
			location.href = new URL("rigviewer.html" + location.search, location.href).href;
			break;
		case "ex-3d":
			location.search = "?src=examples/demo-3d.json";
			break;
		case "ex-solar":
			location.search = "?src=examples/demo-solar.json";
			break;
		case "ex-glsl":
			location.search = "?src=examples/demo-gleditor.json";
			break;
		case "ex-2d":
			location.search = "?src=examples/minimal-scene.json";
			break;
		case "ex-ui":
			location.search = "?src=examples/ui-panel.json";
			break;
		case "ex-lfo":
			location.search = "?src=examples/lfo-binding.json";
			break;
		case "ex-tool":
			location.search = "?src=examples/portable-tool.json";
			break;
		case "fullscreen":
			if (document.fullscreenElement) void document.exitFullscreen();
			else void document.documentElement.requestFullscreen();
			break;
		case "about":
			flashStatus("RigViewer presents. RigPlayer plays. ImTui chrome; same Rig documents.");
			break;
		case "player":
			window.open("https://player.rig.works/", "_blank");
			break;
		case "site":
			window.open("https://viewer.rig.works/", "_blank");
			break;
		default:
			if (cmd.startsWith("win:")) dock.toggle(cmd.slice(4));
			break;
	}
}

fileInput?.addEventListener("change", () => {
	const f = fileInput.files?.[0];
	if (f) void loadFile(f);
	fileInput.value = "";
});

const isFileDrag = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");
["dragenter", "dragover"].forEach((ev) => {
	window.addEventListener(ev, (e) => {
		if (!isFileDrag(e)) return;
		e.preventDefault();
	});
});
window.addEventListener("drop", (e) => {
	e.preventDefault();
	const f = e.dataTransfer?.files?.[0];
	if (f) void loadFile(f);
});

const cssPos = (e, canvas) => {
	const r = canvas.getBoundingClientRect();
	return { x: e.clientX - r.left, y: e.clientY - r.top };
};

if (tuiCanvas) {
	tuiCanvas.addEventListener("pointerdown", (e) => {
		const p = cssPos(e, tuiCanvas);
		ptrX = p.x;
		ptrY = p.y;
		ptrDown = true;
		ptrClicked = true;
		tuiCanvas.setPointerCapture?.(e.pointerId);
		e.preventDefault();
	});
	tuiCanvas.addEventListener("pointermove", (e) => {
		const p = cssPos(e, tuiCanvas);
		ptrX = p.x;
		ptrY = p.y;
	});
	tuiCanvas.addEventListener("pointerup", () => {
		ptrDown = false;
		ptrReleased = true;
	});
	tuiCanvas.addEventListener("pointercancel", () => {
		ptrDown = false;
		ptrReleased = true;
	});
	tuiCanvas.addEventListener(
		"wheel",
		(e) => {
			const p = cssPos(e, tuiCanvas);
			const cell = tui.cellAt(p.x, p.y);
			const w = dock.topAt(cell.c, cell.r);
			if (w?.kind !== "book") return;
			e.preventDefault();
			const step =
				e.deltaMode === 1
					? Math.sign(e.deltaY)
					: Math.sign(e.deltaY) * Math.max(1, Math.round(Math.abs(e.deltaY) / 48));
			nudgeStory(step);
		},
		{ passive: false },
	);
}

function nudgeStory(delta) {
	if (!currentParsed?.stories?.length) return;
	const book = dock.get(WIN.book);
	if (!book?.visible) return;
	const page = Math.max(1, book.h - 2);
	const rows = storyRows(currentParsed, Math.max(8, book.w - 2));
	storyScroll = clampStoryScroll(storyScroll + delta, rows, page);
}

window.addEventListener("keydown", (e) => {
	if (menuOpen && e.key === "Escape") {
		menuOpen = "";
		e.preventDefault();
		return;
	}
	const tag = (e.target && e.target.tagName) || "";
	if (tag === "TEXTAREA" || tag === "INPUT") return;
	if (!currentParsed?.stories?.length) return;
	if (e.key === "ArrowDown" || e.key === "j") {
		nudgeStory(1);
		e.preventDefault();
	} else if (e.key === "ArrowUp" || e.key === "k") {
		nudgeStory(-1);
		e.preventDefault();
	} else if (e.key === "PageDown" || e.key === " ") {
		nudgeStory(8);
		e.preventDefault();
	} else if (e.key === "PageUp") {
		nudgeStory(-8);
		e.preventDefault();
	} else if (e.key === "Home") {
		storyScroll = 0;
		e.preventDefault();
	}
});

function menusForFrame() {
	const hasLocal = !!loadLocalSketch();
	return [
		{
			id: "file",
			label: "File",
			items: [
				{ id: "open", label: "Open..." },
				{ id: "copy-link", label: "Copy link" },
				{ id: "save-local", label: "Save local" },
				{ id: "restore-local", label: "Restore local", disabled: !hasLocal },
				{ id: "single", label: "Single-file HTML" },
			],
		},
		{
			id: "examples",
			label: "Examples",
			items: [
				{ id: "ex-3d", label: "3D demo" },
				{ id: "ex-solar", label: "Solar system" },
				{ id: "ex-glsl", label: "glEditor" },
				{ id: "ex-2d", label: "2D scene" },
				{ id: "ex-ui", label: "UI panel" },
				{ id: "ex-lfo", label: "LFO" },
				{ id: "ex-tool", label: "Portable tool" },
			],
		},
		{
			id: "view",
			label: "View",
			items: viewMenuItems(dock, [
				{ id: "fullscreen", label: document.fullscreenElement ? "Exit full screen" : "Full screen" },
			]),
		},
		{
			id: "help",
			label: "Help",
			items: [
				{ id: "about", label: "About RigViewer" },
				{ id: "player", label: "RigPlayer..." },
				{ id: "site", label: "viewer.rig.works..." },
			],
		},
	];
}

function paintHost(now) {
	const rect = tuiCanvas.getBoundingClientRect();
	const dpr = Math.min(window.devicePixelRatio || 1, 3);
	const m = gridMetrics(rect.width, rect.height);
	tui.setPointer(ptrX, ptrY, ptrDown, ptrClicked, ptrReleased);
	tui.beginScreen(m.originX, m.originY, m.cellW, m.cellH, m.cols, m.rows);
	tui.fillDesk();

	const codes = currentParsed?.codes || [];
	const hasCodes = codes.length > 0;
	const issues = currentReport?.issues || [];
	syncHostWindows(dock, {
		parsed: currentParsed,
		report: currentReport,
		hasCode: hasCodes,
		hasStory: !!(currentParsed?.stories?.length),
		storyOnly: !!(currentParsed?.stories?.length && !currentParsed.geometryCount),
		storyTitle: currentParsed?.stories?.[0]?.name || currentParsed?.title || "Book",
		showInfo: true,
		showPrefs: true,
		stageTitle: documentWantsShaderPreview(currentParsed || {})
			? "Stage - GLSL"
			: currentParsed
				? "Stage - Scene"
				: "Stage",
		stageBadge: currentParsed ? "LIVE" : "",
		supportedActions: SUPPORTED_ACTION_IDS,
	});
	if (hideStageForStory) {
		dock.setVisible(WIN.stage, false);
		hideStageForStory = false;
	}

	const menus = menusForFrame();
	const bar = tui.menubar(menus, menuOpen, "RigViewer");
	menuOpen = bar.open;

	const work = { x: 0, y: 1, w: m.cols, h: Math.max(6, m.rows - 2) };
	dock.begin(tui, work, { menuOpen });

	/** @type {{x:number,y:number,w:number,h:number}|null} */
	let stageClient = null;
	/** @type {{x:number,y:number,w:number,h:number}|null} */
	let codePx = null;
	const acc = panelAccess();

	for (const w of dock.viewItems()) {
		const client = dock.draw(tui, w.id);
		if (!client) continue;
		if (w.kind === "stage") {
			stageClient = client;
			if (!currentParsed) {
				tui.cy = client.y + Math.floor(client.h / 2) - 1;
				tui.text("Drop a Rig document, or File → Open", C.dim);
				tui.text("Viewer presents  ·  Player plays", C.dim);
			}
			continue;
		}
		if (w.kind === "code" && hasCodes && !codePx) codePx = tui.rectToPixel(client);
		if (menuOpen) continue;
		if (w.kind === "info") {
			const title = currentParsed?.title || currentTitle || "(no document)";
			tui.text(title, C.text);
			tui.text(controlsHint(currentParsed || {}) || "present only", C.dim);
			if (banner) tui.text(banner.slice(0, client.w), bannerLevel === "hard" ? C.err : C.warn);
			if (currentParsed) {
				const p = currentParsed;
				tui.text(`from ${currentLabel || "—"}`, C.dim);
				tui.text(`entities ${p.entityCount ?? "—"}  draw ${p.geometryCount ?? 0}`, C.dim);
				tui.text(
					`code ${p.codes?.length ?? 0}  panels ${p.panels?.length ?? 0}  story ${p.stories?.length ?? 0}  lfo ${p.lfos?.length ?? 0}`,
					C.dim,
				);
				tui.text(`skipped ${p.skipped?.length ? p.skipped.join(",") : "none"}`, C.dim);
			}
		} else if (w.kind === "prefs") {
			const shades = ["auto", "flat", "smooth"];
			const nextShade = tui.choice("shading", "shde", prefs.shading, shades);
			if (nextShade !== prefs.shading) {
				prefs.shading = nextShade;
				savePrefs();
				remountViewer();
			}
			const res = Math.round(tui.slider("sphereseg", "sphr", prefs.sphereResolution, 8, 64, 0));
			if (res !== prefs.sphereResolution) {
				prefs.sphereResolution = res;
				savePrefs();
				remountViewer();
			}
		} else if (w.kind === "doc-panel" && currentParsed) {
			const panel = (currentParsed.panels || []).find((p) => p.id === w.panelId);
			if (panel) drawDocumentPanel(tui, currentParsed, panel, acc);
		} else if (w.kind === "orphan" && currentParsed) {
			drawOrphanControls(tui, currentParsed, acc);
		} else if (w.kind === "issues") {
			if (!issues.length) tui.text("No issues.", C.dim);
			const max = Math.max(3, client.y + client.h - tui.cy);
			for (const it of issues.slice(0, max)) {
				tui.text(`${it.level || "note"}  ${it.message}`, issueColor(it.level, C));
			}
		} else if (w.kind === "book" && currentParsed?.stories?.length) {
			const rows = storyRows(currentParsed, client.w);
			storyScroll = drawStory(tui, C, rows, storyScroll);
		} else if (w.kind === "code" && hasCodes) {
			if (codes.length > 1) {
				const ids = codes.map((c) => c.id);
				const cur = currentParsed.activeCodeId || ids[0];
				const next = tui.choice("buf", "buf", cur, ids);
				if (next !== cur) {
					currentParsed.activeCodeId = next;
					syncEditor();
					handle?.invalidate?.();
				}
				codePx = tui.rectToPixel({
					x: client.x,
					y: tui.cy,
					w: client.w,
					h: Math.max(1, client.y + client.h - tui.cy),
				});
			} else {
				codePx = tui.rectToPixel(client);
			}
		}
	}

	const dt = now - last;
	const mode = currentParsed
		? documentWantsShaderPreview(currentParsed)
			? "glsl"
			: "scene"
		: "idle";
	tui.statusbar(`LIVE  ${statusLine}`, `${dt.toFixed(0)}ms ${fps.toFixed(0)}fps  ${mode}`);

	const drop = tui.menuDropdown(menus, menuOpen, bar.anchors);
	menuOpen = drop.open;
	if (drop.cmd) runCmd(drop.cmd);

	tui.finishScreen();
	if (tuiCtx) drawTui(tuiCtx, tui, rect.width, rect.height, dpr);
	const chrome = menuOpen || !!dock.drag || dock.floatsOverStage() || !!tui.activeId;
	tuiCanvas.style.zIndex = chrome ? "5" : "2";
	if (view) view.style.pointerEvents = chrome ? "none" : "auto";
	tuiCanvas.style.cursor = dock.resizeCursor();

	return { stagePx: stageClient ? tui.rectToPixel(stageClient) : null, codePx };
}

function frameLoop(now) {
	const dt = now - last;
	fps = fps * 0.9 + (1000 / Math.max(dt, 0.01)) * 0.1;

	if (!embed && tuiCanvas && tuiCtx) {
		const { stagePx, codePx } = paintHost(now);
		if (currentParsed && stagePx) {
			placeRect(view, stagePx);
			view.hidden = false;
			const stageKey = `${Math.round(stagePx.w)}x${Math.round(stagePx.h)}`;
			if (stageKey !== lastStageKey) {
				lastStageKey = stageKey;
				handle?.resize?.();
			}
		} else {
			view.hidden = true;
		}
		if (codePx && dock.get(WIN.code)?.visible && (currentParsed?.codes || []).length) {
			codeHost.hidden = false;
			placeRect(codeHost, codePx);
		} else if (codeHost) {
			codeHost.hidden = true;
		}
	} else if (embed) {
		view.hidden = !currentParsed;
		if (codeHost) codeHost.hidden = true;
	}

	last = now;
	ptrClicked = false;
	ptrReleased = false;
	requestAnimationFrame(frameLoop);
}

function srcCandidates(s) {
	if (/^([a-z]+:)?\/\//i.test(s) || s.startsWith("/")) return [s];
	return [s, "../" + s];
}

async function bootFromUrl() {
	const params = new URLSearchParams(location.search);
	const docParam = params.get("doc");
	const src = params.get("src");
	const wantLocal = params.get("local") === "1" || params.get("local") === "true";
	const defaultDemo = "examples/demo-3d.json";

	if (docParam) {
		flashStatus("Decoding ?doc=…");
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
						: assessment.message,
				);
			}
		} catch (err) {
			flashStatus(`?doc= decode failed: ${err.message || err}`);
			setShareBanner("hard", `Could not decode ?doc=: ${err.message || err}`);
		}
	} else if (src) {
		flashStatus(`Fetching ${src}…`);
		const ok = await tryFetch(srcCandidates(src));
		if (!ok) flashStatus(`Fetch failed: ${src}`);
		else setShareBanner("ok", "Loaded via ?src= (good for larger documents).");
	} else if (wantLocal) {
		await restoreLocal();
	} else {
		flashStatus("Loading 3D demo…");
		const ok = await tryFetch(srcCandidates(defaultDemo));
		if (!ok) flashStatus("Drop a Rig document, or File → Open");
	}
	hideBoot();
}

requestAnimationFrame(frameLoop);
bootFromUrl().catch((err) => {
	console.error(err);
	showBoot(String(err?.stack || err), true);
});

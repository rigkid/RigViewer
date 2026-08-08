/**
 * Page boot for RigViewer web (used by index.html; inlined by tools/bundle.mjs).
 */
import { parseDocumentText, mountViewer } from "./viewer.mjs";
import { mountUiPanels } from "./ui.mjs";
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

function setShareBanner(level, message) {
	if (!shareBanner) return;
	if (!message) {
		shareBanner.hidden = true;
		shareBanner.textContent = "";
		shareBanner.dataset.level = "";
		return;
	}
	shareBanner.hidden = false;
	shareBanner.dataset.level = level || "ok";
	shareBanner.textContent = message;
}

function refreshLocalButton() {
	if (!btnRestore) return;
	const local = loadLocalSketch();
	btnRestore.hidden = !local;
	if (local) {
		btnRestore.title = `Restore “${local.title || "sketch"}” (${local.bytes || "?"} bytes)`;
	}
}

function showParsed(parsed, label, sourceText) {
	handle?.dispose();
	uiHandle?.dispose();
	handle = mountViewer(canvas, parsed);
	uiHandle = mountUiPanels(panelsHost, parsed, {
		getTime: () => handle?.getTime?.() ?? 0,
	});
	empty.style.display = "none";
	if (typeof sourceText === "string") {
		currentText = sourceText;
		currentTitle = parsed.title || "";
	}
	const bits = [];
	if (parsed.geometryCount) bits.push(`${parsed.geometryCount} drawable(s)`);
	if (parsed.codes?.length) bits.push(`${parsed.codes.length} code buffer(s)`);
	if (parsed.panels?.length) bits.push(`${parsed.panels.length} panel(s)`);
	if (parsed.lfos?.length) bits.push(`${parsed.lfos.length} LFO(s)`);
	status.textContent = `${parsed.title} — ${bits.join(", ") || parsed.entityCount + " entities"}${
		label ? " · " + label : ""
	}${
		parsed.codes?.some((c) => c.language === "glsl") && !parsed.geometryCount
			? " · Shadertoy preview (glEditor buffers)"
			: parsed.cameras?.some((c) => c.active && c.projection === "perspective")
				? " · drag to orbit, scroll to zoom"
				: parsed.cameras?.some((c) => c.active)
					? " · drag to pan, scroll to zoom"
					: ""
	}`;
	if (parsed.skipped.length) {
		overlay.style.display = "block";
		overlay.innerHTML = `<strong>Skipped component keys</strong><br>${parsed.skipped
			.map((k) => `<code>${k}</code>`)
			.join(", ")}`;
	} else {
		overlay.style.display = "none";
		overlay.textContent = "";
	}
	document.title = `${parsed.title} · RigViewer`;
	refreshLocalButton();
}

async function loadText(text, label) {
	try {
		const parsed = parseDocumentText(text);
		showParsed(parsed, label, text);
		return true;
	} catch (err) {
		status.textContent = `Load failed: ${err.message || err}`;
		console.error(err);
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

["dragenter", "dragover"].forEach((ev) => {
	stage.addEventListener(ev, (e) => {
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

refreshLocalButton();

const params = new URLSearchParams(location.search);
const docParam = params.get("doc");
const src = params.get("src");
const wantLocal = params.get("local") === "1" || params.get("local") === "true";
const demoUrls = [
	"/examples/demo-3d.json",
	"../examples/demo-3d.json",
	"examples/demo-3d.json",
];

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
	const ok = await tryFetch([src]);
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

/**
 * Present rig.story.flow as wrapped ImTui copy.
 * Semantics only — named styles, no face or colour from the document.
 */

function styleOf(map, id) {
	return map?.[id] || null;
}

function listKind(parsed, styleId, seen = new Set()) {
	if (!styleId || seen.has(styleId)) return "";
	seen.add(styleId);
	const s = styleOf(parsed.paragraphStyles, styleId);
	if (!s) return "";
	if (s.listKind) return s.listKind;
	return listKind(parsed, s.basedOn, seen);
}

function headerLevel(parsed, styleId, seen = new Set()) {
	if (!styleId || seen.has(styleId)) return 0;
	seen.add(styleId);
	const s = styleOf(parsed.paragraphStyles, styleId);
	if (!s) return 0;
	const n = (s.name || "").toLowerCase();
	if (n === "title" || n.includes("title")) return 1;
	if (n.includes("header 1") || n.includes("heading 1")) return 2;
	if (n.includes("header") || n.includes("heading")) return 2;
	return headerLevel(parsed, s.basedOn, seen);
}

export function flattenStory(parsed, story) {
	const blocks = [];
	for (const id of story.blocks || []) {
		const p = parsed.paragraphs?.[id];
		const table = parsed.tables?.[id];
		if (p) {
			const text = (p.runs || []).map((r) => r.text || "").join("");
			const bullet = listKind(parsed, p.style) === "bullet";
			const header = headerLevel(parsed, p.style);
			blocks.push({
				kind: header === 1 ? "title" : header ? "h" : bullet ? "li" : "p",
				text: bullet ? `• ${text}` : text,
			});
			continue;
		}
		if (table) {
			const cols = table.columnCount || 1;
			const cells = table.cells || [];
			for (const cell of cells) {
				const bits = (cell.blocks || [])
					.map((bid) => (parsed.paragraphs?.[bid]?.runs || []).map((r) => r.text || "").join(""))
					.filter(Boolean);
				if (!bits.length) continue;
				const prefix = cell.row === 0 && table.headerRowCount ? "" : "";
				blocks.push({
					kind: cell.row === 0 && table.headerRowCount ? "h" : "p",
					text: `${prefix}${bits.join("  ")}`.trim(),
				});
				void cols;
			}
		}
	}
	return blocks;
}

export function wrapText(s, width) {
	const w = Math.max(8, width);
	const raw = String(s || "");
	if (!raw) return [""];
	const out = [];
	for (const para of raw.split("\n")) {
		let rest = para.trimEnd();
		if (!rest) {
			out.push("");
			continue;
		}
		while (rest.length > w) {
			let cut = rest.lastIndexOf(" ", w);
			if (cut < Math.floor(w * 0.45)) cut = w;
			out.push(rest.slice(0, cut).trimEnd());
			rest = rest.slice(cut).trimStart();
		}
		if (rest) out.push(rest);
	}
	return out;
}

export function storyRows(parsed, width) {
	const story = (parsed.stories || [])[0];
	if (!story) return [];
	const blocks = flattenStory(parsed, story);
	const rows = [];
	for (const b of blocks) {
		const lines = wrapText(b.text, width);
		for (const line of lines) rows.push({ kind: b.kind, text: line });
		rows.push({ kind: "gap", text: "" });
	}
	while (rows.length && rows[rows.length - 1].kind === "gap") rows.pop();
	return rows;
}

export function clampStoryScroll(scroll, rows, page) {
	const maxScroll = Math.max(0, rows.length - Math.max(1, page));
	return Math.max(0, Math.min(scroll | 0, maxScroll));
}

export function drawStory(tui, C, rows, scroll) {
	const client = tui.content;
	const page = Math.max(1, client.y + client.h - tui.cy);
	const start = clampStoryScroll(scroll, rows, page);
	const end = Math.min(rows.length, start + page);
	for (let i = start; i < end; i++) {
		const row = rows[i];
		let color = C.text;
		if (row.kind === "title") color = C.title;
		else if (row.kind === "h") color = C.accent;
		else if (row.kind === "gap" || !row.text) color = C.dim;
		tui.text(row.text || " ", color);
	}
	if (rows.length > page) {
		tui.write(
			client.x + Math.max(0, client.w - 8),
			client.y + client.h - 1,
			`${start + 1}-${end}/${rows.length}`.slice(0, 8),
			C.dim,
		);
	}
	return start;
}

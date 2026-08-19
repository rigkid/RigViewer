/**
 * Lightweight Rig document validator for the web viewer.
 * Not a full AJV schema pass (see RigWorks rig-validate for that) —
 * focuses on actionable host mistakes: envelope, misplaced components,
 * unknown schema ids with suggestions, dangling refs, empty scene.
 */

/** Schemas this viewer knows how to present (keep in sync with parse.mjs). */
export const VIEWER_KNOWN_KEYS = [
	"rig.meta.named",
	"rig.spatial.transform",
	"rig.spatial.relationship",
	"rig.spatial.camera",
	"rig.spatial.group",
	"rig.spatial.layer",
	"rig.render.visibility",
	"rig.interact.selectable",
	"rig.paint.fill_stroke",
	"rig.paint.solid",
	"rig.geometry.rectangle",
	"rig.geometry.ellipse",
	"rig.geometry.line",
	"rig.geometry.polygon",
	"rig.geometry.regular_polygon",
	"rig.geometry.star",
	"rig.geometry.arc",
	"rig.geometry.ring",
	"rig.geometry.path",
	"rig.geometry.mesh",
	"rig.geometry.sphere",
	"rig.mod.lfo",
	"rig.mod.binding",
	"rig.ui.panel",
	"rig.ui.group",
	"rig.ui.control",
	"rig.ui.action",
	"rig.render.material",
	"rig.render.light",
	"rig.media.code",
	"rig.story.flow",
	"rig.story.paragraph",
	"rig.story.paragraph_style",
	"rig.story.character_style",
	"rig.story.table",
];

const KNOWN = new Set(VIEWER_KNOWN_KEYS);

/** Common invented / renamed ids → contract suggestion. */
const ALIASES = {
	"rig.geometry.shape": "rig.geometry.mesh (or rig.geometry.sphere for a round primitive)",
	"rig.material.solid": "rig.render.material",
	"rig.material.pbr": "rig.render.material",
	"rig.render.camera": "rig.spatial.camera",
	"rig.camera": "rig.spatial.camera",
	"rig.timing.lfo": "rig.mod.lfo (+ rig.mod.binding)",
	"rig.anim.lfo": "rig.mod.lfo",
	"rig.light": "rig.render.light",
	"rig.transform": "rig.spatial.transform",
	"rig.parent": "rig.spatial.relationship",
};

function issue(level, code, message, extra = {}) {
	return { level, code, message, ...extra };
}

function levenshtein(a, b) {
	const m = a.length;
	const n = b.length;
	if (!m) return n;
	if (!n) return m;
	const row = new Array(n + 1);
	for (let j = 0; j <= n; j++) row[j] = j;
	for (let i = 1; i <= m; i++) {
		let prev = i - 1;
		row[0] = i;
		for (let j = 1; j <= n; j++) {
			const tmp = row[j];
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
			prev = tmp;
		}
	}
	return row[n];
}

function suggestKey(key) {
	if (ALIASES[key]) return ALIASES[key];
	let best = null;
	let bestD = Infinity;
	for (const k of VIEWER_KNOWN_KEYS) {
		const d = levenshtein(key, k);
		if (d < bestD) {
			bestD = d;
			best = k;
		}
	}
	// Only suggest when close enough (typo-ish).
	if (best && bestD <= Math.max(3, Math.floor(key.length * 0.35))) return best;
	return null;
}

function looksLikeComponentKey(key) {
	return key.startsWith("rig.") || key.startsWith("x.");
}

/**
 * @param {string|object} input — JSON text or already-parsed object
 * @returns {{
 *   ok: boolean,
 *   doc: object|null,
 *   errors: object[],
 *   warnings: object[],
 *   notes: object[],
 *   issues: object[],
 * }}
 */
export function validateDocument(input) {
	const errors = [];
	const warnings = [];
	const notes = [];
	let doc = null;

	if (typeof input === "string") {
		try {
			doc = JSON.parse(input);
		} catch (err) {
			errors.push(
				issue("error", "json", `Invalid JSON — ${err.message || err}`),
			);
			return finish(errors, warnings, notes, null);
		}
	} else if (input && typeof input === "object") {
		doc = input;
	} else {
		errors.push(issue("error", "type", "Not a Rig document object"));
		return finish(errors, warnings, notes, null);
	}

	if (doc.rig == null) {
		errors.push(
			issue("error", "envelope", 'Missing required "rig" version field', {
				path: "/rig",
			}),
		);
	} else if (typeof doc.rig !== "string") {
		warnings.push(
			issue("warn", "envelope", '"rig" should be a version string like "0.9.0"', {
				path: "/rig",
			}),
		);
	}

	if (doc.document == null) {
		notes.push(
			issue("note", "envelope", 'No "document" block — title will show as Untitled', {
				path: "/document",
			}),
		);
	}

	if (!Array.isArray(doc.entities)) {
		errors.push(
			issue("error", "envelope", 'Missing or invalid "entities" array', {
				path: "/entities",
			}),
		);
		return finish(errors, warnings, notes, doc);
	}

	if (doc.entities.length === 0) {
		warnings.push(
			issue("warn", "empty", "Document has no entities", { path: "/entities" }),
		);
	}

	const ids = new Set();
	let geometryKeys = 0;
	let misplacedTotal = 0;

	doc.entities.forEach((e, i) => {
		const path = `/entities/${i}`;
		if (!e || typeof e !== "object") {
			errors.push(issue("error", "entity", `Entity ${i} is not an object`, { path }));
			return;
		}
		if (e.id == null || e.id === "") {
			errors.push(
				issue("error", "entity", `Entity ${i} is missing "id"`, { path: `${path}/id` }),
			);
		} else if (ids.has(e.id)) {
			errors.push(
				issue("error", "entity", `Duplicate entity id "${e.id}"`, {
					path: `${path}/id`,
					entity: e.id,
				}),
			);
		} else {
			ids.add(e.id);
		}

		const rootKeys = Object.keys(e).filter(
			(k) => k !== "id" && k !== "components" && looksLikeComponentKey(k),
		);
		if (rootKeys.length) {
			misplacedTotal += rootKeys.length;
			errors.push(
				issue(
					"error",
					"structure",
					`Entity "${e.id ?? i}" has component keys outside "components" — move them under "components": ${rootKeys.join(", ")}`,
					{
						path,
						entity: e.id,
						keys: rootKeys,
						hint: 'Each entity is { "id", "components": { "rig.…": {…} } }',
					},
				),
			);
		}

		const comps =
			e.components && typeof e.components === "object" && !Array.isArray(e.components)
				? e.components
				: {};

		if (!e.components && rootKeys.length === 0 && Object.keys(e).length > 1) {
			warnings.push(
				issue(
					"warn",
					"structure",
					`Entity "${e.id ?? i}" has no "components" object`,
					{ path: `${path}/components`, entity: e.id },
				),
			);
		}

		for (const key of Object.keys(comps)) {
			if (key.startsWith("x.")) {
				notes.push(
					issue("note", "extension", `Extension component "${key}" (not presented)`, {
						path: `${path}/components/${key}`,
						entity: e.id,
						key,
					}),
				);
				continue;
			}
			if (!looksLikeComponentKey(key)) {
				warnings.push(
					issue(
						"warn",
						"schema",
						`Odd component key "${key}" on "${e.id ?? i}" — expected rig.* or x.*`,
						{ path: `${path}/components/${key}`, entity: e.id, key },
					),
				);
				continue;
			}
			if (KNOWN.has(key)) {
				if (key.startsWith("rig.geometry.")) geometryKeys++;
				continue;
			}
			const suggestion = suggestKey(key);
			warnings.push(
				issue(
					"warn",
					"unknown",
					suggestion
						? `Unknown schema "${key}" on "${e.id ?? i}" — did you mean ${suggestion}?`
						: `Unknown schema "${key}" on "${e.id ?? i}" — Viewer will skip it`,
					{
						path: `${path}/components/${key}`,
						entity: e.id,
						key,
						suggestion: suggestion || undefined,
					},
				),
			);
		}

		// Also flag unknown keys that were misplaced (so users see both structure + rename).
		for (const key of rootKeys) {
			if (KNOWN.has(key) || key.startsWith("x.")) continue;
			const suggestion = suggestKey(key);
			if (suggestion) {
				warnings.push(
					issue(
						"warn",
						"unknown",
						`Also: "${key}" is not a Viewer schema — try ${suggestion}`,
						{ entity: e.id, key, suggestion },
					),
				);
			}
		}

		const parent = comps["rig.spatial.relationship"]?.parent;
		if (typeof parent === "string" && parent && !ids.has(parent)) {
			// Parent may appear later — collect in second pass.
		}
	});

	// Second pass: dangling parents / binding targets (ids fully known).
	doc.entities.forEach((e, i) => {
		if (!e || typeof e !== "object") return;
		const comps = e.components && typeof e.components === "object" ? e.components : {};
		const parent = comps["rig.spatial.relationship"]?.parent;
		if (typeof parent === "string" && parent && !ids.has(parent)) {
			errors.push(
				issue(
					"error",
					"ref",
					`Entity "${e.id ?? i}" parents to missing "${parent}"`,
					{ path: `/entities/${i}/components/rig.spatial.relationship/parent`, entity: e.id },
				),
			);
		}
		const bind = comps["rig.mod.binding"];
		if (bind) {
			if (bind.source && !ids.has(bind.source)) {
				errors.push(
					issue("error", "ref", `Binding "${e.id ?? i}" source "${bind.source}" not found`, {
						entity: e.id,
					}),
				);
			}
			if (bind.target && !ids.has(bind.target)) {
				errors.push(
					issue("error", "ref", `Binding "${e.id ?? i}" target "${bind.target}" not found`, {
						entity: e.id,
					}),
				);
			}
		}
	});

	if (geometryKeys === 0 && misplacedTotal === 0 && errors.length === 0) {
		const hasCode = doc.entities.some(
			(e) => e?.components && e.components["rig.media.code"],
		);
		const hasStory = doc.entities.some(
			(e) => e?.components && e.components["rig.story.flow"],
		);
		if (!hasCode && !hasStory) {
			warnings.push(
				issue(
					"warn",
					"empty",
					"No geometry components found — scene will be empty (unless this is a code-only sketch)",
				),
			);
		}
	}

	return finish(errors, warnings, notes, doc);
}

function finish(errors, warnings, notes, doc) {
	const issues = [...errors, ...warnings, ...notes];
	return {
		ok: errors.length === 0,
		doc,
		errors,
		warnings,
		notes,
		issues,
	};
}

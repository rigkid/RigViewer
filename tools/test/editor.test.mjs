import { test } from "node:test";
import assert from "node:assert/strict";
import { highlight } from "../../web/editor.mjs";

test("glsl highlight tokenizes keywords, types, builtins, comments", () => {
	const html = highlight("// hi\nuniform vec2 u; float x = sin(1.0);", "glsl");
	assert.match(html, /<span class="tk-c">\/\/ hi<\/span>/);
	assert.match(html, /<span class="tk-k">uniform<\/span>/);
	assert.match(html, /<span class="tk-t">vec2<\/span>/);
	assert.match(html, /<span class="tk-b">sin<\/span>/);
	assert.match(html, /<span class="tk-n">1\.0<\/span>/);
});

test("lua highlight handles -- comments and keywords", () => {
	const html = highlight("-- boot\nlocal x = 1\nif x then print('y') end", "lua");
	assert.match(html, /<span class="tk-c">-- boot<\/span>/);
	assert.match(html, /<span class="tk-k">local<\/span>/);
	assert.match(html, /<span class="tk-b">print<\/span>/);
	assert.match(html, /<span class="tk-s">'y'<\/span>/);
});

test("highlight escapes HTML", () => {
	const html = highlight("a < b && c > d", "glsl");
	assert.ok(html.includes("a &lt; b"));
	assert.ok(html.includes("c &gt; d"));
	assert.ok(!html.includes("<b "));
});

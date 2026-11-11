import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("GitHub Pages includes the game entry and its full module dependency tree", () => {
  const workflow = readFileSync(new URL("./.github/workflows/deploy.yml", import.meta.url), "utf8");
  const copyLine = workflow.split("\n").find((line) => /^\s*cp index\.html style\.css /.test(line));
  assert.ok(copyLine, "the Pages runtime allowlist must exist");
  const published = new Set(copyLine.trim().split(/\s+/).slice(1, -1));
  assert.ok(published.has("index.html"));
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  const pending = [...html.matchAll(/<script\b[^>]*type="module"[^>]*src="([^"?]+\.js)(?:\?[^\"]*)?"/g)]
    .map((match) => match[1]);
  assert.ok(pending.length, "the game entry module must be present in index.html");
  const checked = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (checked.has(file)) continue;
    checked.add(file);
    assert.ok(published.has(file), `${file} is missing from the Pages artifact`);
    const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    for (const match of source.matchAll(/(?:from\s*|import\s*\(\s*)["']\.\/([^"'?]+\.js)(?:\?[^"']*)?["']/g))
      pending.push(match[1]);
  }
});

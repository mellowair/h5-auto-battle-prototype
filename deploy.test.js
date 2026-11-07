import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("GitHub Pages includes every module imported by the game entry", () => {
  const workflow = readFileSync(new URL("./.github/workflows/deploy.yml", import.meta.url), "utf8");
  const copyLine = workflow.split("\n").find((line) => /^\s*cp index\.html style\.css /.test(line));
  assert.ok(copyLine, "the Pages runtime allowlist must exist");
  const published = new Set(copyLine.trim().split(/\s+/).slice(1, -1));
  const pending = ["index.html"];
  const checked = new Set();
  while (pending.length) {
    const file = pending.pop();
    if (checked.has(file)) continue;
    checked.add(file);
    assert.ok(published.has(file), `${file} is missing from the Pages artifact`);
    const source = readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
    for (const match of source.matchAll(/(?:from\s*|src=)["']\.\/([^"']+\.js)["']|(?:from\s*|src=)["']([^"'.\/]+\.js)["']/g))
      pending.push(match[1] ?? match[2]);
  }
});

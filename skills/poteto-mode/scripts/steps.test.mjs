import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseSteps } from "./steps-lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const playbooks = path.join(here, "..", "playbooks");

const ledgerAt = (dir) => path.join(dir, "pstack", "runs", "s1", "steps.json");

function run(dir, ...args) {
  return execFileSync(path.join(here, "steps"), args, {
    env: { ...process.env, PSTACK_HOME: dir, CLAUDE_CODE_SESSION_ID: "s1" },
    encoding: "utf8",
  });
}

test("every playbook yields at least one step", () => {
  for (const file of fs.readdirSync(playbooks)) {
    const steps = parseSteps(fs.readFileSync(path.join(playbooks, file), "utf8"));
    assert.ok(steps.length > 0, `${file} has no steps`);
  }
});

test("numbered steps keep their indented sub-bullets verbatim", () => {
  const steps = parseSteps(fs.readFileSync(path.join(playbooks, "feature.md"), "utf8"));
  assert.equal(steps.length, 8);
  assert.match(steps[2], /Blocking first steps/);
  assert.match(steps[2], /Smallest safe decomposition/);
  assert.doesNotMatch(steps[7], /Code-coupled work/);
});

test("playbooks without numbers fall back to bold lead-ins", () => {
  const steps = parseSteps(fs.readFileSync(path.join(playbooks, "opening-a-pr.md"), "utf8"));
  assert.ok(steps.some((s) => s.startsWith("**PRs.**")));
  assert.ok(!steps.some((s) => s.startsWith("**Reply:**")));
});

test("start, done, skip, and show round-trip through the ledger file", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "steps-"));
  run(dir, "start", "bug-fix");
  run(dir, "add", "write the regression test");
  run(dir, "done", "1", "repro at abc123");
  run(dir, "skip", "2", "root cause already known");
  const shown = run(dir, "show");
  assert.match(shown, /^playbook bug-fix/m);
  assert.match(shown, /^1\. \[x\] .*\(repro at abc123\)$/m);
  assert.match(shown, /^2\. \[-\] .* skip: root cause already known$/m);
  assert.match(shown, /\[ \] write the regression test$/m);
  assert.ok(fs.existsSync(ledgerAt(dir)));
});

test("starting the same playbook twice does not duplicate it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "steps-"));
  run(dir, "start", "feature");
  run(dir, "start", "feature");
  const ledger = JSON.parse(fs.readFileSync(ledgerAt(dir), "utf8"));
  assert.equal(ledger.sections.length, 1);
});

test("a skip without a reason fails", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "steps-"));
  run(dir, "add", "x");
  assert.throws(() => run(dir, "skip", "1"), /needs a reason/);
});

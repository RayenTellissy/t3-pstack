import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// From Node's release history: 23.6.0 unflagged type stripping and 22.18.0 got the backport.
const RELEASES = [
  { version: "20.11.0", runsTs: false },
  { version: "22.17.1", runsTs: false },
  { version: "22.18.0", runsTs: true },
  { version: "23.0.0", runsTs: false },
  { version: "23.5.0", runsTs: false },
  { version: "23.6.0", runsTs: true },
  { version: "24.0.0", runsTs: true },
  { version: process.versions.node, runsTs: true, real: true },
];

const watchPr = path.join(repo, "skills/poteto-mode/scripts/watch-pr/watch-pr");
const statechart = path.join(repo, "skills/statechart/scripts/statechart");

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "node-floor-"));
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

before(() => {
  const bootstrap = spawnSync(watchPr, ["--help"], { encoding: "utf8" });
  assert.equal(bootstrap.status, 0, `watch-pr installs its dependencies with npm on the full PATH\n${bootstrap.stderr}`);
});

const preload = path.join(scratch, "preload.mjs");
fs.writeFileSync(preload, `Object.defineProperty(process.versions, "node", { value: process.env.FAKE_NODE_VERSION });\n`);

function nodeDir({ version, runsTs, real }) {
  const dir = fs.mkdtempSync(path.join(scratch, `node-${version}-`));
  const node = path.join(dir, "node");
  if (real) {
    fs.symlinkSync(process.execPath, node);
    return dir;
  }
  const strip = runsTs ? "" : "--no-experimental-strip-types ";
  fs.writeFileSync(
    node,
    `#!/bin/sh
case "$1" in --version|-v) echo "v${version}"; exit 0 ;; esac
FAKE_NODE_VERSION=${version} exec "${process.execPath}" ${strip}--import "${preload}" "$@"
`,
    { mode: 0o755 }
  );
  return dir;
}

function assertRejected(result, status) {
  assert.equal(result.status, status, result.stderr);
  assert.match(result.stderr, /22\.18/);
  assert.match(result.stderr, /23\.6/);
  assert.doesNotMatch(result.stderr, /ERR_UNKNOWN_FILE_EXTENSION/);
}

for (const release of RELEASES) {
  const label = `Node ${release.version}${release.real ? " (real)" : ""} ${release.runsTs ? "runs" : "cannot run"} .ts`;
  describe(label, () => {
    const bin = nodeDir(release);
    const run = (command, args, env = {}) =>
      spawnSync(command, args, { cwd: repo, encoding: "utf8", env: { PATH: `${bin}:/usr/bin:/bin`, HOME: os.homedir(), ...env } });

    test("install.sh", () => {
      const home = fs.mkdtempSync(path.join(scratch, "home-"));
      const result = run("sh", [path.join(repo, "install.sh")], { HOME: home, PSTACK_SRC: repo });
      const installed = fs.existsSync(path.join(home, ".claude", "skills", "poteto-mode", "SKILL.md"));
      if (release.runsTs) {
        assert.equal(result.status, 0, result.stderr);
        assert.ok(installed, "installs the skills");
      } else {
        assertRejected(result, 1);
        assert.ok(!installed, "installs nothing");
      }
    });

    test("watch-pr --help", () => {
      const result = run(watchPr, ["--help"]);
      if (release.runsTs) {
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /Usage: watch-pr/);
      } else {
        assertRejected(result, 127);
      }
    });

    test("statechart --help", () => {
      const result = run(statechart, ["--help"]);
      if (release.runsTs) assert.match(result.stderr, /Usage: statechart SPEC\.tla/);
      else assertRejected(result, 127);
    });
  });
}

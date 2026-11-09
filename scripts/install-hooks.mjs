#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { PSTACK_DIR, writeJson } from "../skills/poteto-mode/scripts/steps-lib.mjs";

const settingsPath = path.join(path.dirname(PSTACK_DIR), "settings.json");
const MARK = "pstack/hooks/pstack-hook.mjs";
const node = (event) => `node "${path.join(PSTACK_DIR, "hooks", "pstack-hook.mjs")}" ${event}`;
const hook = (command) => ({ hooks: [{ type: "command", command, timeout: 30 }] });
const uninstall = process.argv.includes("--uninstall");

const ours = {
  Stop: [hook(node("stop"))],
  PreToolUse: [
    { matcher: "Agent|Task", ...hook(`[ "$CLAUDE_CODE_ENTRYPOINT" = t3-code ] || [ -n "$T3CODE_THREAD_ID" ] || exit 0; ${node("pre-tool")}`) },
    { matcher: "Bash", ...hook(`input=$(cat); case "$input" in *gh*pr*create*) printf '%s' "$input" | ${node("pre-tool")} ;; esac`) },
    { matcher: "mcp__.*create_pull_request", ...hook(node("pre-tool")) },
  ],
};

let settings = {};
if (fs.existsSync(settingsPath)) {
  const raw = fs.readFileSync(settingsPath, "utf8");
  settings = JSON.parse(raw);
  fs.writeFileSync(`${settingsPath}.bak-pstack`, raw);
}

const hooks = settings.hooks || {};
for (const event of Object.keys(hooks)) {
  hooks[event] = hooks[event]
    .map((group) => ({ ...group, hooks: (group.hooks || []).filter((h) => !String(h.command || "").includes(MARK)) }))
    .filter((group) => group.hooks.length > 0);
  if (hooks[event].length === 0) delete hooks[event];
}
if (!uninstall) for (const [event, groups] of Object.entries(ours)) hooks[event] = [...(hooks[event] || []), ...groups];

if (Object.keys(hooks).length > 0) settings.hooks = hooks;
else delete settings.hooks;

writeJson(settingsPath, settings);
console.log(uninstall ? `Removed pstack hooks from ${settingsPath}.` : `Installed pstack hooks in ${settingsPath}.`);

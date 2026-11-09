#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { ledgerFile, potetoIndex, PSTACK_DIR, runDir, writeJson } from "../../skills/poteto-mode/scripts/steps-lib.mjs";
import { isPoteto, missingGates, scanFile, sessionFacts, toolKind } from "./transcript.mjs";

const PR_CREATE = /\bgh\b[^\n;&|]*?\spr\s+(create|new)\b/;
const unquote = (command) => command.replace(/\\\r?\n/g, "").replace(/\\(.)/g, "$1").replace(/["']/g, "");
const HARNESS = "`~/.claude/skills/poteto-mode/references/t3-harness.md` (Spawning)";
const GATE_HELP = {
  simplify: "`/simplify` over the diff",
  "no-comments": "`/no-comments` (read `~/.claude/skills/no-comments/SKILL.md` and run its comment-sicko pass)",
  "technical-writing": "the **technical-writing** skill on the title, body, and commit messages (`~/.claude/skills/technical-writing/SKILL.md`)",
  unslop: "the **unslop** skill on the same prose (`~/.claude/skills/unslop/SKILL.md`)",
};

function debug(record) {
  if (!fs.existsSync(path.join(PSTACK_DIR, "hooks.debug"))) return;
  fs.appendFileSync(path.join(PSTACK_DIR, "hooks.log"), JSON.stringify({ at: new Date().toISOString(), ...record }) + "\n");
}

const isT3 = () => process.env.CLAUDE_CODE_ENTRYPOINT === "t3-code" || Boolean(process.env.T3CODE_THREAD_ID);

function potetoFacts(input, withSubagents) {
  const { session_id: sessionId, transcript_path: transcript } = input;
  if (!sessionId || !transcript) return null;
  const file = path.join(runDir(sessionId), "hook-scan.json");
  let cache = {};
  try {
    cache = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}
  const facts = withSubagents ? sessionFacts(transcript, sessionId, cache) : scanFile(transcript, cache);
  writeJson(file, cache);
  return isPoteto(facts) ? facts : null;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function citedPrinciples(text) {
  return potetoIndex("Principles").filter(({ title, slug }) => {
    const forms = [title, title.replace(/,/g, ""), `principle-${slug}`, `**${slug}**`].map(escape);
    return new RegExp(`(^|[^A-Za-z0-9-])(${forms.join("|")})(?![A-Za-z0-9])`).test(text);
  });
}

function onStop(input) {
  if (input.stop_hook_active || typeof input.last_assistant_message !== "string") return null;
  const facts = potetoFacts(input, false);
  if (!facts) return null;
  const problems = [];
  const unread = citedPrinciples(input.last_assistant_message).filter((p) => !facts.loaded.includes(`principle-${p.slug}`));
  if (unread.length > 0) {
    const list = unread.map((p) => `${p.title} (\`~/.claude/skills/principle-${p.slug}/SKILL.md\`)`).join(", ");
    problems.push(
      `Your reply names principles whose leaf SKILL.md this session never read: ${list}. Read each leaf in full and keep the citation only if it still holds, or drop the name. poteto-mode allows citing only principles you read this session.`,
    );
  }
  if (facts.playbooks.length > 0 && !fs.existsSync(ledgerFile(input.session_id))) {
    problems.push(
      `You opened playbook ${facts.playbooks.join(", ")} but no step ledger exists. Run \`~/.claude/skills/poteto-mode/scripts/steps start ${facts.playbooks[0]}\`, mark the steps you already did with \`steps done\` or \`steps skip\`, and paste \`steps show\` into your reply. If this session reads the playbook without running it, such as while editing pstack itself, record why with \`steps note "<reason>"\`.`,
    );
  }
  return problems.length > 0 ? { decision: "block", reason: problems.join("\n\n") } : null;
}

const decide = (permissionDecision, extra) => ({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision, ...extra } });
const deny = (reason) => decide("deny", { permissionDecisionReason: reason });

function onPreTool(input) {
  const kind = toolKind(input.tool_name);
  const toolInput = input.tool_input || {};

  if (kind === "Agent") {
    if (!isT3()) return null;
    if (toolInput.isolation) {
      return deny(`Under T3, a child with its own checkout goes through \`delegate_task\` with \`isolation: "worktree"\`, never the Agent tool's \`isolation\`. See ${HARNESS}.`);
    }
    if (toolInput.run_in_background === true) {
      return deny(`Under T3, work that must outlive this turn goes through \`delegate_task\` with \`mode: "async"\`, never a background Agent call. See ${HARNESS}. Retry with \`run_in_background: false\`.`);
    }
    if (toolInput.run_in_background !== false) return decide("allow", { updatedInput: { ...toolInput, run_in_background: false } });
    return null;
  }

  const createsPr = (kind === "Bash" && PR_CREATE.test(unquote(String(toolInput.command || "")))) || /create_pull_request$/.test(String(input.tool_name));
  if (!createsPr) return null;
  const facts = potetoFacts(input, true);
  const missing = facts ? missingGates(facts) : [];
  if (missing.length === 0) return null;
  return deny(
    `poteto-mode's Opening a PR gates have not run in this session or its subagents: ${missing.map((g) => GATE_HELP[g]).join("; ")}. Run them on this PR's diff and prose, then retry.`,
  );
}

const event = process.argv[2];
let raw = "";
for await (const chunk of process.stdin) raw += chunk;
try {
  const input = JSON.parse(raw || "{}");
  const out = event === "stop" ? onStop(input) : event === "pre-tool" ? onPreTool(input) : null;
  debug({ event, tool: input.tool_name, session: input.session_id, out });
  if (out) process.stdout.write(JSON.stringify(out));
} catch (err) {
  try {
    debug({ event, error: String(err && err.stack) });
  } catch {}
}

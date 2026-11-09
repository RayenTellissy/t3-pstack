import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "..", "..");
const hook = path.join(here, "pstack-hook.mjs");
const steps = path.join(repo, "skills", "poteto-mode", "scripts", "steps");
const CLEAN_ENV = { CLAUDE_CODE_ENTRYPOINT: "", T3CODE_THREAD_ID: "" };

function sandbox(prefix = "pstack-hook-") {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const project = path.join(home, "projects", "p");
  fs.mkdirSync(project, { recursive: true });
  return { home, transcript: path.join(project, "s1.jsonl"), session: "s1" };
}

const prompt = (text) => ({ type: "user", message: { role: "user", content: text } });
const tool = (name, input) => ({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "t", name, input }] } });
const POTETO = prompt("<command-message>poteto-mode</command-message>\n<command-name>/poteto-mode</command-name>\n<command-args>fix it</command-args>");

const lines = (entries) => entries.map((e) => JSON.stringify(e) + "\n").join("");
const write = (file, entries) => fs.writeFileSync(file, lines(entries));

function run(box, event, input, env = {}) {
  const out = execFileSync("node", [hook, event], {
    input: JSON.stringify({ session_id: box.session, transcript_path: box.transcript, ...input }),
    env: { ...process.env, PSTACK_HOME: box.home, ...CLEAN_ENV, ...env },
    encoding: "utf8",
  });
  return out ? JSON.parse(out) : null;
}

const reply = (text) => ({ last_assistant_message: text });

test("stop blocks a reply citing a principle whose leaf was never read", () => {
  const box = sandbox();
  write(box.transcript, [POTETO]);
  const out = run(box, "stop", reply("**Principles.** **Prove It Works.** Per principle-build-the-lever I wrote a codemod."));
  assert.equal(out.decision, "block");
  assert.match(out.reason, /Prove It Works \(`~\/\.claude\/skills\/principle-prove-it-works\/SKILL\.md`\)/);
  assert.match(out.reason, /Build the Lever/);
});

test("stop allows a citation after the leaf was read with Read or with cat", () => {
  const box = sandbox();
  write(box.transcript, [
    POTETO,
    tool("Read", { file_path: "/Users/x/.claude/skills/principle-prove-it-works/SKILL.md" }),
    tool("Bash", { command: "cd ~/.claude/skills && for p in principle-fix-root-causes; do cat $p/SKILL.md; done" }),
  ]);
  assert.equal(run(box, "stop", reply("Prove It Works and Fix Root Causes shaped this.")), null);
});

test("stop ignores lowercase prose, sessions without poteto-mode, and a missing reply", () => {
  const box = sandbox();
  write(box.transcript, [POTETO]);
  assert.equal(run(box, "stop", reply("I want to prove it works before shipping.")), null);
  assert.equal(run(box, "stop", {}), null);
  const plain = sandbox();
  write(plain.transcript, [prompt("hi")]);
  assert.equal(run(plain, "stop", reply("Prove It Works.")), null);
});

test("stop blocks an opened playbook until steps start writes the ledger", () => {
  const box = sandbox();
  write(box.transcript, [POTETO, tool("Read", { file_path: "/u/.claude/skills/poteto-mode/playbooks/bug-fix.md" })]);
  assert.match(run(box, "stop", reply("Reproducing now.")).reason, /steps start bug-fix/);
  execFileSync(steps, ["start", "bug-fix"], { env: { ...process.env, PSTACK_HOME: box.home, CLAUDE_CODE_SESSION_ID: box.session } });
  assert.equal(run(box, "stop", reply("Reproducing now.")), null);
});

test("poteto-mode loaded through the Skill tool or as injected skill text counts as active", () => {
  const viaTool = sandbox();
  write(viaTool.transcript, [prompt("Act as the test sub-agent.\n\n/poteto-mode fix it"), tool("Skill", { skill: "poteto-mode" })]);
  assert.equal(run(viaTool, "stop", reply("Prove It Works.")).decision, "block");
  const viaText = sandbox();
  write(viaText.transcript, [
    prompt("fix it"),
    { type: "user", isMeta: true, message: { role: "user", content: [{ type: "text", text: "Base directory for this skill: /Users/x/.claude/skills/poteto-mode\n\n# Poteto mode" }] } },
  ]);
  assert.equal(run(viaText, "stop", reply("Prove It Works.")).decision, "block");
});

test("a cache written by an older scanner is rescanned from the start", () => {
  const box = sandbox();
  write(box.transcript, [POTETO]);
  const dir = path.join(box.home, "pstack", "runs", box.session);
  fs.mkdirSync(dir, { recursive: true });
  const stale = { offset: fs.statSync(box.transcript).size, facts: { poteto: false, principles: [], playbooks: [], skills: [], commands: [] } };
  fs.writeFileSync(path.join(dir, "hook-scan.json"), JSON.stringify({ [box.transcript]: stale }));
  assert.equal(run(box, "stop", reply("Prove It Works.")).decision, "block");
});

test("stop never blocks twice in a row", () => {
  const box = sandbox();
  write(box.transcript, [POTETO]);
  assert.equal(run(box, "stop", { stop_hook_active: true, ...reply("Prove It Works.") }), null);
});

test("stop reads appended lines incrementally, including a partial last line", () => {
  const box = sandbox();
  write(box.transcript, [POTETO]);
  const cite = reply("Model the Domain shaped the reducer.");
  assert.match(run(box, "stop", cite).reason, /Model the Domain/);
  const read = JSON.stringify(tool("Read", { file_path: "/u/.claude/skills/principle-model-the-domain/SKILL.md" }));
  fs.appendFileSync(box.transcript, read.slice(0, 20));
  assert.match(run(box, "stop", cite).reason, /Model the Domain/);
  fs.appendFileSync(box.transcript, read.slice(20) + "\n");
  assert.equal(run(box, "stop", cite), null);
});

const prCreate = { tool_name: "Bash", tool_input: { command: "gh pr create --title 'fix(x): y' --body-file b.md" } };

test("pre-tool blocks gh pr create until every gate ran", () => {
  const box = sandbox();
  write(box.transcript, [POTETO, tool("Skill", { skill: "simplify" })]);
  const reason = run(box, "pre-tool", prCreate).hookSpecificOutput.permissionDecisionReason;
  assert.match(reason, /no-comments/);
  assert.match(reason, /unslop/);
  assert.doesNotMatch(reason, /`\/simplify`/);
});

test("reading no-comments is not its comment-sicko pass, and gh global flags do not skip the gate", () => {
  const box = sandbox();
  const reads = ["no-comments", "technical-writing", "unslop"].map((s) => tool("Read", { file_path: `/u/.claude/skills/${s}/SKILL.md` }));
  write(box.transcript, [POTETO, tool("Skill", { skill: "simplify" }), ...reads]);
  for (const command of ["gh pr create --fill", "gh --repo o/r pr create --fill", "gh -R o/r pr  create", "gh --repo o/r \\\n pr create --fill", "gh pr cre\\\nate --fill", "gh 'pr' 'create' --fill", "gh pr c\\reate"]) {
    const reason = run(box, "pre-tool", { tool_name: "Bash", tool_input: { command } }).hookSpecificOutput.permissionDecisionReason;
    assert.match(reason, /comment-sicko pass/);
    assert.doesNotMatch(reason, /unslop/);
  }
  fs.appendFileSync(box.transcript, lines([tool("mcp__t3-code__delegate_task", { task: "Read `~/.claude/agents/comment-sicko.md` in full and act as that agent." })]));
  assert.equal(run(box, "pre-tool", prCreate), null);
});

test("pre-tool counts gates that ran in subagent transcripts", () => {
  const box = sandbox();
  write(box.transcript, [POTETO, tool("Skill", { skill: "simplify" })]);
  const sub = path.join(path.dirname(box.transcript), box.session, "subagents");
  fs.mkdirSync(sub, { recursive: true });
  write(path.join(sub, "agent-a1.jsonl"), [
    tool("Agent", { subagent_type: "comment-sicko", prompt: "scope", run_in_background: false }),
    tool("Read", { file_path: "/u/.claude/skills/technical-writing/SKILL.md" }),
    tool("Bash", { command: "cat ~/.claude/skills/unslop/SKILL.md" }),
  ]);
  assert.equal(run(box, "pre-tool", prCreate), null);
});

test("pre-tool leaves other Bash calls and non-poteto sessions alone", () => {
  const box = sandbox();
  write(box.transcript, [POTETO]);
  assert.equal(run(box, "pre-tool", { tool_name: "Bash", tool_input: { command: "gh pr view 12" } }), null);
  const plain = sandbox();
  write(plain.transcript, [prompt("open a pr")]);
  assert.equal(run(plain, "pre-tool", prCreate), null);
});

test("under T3, pre-tool sets a missing run_in_background to false and blocks background or isolated Agent calls", () => {
  const box = sandbox();
  write(box.transcript, [prompt("hi")]);
  const t3 = { CLAUDE_CODE_ENTRYPOINT: "t3-code" };
  const agent = (extra) => ({ tool_name: "Agent", tool_input: { prompt: "x", ...extra } });
  assert.equal(run(box, "pre-tool", agent({})), null);
  const fixed = run(box, "pre-tool", agent({}), t3).hookSpecificOutput;
  assert.equal(fixed.permissionDecision, "allow");
  assert.deepEqual(fixed.updatedInput, { prompt: "x", run_in_background: false });
  assert.match(run(box, "pre-tool", agent({ run_in_background: true }), t3).hookSpecificOutput.permissionDecisionReason, /delegate_task/);
  assert.match(run(box, "pre-tool", agent({ run_in_background: false, isolation: "worktree" }), t3).hookSpecificOutput.permissionDecisionReason, /delegate_task/);
  assert.equal(run(box, "pre-tool", agent({ run_in_background: false }), t3), null);
});

test("malformed input never breaks the session", () => {
  assert.equal(execFileSync("node", [hook, "stop"], { input: "not json", encoding: "utf8" }), "");
});

test("installed hooks start node only for T3 Agent calls and PR-creating Bash calls, from any home path", () => {
  const box = sandbox("pstack $cash 'q' ");
  write(box.transcript, [POTETO]);
  fs.mkdirSync(path.join(box.home, "pstack"), { recursive: true });
  fs.symlinkSync(here, path.join(box.home, "pstack", "hooks"));
  fs.writeFileSync(path.join(box.home, "settings.json"), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "afplay x" }] }] } }));
  const install = (...args) => execFileSync("node", [path.join(repo, "scripts", "install-hooks.mjs"), ...args], { env: { ...process.env, PSTACK_HOME: box.home } });
  install();
  install();
  const settings = JSON.parse(fs.readFileSync(path.join(box.home, "settings.json"), "utf8"));
  assert.equal(settings.hooks.Stop.length, 2);
  assert.equal(settings.hooks.PreToolUse.length, 3);
  const command = (matcher) => settings.hooks.PreToolUse.find((g) => g.matcher === matcher).hooks[0].command;
  const sh = (cmd, input, env = {}) =>
    execFileSync("sh", ["-c", cmd], {
      input: JSON.stringify({ session_id: box.session, transcript_path: box.transcript, ...input }),
      env: { ...process.env, ...CLEAN_ENV, PSTACK_HOME: box.home, ...env },
      encoding: "utf8",
    });
  assert.equal(sh(command("Bash"), { tool_name: "Bash", tool_input: { command: "ls" } }), "");
  assert.match(sh(command("Bash"), prCreate), /"permissionDecision":"deny"/);
  assert.match(sh(command("Bash"), { tool_name: "Bash", tool_input: { command: "gh 'pr' cre\\\nate" } }), /"permissionDecision":"deny"/);
  const agent = { tool_name: "Agent", tool_input: { prompt: "x" } };
  assert.equal(sh(command("Agent|Task"), agent), "");
  assert.match(sh(command("Agent|Task"), agent, { T3CODE_THREAD_ID: "t" }), /"updatedInput"/);
  const stop = settings.hooks.Stop[1].hooks[0].command;
  assert.match(sh(stop, reply("Prove It Works.")), /"decision":"block"/);
  install("--uninstall");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(box.home, "settings.json"), "utf8")), { hooks: { Stop: [{ hooks: [{ type: "command", command: "afplay x" }] }] } });
});

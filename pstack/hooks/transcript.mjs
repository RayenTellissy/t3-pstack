import fs from "node:fs";
import path from "node:path";

export const GATES = ["simplify", "no-comments", "technical-writing", "unslop"];
const SCAN_VERSION = 4;
const CHUNK = 8 * 1024 * 1024;
const READ_VERB = /(^|[\s;&|(])(cat|sed|head|tail|less|more|bat|awk|nl)\s/;
const LOADED_TEXT = /<command-name>\/([a-z0-9:-]+)<\/command-name>|^Base directory for this skill: \S*\/([a-z0-9-]+)\s*$/gm;

const emptyFacts = () => ({ loaded: [], playbooks: [] });

function add(list, value) {
  if (value && !list.includes(value)) list.push(value);
}

const skillName = (raw) => raw.replace(/^\//, "").split(":").pop();

export function toolKind(name) {
  const m = String(name || "").match(/(?:^|_)(Read|Bash|Skill|Agent|Task|delegate_task)$/);
  return m && (m[1] === "Task" ? "Agent" : m[1]);
}

function notePath(facts, text) {
  for (const m of text.matchAll(/([a-z0-9-]+)\/SKILL\.md/g)) add(facts.loaded, m[1]);
  for (const m of text.matchAll(/playbooks\/([a-z0-9-]+)\.md/g)) add(facts.playbooks, m[1]);
}

function applyLine(facts, line) {
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return;
  }
  const content = entry?.message?.content;
  if (entry.type === "user") {
    const blocks = typeof content === "string" ? [{ type: "text", text: content }] : Array.isArray(content) ? content : [];
    for (const block of blocks) {
      if (block?.type !== "text") continue;
      for (const m of String(block.text || "").matchAll(LOADED_TEXT)) add(facts.loaded, skillName(m[1] || m[2]));
    }
    return;
  }
  if (entry.type !== "assistant" || !Array.isArray(content)) return;
  for (const block of content) {
    if (block?.type !== "tool_use") continue;
    const input = block.input || {};
    const kind = toolKind(block.name);
    if (kind === "Read" && typeof input.file_path === "string") notePath(facts, input.file_path);
    else if (kind === "Bash" && typeof input.command === "string" && READ_VERB.test(input.command)) {
      notePath(facts, input.command);
      if (input.command.includes("SKILL.md")) for (const m of input.command.matchAll(/\b(principle-[a-z0-9]+(?:-[a-z0-9]+)*)\b/g)) add(facts.loaded, m[1]);
    } else if (kind === "Skill" && typeof input.skill === "string") add(facts.loaded, skillName(input.skill));
    else if (kind === "Agent" && input.subagent_type === "comment-sicko") add(facts.loaded, "comment-sicko");
    else if (kind === "delegate_task" && /agents\/comment-sicko\.md/.test(String(input.task || ""))) add(facts.loaded, "comment-sicko");
  }
}

export function scanFile(file, cache) {
  let entry = cache[file];
  if (entry?.version !== SCAN_VERSION) entry = { version: SCAN_VERSION, offset: 0, facts: emptyFacts() };
  let size;
  try {
    size = fs.statSync(file).size;
  } catch {
    return entry.facts;
  }
  cache[file] = entry;
  if (size < entry.offset) Object.assign(entry, { offset: 0, facts: emptyFacts() });
  const fd = fs.openSync(file, "r");
  try {
    let carry = Buffer.alloc(0);
    while (entry.offset + carry.length < size) {
      const at = entry.offset + carry.length;
      const buf = Buffer.allocUnsafe(Math.min(CHUNK, size - at));
      const n = fs.readSync(fd, buf, 0, buf.length, at);
      if (n <= 0) break;
      const data = Buffer.concat([carry, buf.subarray(0, n)]);
      const end = data.lastIndexOf(0x0a);
      if (end < 0) {
        carry = data;
        continue;
      }
      for (const line of data.toString("utf8", 0, end).split("\n")) if (line) applyLine(entry.facts, line);
      entry.offset += end + 1;
      carry = data.subarray(end + 1);
    }
  } finally {
    fs.closeSync(fd);
  }
  return entry.facts;
}

export const isPoteto = (facts) => facts.loaded.includes("poteto-mode");

export function missingGates(facts) {
  const ran = (gate) => facts.loaded.includes(gate === "no-comments" ? "comment-sicko" : gate);
  return GATES.filter((gate) => !ran(gate));
}

function merge(target, src) {
  for (const key of ["loaded", "playbooks"]) for (const v of src[key]) add(target[key], v);
  return target;
}

export function sessionFacts(transcriptPath, sessionId, cache) {
  const all = merge(emptyFacts(), scanFile(transcriptPath, cache));
  const dir = path.join(path.dirname(transcriptPath), sessionId, "subagents");
  let subagents = [];
  try {
    subagents = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => ({ file: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
  } catch {}
  for (const { file } of subagents) {
    if (isPoteto(all) && missingGates(all).length === 0) break;
    merge(all, scanFile(file, cache));
  }
  return all;
}

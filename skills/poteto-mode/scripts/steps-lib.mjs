import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PSTACK_DIR = path.join(process.env.PSTACK_HOME || path.join(os.homedir(), ".claude"), "pstack");
const OPENERS = /^\*\*(You own|You run|Reply:)/;

export function runDir(session = process.env.CLAUDE_CODE_SESSION_ID) {
  if (!session) throw new Error("CLAUDE_CODE_SESSION_ID is unset, so there is no session ledger.");
  return path.join(PSTACK_DIR, "runs", session);
}

export function ledgerFile(session) {
  return path.join(runDir(session), "steps.json");
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

export function playbookPath(name) {
  const file = name.endsWith(".md") ? name : `${name}.md`;
  return path.isAbsolute(file) ? file : path.join(SKILL_DIR, "playbooks", file);
}

function kebab(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function potetoIndex(heading) {
  const markdown = fs.readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8");
  const section = markdown.split(`\n## ${heading}\n`)[1]?.split("\n## ")[0] || "";
  const out = [];
  for (const m of section.matchAll(/^- \*\*(.+?)\.?\*\*(.*)$/gm)) {
    const named = m[2].match(/^\s*\(\*\*principle-([a-z0-9-]+)\*\*\)|File: `playbooks\/([a-z0-9-]+)\.md`/);
    out.push({ title: m[1], slug: named?.[1] || named?.[2] || kebab(m[1]) });
  }
  return out;
}

export function parseSteps(markdown) {
  const lines = markdown.split("\n");
  const numbered = [];
  let current = null;
  for (const line of lines) {
    const item = line.match(/^(\d+)\.\s+(.*)$/);
    if (item) {
      current = { text: item[2] };
      numbered.push(current);
    } else if (current && /^\s+\S/.test(line)) {
      current.text += "\n" + line.trimEnd();
    } else if (current && line.trim() !== "") {
      current = null;
    }
  }
  if (numbered.length > 0) return numbered.map((s) => s.text.trim());
  return lines
    .map((line) => line.replace(/^- /, ""))
    .filter((line) => /^\*\*[^*]+?[.:]\*\*/.test(line) && !OPENERS.test(line))
    .map((line) => line.trim());
}

export function load() {
  const file = ledgerFile();
  if (!fs.existsSync(file)) return { sections: [], notes: [] };
  return { notes: [], ...JSON.parse(fs.readFileSync(file, "utf8")) };
}

function find(ledger, n) {
  const item = ledger.sections.flatMap((s) => s.items)[Number(n) - 1];
  if (!item) throw new Error(`No item ${n}. Run \`steps show\` for the numbers.`);
  return item;
}

export function add(texts, title = "task") {
  if (texts.length === 0) throw new Error("Give at least one item.");
  const ledger = load();
  let s = ledger.sections.find((x) => x.title === title);
  if (!s) ledger.sections.push((s = { title, items: [] }));
  s.items.push(...texts.map((text) => ({ text, state: "open" })));
  writeJson(ledgerFile(), ledger);
  return ledger;
}

export function start(name) {
  const file = playbookPath(name);
  if (!fs.existsSync(file)) throw new Error(`No playbook at ${file}.`);
  const steps = parseSteps(fs.readFileSync(file, "utf8"));
  if (steps.length === 0) throw new Error(`${file} has no steps to copy.`);
  const title = `playbook ${path.basename(file, ".md")}`;
  const ledger = load();
  if (ledger.sections.some((s) => s.title === title)) return ledger;
  return add(steps, title);
}

export function mark(n, state, note) {
  if (state === "skip" && !note) throw new Error("A skip needs a reason.");
  const ledger = load();
  const item = find(ledger, n);
  item.state = state;
  item.note = note || undefined;
  writeJson(ledgerFile(), ledger);
  return ledger;
}

export function note(text) {
  const ledger = load();
  ledger.notes.push({ at: new Date().toISOString(), text });
  writeJson(ledgerFile(), ledger);
  return ledger;
}

const MARK = { open: "[ ]", done: "[x]", skip: "[-]" };

export function render(ledger, { full = false } = {}) {
  if (ledger.sections.length === 0 && ledger.notes.length === 0) return "No ledger yet. Run `steps start <playbook>` or `steps add <item>`.";
  let n = 0;
  const out = [];
  for (const s of ledger.sections) {
    out.push(s.title);
    for (const item of s.items) {
      n += 1;
      const text = full ? item.text : firstSentence(item.text);
      const suffix = item.state === "skip" ? ` skip: ${item.note}` : item.note ? ` (${item.note})` : "";
      out.push(`${n}. ${MARK[item.state]} ${text}${suffix}`);
    }
  }
  for (const x of ledger.notes) out.push(`note ${x.at}: ${x.text}`);
  return out.join("\n");
}

function firstSentence(text) {
  const flat = text.replace(/\s+/g, " ").trim();
  const m = flat.match(/^(.{1,160}?[.!?])(\s|$)/);
  return m ? m[1] : flat.slice(0, 160);
}

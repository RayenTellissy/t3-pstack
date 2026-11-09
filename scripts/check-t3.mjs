#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GATES } from "../pstack/hooks/transcript.mjs";
import { parseSteps, playbookPath, potetoIndex } from "../skills/poteto-mode/scripts/steps-lib.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillsDir = path.join(repo, "skills");
const skills = new Set(fs.readdirSync(skillsDir).filter((d) => fs.existsSync(path.join(skillsDir, d, "SKILL.md"))));
const agents = new Set(fs.readdirSync(path.join(repo, "agents")).map((f) => f.replace(/\.md$/, "")));
const problems = [];
const problem = (file, msg) => problems.push(`${path.relative(repo, file)}: ${msg}`);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".md")) out.push(p);
  }
  return out;
}
const files = [...walk(skillsDir), ...walk(path.join(repo, "agents")), ...walk(path.join(repo, "output-styles"))];

const potetoFile = path.join(skillsDir, "poteto-mode", "SKILL.md");
const indexed = potetoIndex("Principles");
for (const { title, slug } of indexed) if (!skills.has(`principle-${slug}`)) problem(potetoFile, `principle "${title}" has no skills/principle-${slug}`);
for (const s of skills) if (s.startsWith("principle-") && !indexed.some((p) => `principle-${p.slug}` === s)) problem(potetoFile, `${s} is not in the Principles index`);

const playbooks = potetoIndex("Playbooks");
for (const { title, slug } of playbooks) if (!fs.existsSync(playbookPath(slug))) problem(potetoFile, `playbook "${title}" has no playbooks/${slug}.md`);
for (const f of fs.readdirSync(path.dirname(playbookPath("x")))) {
  const full = playbookPath(f);
  if (!playbooks.some((p) => `${p.slug}.md` === f)) problem(full, "playbook is not in the Playbooks index");
  if (parseSteps(fs.readFileSync(full, "utf8")).length === 0) problem(full, "the steps ledger finds no steps to copy");
}

const openingPr = playbookPath("opening-a-pr");
for (const gate of GATES) if (!fs.readFileSync(openingPr, "utf8").includes(gate)) problem(openingPr, `the PR hook gates on ${gate}, which this playbook no longer names`);

for (const s of skills) {
  const file = path.join(skillsDir, s, "SKILL.md");
  const fm = fs.readFileSync(file, "utf8").match(/^---\n([\s\S]*?)\n---/);
  if (!fm) problem(file, "no frontmatter");
  else {
    if (!new RegExp(`^name: ${s}$`, "m").test(fm[1])) problem(file, `frontmatter name is not ${s}`);
    if (!/^description: \S/m.test(fm[1])) problem(file, "frontmatter has no description");
  }
}

const UNADAPTED = [/TaskCreate|TodoWrite/, /isolation: "worktree"/, /run_in_background/, /\bMonitor\b/, /watch-pr/, /SendMessage/, /Claude in Chrome/];
const harness = path.join(skillsDir, "poteto-mode", "references", "t3-harness.md");

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const owner = path.relative(skillsDir, file).split(path.sep)[0];
  const ownerDir = path.join(skillsDir, owner);
  let fenced = false;
  for (const [i, line] of text.split("\n").entries()) {
    const at = `${i + 1}`;
    if (/^\s*```/.test(line)) fenced = !fenced;
    if (fenced) continue;
    for (const m of line.matchAll(/~\/\.claude\/skills\/([a-z0-9-]+)\/([A-Za-z0-9_./-]+)/g)) {
      const target = path.join(skillsDir, m[1], m[2].replace(/[.,)]+$/, ""));
      if (!fs.existsSync(target)) problem(file, `line ${at}: ${m[0]} does not exist`);
    }
    for (const m of line.matchAll(/~\/\.claude\/agents\/([a-z0-9-]+)\.md/g)) if (!agents.has(m[1])) problem(file, `line ${at}: agent ${m[1]} does not exist`);
    for (const m of line.matchAll(/\bprinciple-([a-z0-9]+(?:-[a-z0-9]+)*)/g)) if (!skills.has(`principle-${m[1]}`)) problem(file, `line ${at}: principle-${m[1]} does not exist`);
    for (const m of line.matchAll(/\*\*([a-z0-9]+(?:-[a-z0-9]+)+)\*\* principle/g)) if (!skills.has(`principle-${m[1]}`)) problem(file, `line ${at}: principle ${m[1]} does not exist`);
    for (const m of line.matchAll(/(?<![\w/~.-])((?:playbooks|references|scripts)\/[A-Za-z0-9_.-]+[A-Za-z0-9_])/g)) {
      const rel = m[1];
      const roots = [path.dirname(file), ownerDir, path.join(skillsDir, "poteto-mode")];
      if (!roots.some((r) => fs.existsSync(path.join(r, rel)))) problem(file, `line ${at}: ${rel} does not resolve`);
    }
  }
  if (file === harness) continue;
  const hits = UNADAPTED.filter((rx) => rx.test(text));
  if (hits.length > 0 && !text.includes("t3-harness.md")) problem(file, `names ${hits.map(String).join(", ")} without pointing at references/t3-harness.md`);
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  console.error(`\n${problems.length} problem(s).`);
  process.exit(1);
}
console.log(`ok: ${files.length} files, ${skills.size} skills, ${indexed.length} principles, ${playbooks.length} playbooks.`);

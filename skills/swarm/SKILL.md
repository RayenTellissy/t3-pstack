---
name: swarm
description: "Fan out N parallel workers, drain them, and return one report. Use for /swarm, 'swarm this', or parallel coverage, races, gauntlets, and exploration."
disable-model-invocation: true
---

# Swarm

## Start

Open the step ledger (`~/.claude/skills/poteto-mode/scripts/steps add "<item>" ...`, closing each item with `steps done` or `steps skip` as it ends) with one entry per phase before launching anything.

1. Frame
2. Fan out
3. Aggregate
4. Report

## Phase A: Frame

1. State the done predicate and the artifact or report the swarm must return.
2. Choose the shape. Partition into slices, race N workers on identical briefs, or mix both. For a race or mixed shape, declare `first pass`, `rank all`, or `best-of` before spawning.
3. Pick the worker `model` and `effort` from the `swarm workers` line in `~/.claude/pstack/models.md`. If the file or that line is missing, use `opus high`. For `inherit`, omit `model` and `effort` so the workers run on the parent session's model. A `codex/<model>` value is also valid under T3. The Spawning section of `~/.claude/skills/poteto-mode/references/t3-harness.md` says which tool runs each value. A value it does not cover falls back to the default, so say so. For a model race, name each arm's model up front. Pick each subagent's effort for the job, per the Subagents section of the **poteto-mode** skill (`~/.claude/skills/poteto-mode/SKILL.md`).
4. Give each worker its own writable output when it writes. When workers verify or measure commits, each brief names the exact SHAs. A measurement brief also names the method (sample count, what one sample is, order). The worker records both in its result.

## Phase B: Fan out

Spawn all N workers in one message with `subagent_type: "general-purpose"`, `isolation: "worktree"`, and the step 3 `model` and `effort`, left unset for `inherit`. Omit `isolation` only when the worker needs the user's own checkout, such as its uncommitted changes or a process running from it. Never use `isolation: "remote"`. Workers stay local so they can reach local files. Outside a git repo, omit `isolation` and give each worker its own output directory.

Under T3, the Agent tool takes no `isolation`. A worktree worker is a `delegate_task` child with `isolation: "worktree"` and `mode: "async"`, and a worker in the user's checkout or outside a repo stays on the Agent tool with `run_in_background: false`. Follow Parallel fan-out in `~/.claude/skills/poteto-mode/references/t3-harness.md`, and record the outstanding task ids with `steps note` before you end the turn.

A worktree starts from the repo's default branch, not the current one. So every brief names the exact commit to start from, the current HEAD SHA (`git rev-parse HEAD`) unless the worker needs another, and tells the worker to run `git checkout --detach <sha>` in its worktree first. Setting `worktree.baseRef` to `"head"` in Claude Code settings makes worktrees start from HEAD instead.

Every brief stands alone. Include the goal, scope, exact slice or race arm, how to verify, and what to report. Reports use `PASS`, `ISSUES`, or `BLOCKED` with evidence. A worker that can prove a defect reports `ISSUES` and lists every issue it can prove, not only the first.

If a worker drops out, proceed with N-1 and note it.

## Phase C: Aggregate

Read the terminal results. Drop a result that does not record the SHAs and method its brief names, and respawn that worker once. After a second miss, record a gap. A gap does not count as a pass. For coverage, every required slice needs a result. For a race, apply the selection rule declared up front. Use first pass, rank all, or best-of. Do not paste raw worker dumps.

## Phase D: Report

Return one consolidated in-chat report with a result table, issue one-liners, gaps or dropouts, and the race rule when used.

---
name: arena
description: "Spawn N parallel candidates at the same task, pick a base, graft the strongest parts of the losers into it. Use for /arena, 'arena this', 'throw it in the arena', or when one attempt at a non-trivial artifact would lock in the wrong shape."
disable-model-invocation: true
---

# Arena

Other pstack skills named here are files, not Skill tool calls, and the Skill tool refuses them. To run or apply one, Read `~/.claude/skills/<name>/SKILL.md` in full, or `~/.claude/skills/principle-<name>/SKILL.md` for a principle.

Open the step ledger (`~/.claude/skills/poteto-mode/scripts/steps add "<item>" ...`, closing each item with `steps done` or `steps skip` as it ends) with one entry per phase (Frame, Fan out, Cross-judge, Pick, Graft, Verify) before launching anything.

## Phase A: Frame

Every candidate gets the same prompt, so the prompt is the contract.

1. State the artifact each candidate is producing.
2. Derive the rubric, 3-6 concrete gradeable criteria for what success looks like on *this* task. It is the picker's tool in Phase D. Candidates only see the task.
3. Pick the runners. Use the `arena runners` line in `~/.claude/pstack/models.md`. If the file or that line is missing, default to two runners on `opus xhigh`. Pass each entry's model and effort as the Agent call's `model` and `effort`. An `inherit` entry in this line means the parent session's model, so omit `model` and `effort` for it. Under T3, a `codex/<model>` entry is a seat too, and it runs through `delegate_task` per the Spawning section of `~/.claude/skills/poteto-mode/references/t3-harness.md`. If an entry names any other model, run that seat on `opus xhigh` and say so. If the Agent tool rejects that too, drop the seat and say so. If dropped seats leave fewer than two runners, add runners until there are two, or one when the line has one entry. Run each added runner on a remaining runner's `model` and `effort`, or omit both so it runs on the parent session's model when none remain, and say so. Spawn more runners when the arena covers multiple design directions. Use the same model N times when the work is generation-bound rather than judgment-sensitive. Pick each subagent's effort for the job, per the Subagents section of the **poteto-mode** skill (`~/.claude/skills/poteto-mode/SKILL.md`).
4. Give each candidate its own output location (a git worktree where possible, otherwise `/tmp/arena-<slug>/candidate-<n>/`), per the **separate-before-serializing-shared-state** principle skill. A worktree starts from the repo's default branch, not the current one, so a worktree candidate's brief names your HEAD SHA (`git rev-parse HEAD`) and tells it to run `git checkout --detach <sha>` in its worktree first. Under T3, a worktree candidate is a `delegate_task` child with `isolation: "worktree"`, which T3 documents as starting from your current commit. Its brief still names your HEAD SHA. A candidate that writes under `/tmp` can stay on the Agent tool.

## Phase B: Fan out

Spawn all N subagents in one message, each with the task, the path to the shared grounding, its own output path, and instructions to produce the artifact and a short rationale naming the alternatives it considered and what it rejected. Under T3, follow Parallel fan-out in the harness file: async `delegate_task` children first, then the Agent calls, then end the turn until every child reports.

If a candidate produces no output, proceed with N-1 and note the dropout.

## Phase C: Cross-judge

After all Phase B candidates complete, choose one entry from the `arena cross-judge pool` line in `~/.claude/pstack/models.md`. If the file or that line is missing, use `opus xhigh`. Spawn one judge subagent with `subagent_type: "pstack-readonly"` on that entry's `model` and `effort`. Under T3, a `codex/<model>` judge is a `delegate_task` child, and its task opens with the `pstack-readonly` role line from the harness file. Start it with `mode: "async"` and end the turn, or with `mode: "wait"` from a top-level thread, per Parallel fan-out in the harness file. The judge never runs on the parent session's model. Try only the entries on another model, in pool order. An `inherit` entry is the parent session's model, so it never judges. With the default pool, a non-Opus parent gets `opus xhigh`, and an Opus parent has no judge. If the Agent tool rejects an entry, move to the next one. If no entry on another model runs, try the default pool's entries on another model the same way. If none of those runs, skip the judge, pick the base alone in Phase D, and say so. If you do not know the parent's model, try the pool's real entries in pool order and say that the model check did not run. The judge sees the rubric and the candidates by path label, scores each criterion, and recommends a base with rationale. It runs in parallel with your reading in Phase D. Don't spawn it while candidates are still writing.

## Phase D: Pick a base

Read every candidate end to end before picking. Score each against the rubric criterion by criterion, not on holistic feel, and compare with the cross-judge when Phase C ran one. Agreement on the base confirms the pick. Disagreement means one of you is biased or the rubric was ambiguous. Read both rationales before deciding.

Pick the base a future maintainer can extend most easily without breaking invariants. When two feel tied, prefer the cleaner boundary or smaller API, per the Laziness Protocol.

## Phase E: Graft

Walk each losing candidate once more for what is worth porting into the base, usually one or two things per candidate, not most of it. Fold each graft in by hand, per the **redesign-from-first-principles** principle skill, so the result stays coherent under one mental model. Don't paste mechanically.

If the candidates converge on one shape, that is strong agreement. Note it and ship the consensus shape. No graft is needed. If they wildly diverge, Phase A was under-specified. Reframe and re-run rather than averaging the divergence.

## Phase F: Verify

Verify the synthesized artifact like any other output, per the **prove-it-works** principle skill. If verification finds a problem the arena missed, either Phase A was wrong (re-frame and re-run) or a candidate caught it and you missed the graft (go back to Phase E). Don't paper over it.

## Outputs

One synthesized artifact, with a short synthesis note alongside naming the base and why, the cross-judge's verdict or that Phase C skipped the judge, each graft with its source candidate, what was rejected and why, any convergence or dropouts, and the verification result.

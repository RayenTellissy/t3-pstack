---
name: setup-pstack
description: Configure which models pstack uses per role and at what reasoning budget. Writes a model config file that overrides the skill defaults. Use for /setup-pstack, "configure pstack models", "pstack budget", or changing pstack's model choices.
---

# Setup pstack

Write `~/.claude/pstack/models.md`, the model config that sets pstack's model and effort per role.

## Steps

### 1. Models

pstack runs on two models, passed as the Agent tool's `model`: `fable` (strongest, the second voice in review panels) and `opus` (the default for code and judgment). The alias `inherit` is also valid. It means the role runs on the parent session's model and effort. Offer no other models.

### 2. Load current state

The default role-to-model mapping is the file shape shown in step 5 below. If `~/.claude/pstack/models.md` already exists, read it and treat its `# budget` line and its role values as the current choices. Otherwise start from those defaults. A line whose role is not in step 5, such as `how critics`, is from a retired role. Drop it.

### 3. Budget, map, and confirm

**(a) Ask for a budget.** Use `AskUserQuestion`, or plain text in `-p` mode, where that tool is absent. Offer these four options with these exact labels, and name the current budget when the file records one. With no file, say that `large` matches the skill defaults.

- `unlimited (max effort)`
- `large (xhigh effort)`
- `medium (high effort)`
- `small (medium effort)`

**(b) Apply it.** Build the working table from the skill defaults, and on a re-run keep any role you changed by model, list, or alias (`inherit`). `unlimited`, `medium`, and `small` set the effort of every entry, panel entries included, to `max`, `high`, or `medium`. `inherit` does not change. So `unlimited` turns `fable high` into `fable max`. `large` keeps the defaults: every `fable` entry, the code-writing roles (feature, refactoring, bug-fix, perf-issue, hillclimb), `reflect tooling`, and `swarm workers` at `high`, `how explorer` at `medium`, and the other `opus` entries at `xhigh`. `small` turns them into `fable medium` and `opus medium`.

**(c) Show the roles and confirm.** Show every role with its model and effort. Also list each line step 2 dropped. Ask whether to accept as-is or change specific roles, offering `fable`, `opus`, and `inherit` as the options. Use `AskUserQuestion`, or plain text in `-p` mode. For panel roles (arena runners, architect runners, interrogate reviewers) the value is a list, and one subagent runs per entry, `inherit` entries included, so the list length sets the count. `arena cross-judge pool` is also a list, but Arena runs one judge. It tries only values on a model other than the parent's, in list order, so order it by preference. An `inherit` value never judges. `swarm workers` is the default model for every worker unless a race or comparison assigns another model per arm.

### 4. Validate

Every model written is `fable`, `opus`, or `inherit`. Every effort is `low`, `medium`, `high`, `xhigh`, or `max`. If a choice fails, stop and ask again.

### 5. Write the file

Write `~/.claude/pstack/models.md` with a `# budget` line with the chosen label, and one line per role, using the same labels poteto-mode uses. Create `~/.claude/pstack/` if it is missing. Overwrite the whole file so re-runs stay idempotent. Shape:

```
# pstack model configuration. One line per role. Delete a line to fall back to the skill default.
# A value is `<model> <effort>`, passed as the Agent call's `model` and `effort`.
# `inherit` as a value: the role runs on the parent session's model (omit `model` and `effort`). `inherit` entries in a panel list still count toward its fan-out.
# budget: large (xhigh)
feature, refactoring: opus high
bug-fix: opus high
perf-issue: opus high
hillclimb: opus high
judgment and prose: opus xhigh
hardest tasks: opus xhigh
how explorer: opus medium
how explainer: opus xhigh
why investigators: opus xhigh
why synthesizer: opus xhigh
reflect tooling: opus high
reflect judgment, divergent, synthesizer: opus xhigh
arena runners: fable high, opus xhigh
arena cross-judge pool: fable high, opus xhigh
swarm workers: opus high
architect runners: fable high, opus xhigh
interrogate reviewers: fable high, opus xhigh
```

### 6. Confirm

Tell the user the file was written. Skills read it each time they pick a model, so it applies from the next spawn on. Re-running this skill updates it.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /create-verification-skill." On yes, read `~/.claude/skills/create-verification-skill/SKILL.md` in full and follow it. The Skill tool refuses that skill, so don't invoke it by name. On no, move on without pushing.

### 8. Offer a formal verification skill (optional)

Check whether the project already has a formal verification skill (a project skill that runs a model checker, a proof, or another verifier against the code). If not, offer once: "want a formal verification skill, so agents can prove a key property of your code holds in every case in scope, not only the cases tests reach? I can generate one with /create-formal-verification-skill." On yes, read `~/.claude/skills/create-formal-verification-skill/SKILL.md` in full and follow it. The Skill tool refuses that skill, so don't invoke it by name. On no, move on without pushing.

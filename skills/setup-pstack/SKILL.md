---
name: setup-pstack
description: Configure which models pstack uses per role and at what reasoning budget. Writes a model config file that overrides the skill defaults. Use for /setup-pstack, "configure pstack models", "pstack budget", or changing pstack's model choices.
---

# Setup pstack

Write `~/.claude/pstack/models.md`, the model config that sets pstack's model and effort per role.

## Steps

### 1. Models

pstack runs on two models, passed as the Agent tool's `model`: `fable` (strongest, the second voice in review panels) and `opus` (the default for code and judgment). `haiku` is also valid, for fast, cheap fan-out roles whose output a stronger model checks, such as `how explorer`. The alias `inherit` is also valid. It means the role runs on the parent session's model and effort. Offer no other models, with one exception. In a T3 Code session (`echo $CLAUDE_CODE_ENTRYPOINT` prints `t3-code`), load `orchestrator_capabilities` with ToolSearch, call it, and also offer each model of an enabled `codex` provider, written `codex/<model-id>`. These roles run through `delegate_task`, per `~/.claude/skills/poteto-mode/references/t3-harness.md`. They make the strongest second voice in a panel, because they come from another vendor. Say once that pstack's hooks do not run inside Codex children, so a code-writing role on Codex skips the PR gate.

### 2. Load current state

The default role-to-model mapping is the `large` preset in `~/.claude/pstack/models.large.md`. Read it. The install also copies it to `~/.claude/pstack/models.md` when that file does not exist. If `~/.claude/pstack/models.md` exists, read it and treat its `# budget` line and its role values as the current choices. Otherwise start from the preset. A line whose role is not in the preset, such as `how critics`, is from a retired role. Drop it.

### 3. Budget, map, and confirm

**(a) Ask for a budget.** Use `AskUserQuestion`, or plain text in `-p` mode, where that tool is absent. Offer these four options with these exact labels, and name the current budget when the file records one. With no file, recommend `large`.

- `unlimited (max effort)`
- `large (xhigh effort)`
- `medium (high effort)`
- `small (medium effort)`

**(b) Apply it.** Build the working table from the `large` preset, and on a re-run keep any role you changed by model, list, or alias (`inherit`). `unlimited`, `medium`, and `small` set the effort of every entry, panel entries included, to `max`, `high`, or `medium`. `inherit` does not change. So `unlimited` turns `fable medium` into `fable max`, and `small` turns `haiku high` into `haiku medium`. A `codex/` entry follows the same rule as a `fable` entry. `large` keeps the preset as written. The preset's `codex/` entries apply only under T3, and only for a model that `orchestrator_capabilities` lists. Otherwise drop them from the panels and say so.

**(c) Show the roles and confirm.** Show every role with its model and effort. Also list each line step 2 dropped. Ask whether to accept as-is or change specific roles, offering `fable`, `opus`, `haiku`, and `inherit` as the options, plus the `codex/<model-id>` values from step 1 under T3. Use `AskUserQuestion`, or plain text in `-p` mode. For panel roles (arena runners, architect runners, interrogate reviewers) the value is a list, and one subagent runs per entry, `inherit` entries included, so the list length sets the count. `arena cross-judge pool` is also a list, but Arena runs one judge. It tries only values on a model other than the parent's, in list order, so order it by preference. An `inherit` value never judges. `swarm workers` is the default model for every worker unless a race or comparison assigns another model per arm.

### 4. Validate

Every model written is `fable`, `opus`, `haiku`, `inherit`, or, under T3, `codex/<model-id>` for an id that `orchestrator_capabilities` listed. Every effort is `low`, `medium`, `high`, `xhigh`, or `max`. If a choice fails, stop and ask again.

### 5. Write the file

Write `~/.claude/pstack/models.md` in the shape of `~/.claude/pstack/models.large.md`: its comment lines, a `# budget` line with the chosen label, and one line per role with the preset's role labels. Create `~/.claude/pstack/` if it is missing. Overwrite the whole file so re-runs stay idempotent. Never edit `models.large.md`, because the install replaces it.

### 6. Confirm

Tell the user the file was written. Skills read it each time they pick a model, so it applies from the next spawn on. Re-running this skill updates it.

### 7. Offer a verification skill (optional)

Check whether the project has a way to drive the real app for proof (a `verify-*` skill, or an existing harness). If not, offer once: "want a project-local verification skill, so agents can drive the app the way a user does and prove changes work? I can generate one with /create-verification-skill." On yes, read `~/.claude/skills/create-verification-skill/SKILL.md` in full and follow it. The Skill tool refuses that skill, so don't invoke it by name. On no, move on without pushing.

### 8. Offer a formal verification skill (optional)

Check whether the project already has a formal verification skill (a project skill that runs a model checker, a proof, or another verifier against the code). If not, offer once: "want a formal verification skill, so agents can prove a key property of your code holds in every case in scope, not only the cases tests reach? I can generate one with /create-formal-verification-skill." On yes, read `~/.claude/skills/create-formal-verification-skill/SKILL.md` in full and follow it. The Skill tool refuses that skill, so don't invoke it by name. On no, move on without pushing.

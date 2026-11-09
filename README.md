# t3-pstack

[pstack](https://github.com/cursor/plugins/tree/main/pstack), poteto's rigorous agent workflow skills, built for T3 Code. It forks [pstack-claude](https://github.com/RayenTellissy/pstack-claude) and adds what T3 needs to run every playbook, principle, and gate.

The full README is [`pstack/README.md`](pstack/README.md). The walkthrough is the [pstack guide](pstack/docs/guide/README.md).

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/RayenTellissy/t3-pstack/main/install.sh | sh
```

From a local checkout, run `PSTACK_SRC=$PWD sh install.sh`.

The script copies `skills`, `agents`, `output-styles`, and `pstack` into `~/.claude/`, and adds the pstack hooks to `~/.claude/settings.json`. It backs the settings up to `settings.json.bak-pstack` first. Run the same command again to update. It keeps your model config, run stores, your own skills, and your other hooks. `node scripts/install-hooks.mjs --uninstall` removes the pstack hooks.

Start a new T3 Code thread, then run `/setup-pstack` to pick a budget and models, or skip it to keep the defaults. Use `/poteto-mode` at the start of any task that needs rigor. To keep it on every turn, run `/output-style poteto-mode`. The scripts need [Node.js](https://nodejs.org) 22.18 to 22.x, or 23.6 or later.

## What T3 changes

[`t3-harness.md`](skills/poteto-mode/references/t3-harness.md) holds every T3 rule, and each skill points at it where it applies.

- **Step ledger.** T3 has no todo tool, so `skills/poteto-mode/scripts/steps` copies a playbook's steps verbatim into `~/.claude/pstack/runs/<session-id>/`. Each step closes as done with evidence or skipped with a reason. The ledger survives compaction.
- **Spawning.** Agent calls run in the foreground. A child that needs its own checkout, a Codex model, or a life past the turn goes through `delegate_task`. Async children wake the thread when they finish, so pstack never polls them.
- **Codex voices.** `/setup-pstack` offers each Codex model that T3 lists, written `codex/<model>`, for panels and verifiers.
- **PRs.** Every PR is linked to the thread. Waits use `watch_pull_request`, never a polling loop. Delegated children never watch. They report the PR line and the parent watches.
- **Surfaces.** UIs are driven with T3's preview tools, devices with its device tools, and charts go through `html_preview` and `html_render`.

## Hooks

The hooks enforce rules that the skill text alone could not hold in practice. An audit of 13 past poteto-mode runs found no task list in any of them. It also found principles cited without their leaf being read, and PRs opened from the main chat without `/simplify`, `/no-comments`, or **unslop**.

| Hook | Blocks |
|---|---|
| Stop | A poteto-mode reply that cites a principle whose leaf this session never read. A session that opened a playbook without a step ledger. |
| PreToolUse, `gh pr create` | A poteto-mode PR until `/simplify`, `/no-comments`, **technical-writing**, and **unslop** ran in the session or its subagents. |
| PreToolUse, Agent | Under T3, an Agent call without `run_in_background: false`, or with `isolation`. |

Each hook reads the transcript incrementally and caches what it has read, so a check on a long session takes milliseconds. A failure inside a hook never blocks the session. `touch ~/.claude/pstack/hooks.debug` logs every decision to `~/.claude/pstack/hooks.log`.

## Checks

```bash
node scripts/check-t3.mjs
node --test pstack/hooks/pstack-hook.test.mjs skills/poteto-mode/scripts/steps.test.mjs
```

`check-t3.mjs` checks that every principle, playbook, skill path, and agent reference resolves, and that every playbook yields ledger steps. It also flags any file that names a mechanism T3 replaces with no T3 rule beside it, which catches unported text from upstream.

## Keeping up with upstream

[`scripts/upstream.json`](scripts/upstream.json) records the last upstream commit ported, and the [Check upstream pstack](.github/workflows/check-upstream.yml) workflow opens an issue when upstream moves. Port by hand with `node scripts/check-upstream.mjs`, then run the checks above before you record the commit with `--done <commit>`.

## License

[MIT](LICENSE), copyright Lauren Tan.

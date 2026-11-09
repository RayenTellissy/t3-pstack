# T3 harness

Every pstack skill follows this file in a T3 Code session. A session is one when Bash prints `t3-code` for `echo $CLAUDE_CODE_ENTRYPOINT`, or when `mcp__t3-code__*` tools are listed. Outside T3, skip this file and use the mechanics the skills name.

Where a skill names a mechanism this file replaces, use the replacement and keep every gate. T3 tools are deferred. Load each one with ToolSearch (`select:mcp__t3-code__<name>`) before the first call.

## Step ledger

T3 has no `TaskCreate`, `TaskUpdate`, or `TodoWrite`, so every pstack skill tracks its steps with the ledger script at `~/.claude/skills/poteto-mode/scripts/steps`.

- `steps start <playbook>` copies the playbook's steps into the ledger verbatim, for example `steps start bug-fix`.
- `steps add "<item>" ["<item>" ...]` adds task-specific items, a skill's phases, or the four throughput-checkpoint items.
- `steps done <n> "<evidence>"` closes an item with what proves it.
- `steps skip <n> "<reason>"` keeps a skipped item in the ledger with its reason. `n/a: <reason>` items use `skip` too.
- `steps note "<text>"` records state that has to survive a wake or a compaction, such as outstanding delegate task ids.
- `steps show` prints the ledger. Paste its output into the first reply after `start` and into the final reply.

The ledger lives in `~/.claude/pstack/runs/<session-id>/`, so it survives compaction. Re-read it with `steps show` after a compaction or a wake. A `delegate_task` child is a session of its own, so it keeps its own ledger for any playbook it runs.

## Spawning

Resolve each role value from `~/.claude/pstack/models.md` with this table. A skill's default for a missing line or file still applies.

| Value | Call |
|---|---|
| `opus <effort>`, `fable <effort>` | The Agent tool, with `model`, `effort`, and `run_in_background: false`. |
| `inherit` | The Agent tool, with `run_in_background: false`, and no `model` or `effort`. |
| `codex/<model> <effort>` | `delegate_task` with `target: {providerInstanceId: "codex", model: "<model>", options: {reasoningEffort: "<effort>"}}`. |

Use the Agent tool when the child needs no separate checkout and finishes inside this turn. Use `delegate_task` in three cases: the value is a `codex/` entry, the child needs its own checkout, or the work must outlive this turn. The last case covers PR owners, Orchestrate and Autopilot workers, and anything a skill says to run in the background. When an `opus` or `fable` role goes through `delegate_task`, use `target: {providerInstanceId: "claudeAgent", model: "<id>", options: {effort: "<effort>"}}`, with the `<id>` that `orchestrator_capabilities` lists for that model family.

- **Never** pass `run_in_background: true` or `isolation` to the Agent tool. A hook blocks both. A separate checkout is `delegate_task` with `isolation: "worktree"`. Never make a child's checkout in the shell.
- Call `orchestrator_capabilities` once per thread before the first `delegate_task`. When it does not list a value's provider or model, treat the value as rejected, follow the calling skill's fallback, and say so.
- A `delegate_task` child has no `subagent_type`. Open its task with the role. For `poteto-agent`, `pstack-readonly`, or `comment-sicko`, the first line is "Read `~/.claude/agents/<type>.md` in full and act as that agent." A `general-purpose` child needs no such line. A child also gets no parent history, so its brief stands alone, the same as an Agent brief.
- `delegate_task` runs a child only in this thread's own project, and it rejects a `target.projectId` for any other project. A thread that works on a repo from outside that repo's project, such as a scratch thread, cannot start a worktree child for the repo. Tell the user that a worktree child needs a thread in the repo's project. Start a shared child only when the work needs no separate checkout.
- A worktree child starts from the parent's current commit, and uncommitted edits stay out. When the child needs them, write them to a patch (`git diff HEAD > <run-dir>/scope.patch`) and tell the child to `git apply` it first. Every brief still names the exact SHA it works on.
- A worktree child starts on a branch that T3 creates, with no untracked files, so it installs dependencies such as `node_modules` before it runs tests. A PR owner cuts its PR branch there. A verifier fetches the PR head and runs `git checkout --detach <sha>`, because git refuses to check out a branch that the author's worktree already holds.
- A worktree stays on disk after its child finishes. After the PR merges, remove it and its branch per `playbooks/worktree-cleanup.md`.

### Parallel fan-out

1. In one message, start every `delegate_task` child with `mode: "async"`, then make every Agent call. Agent calls in one message run in parallel and return this turn.
2. Several `mode: "wait"` calls in one message run one after another, so use `wait` only for a single child whose result this turn needs, and only in a top-level thread. Inside a delegated child, `wait` returns `waitTimedOut: true` at once. Whenever a call returns `waitTimedOut: true`, the child keeps running and its completion wakes the thread, so treat it as async.
3. With async children still out, record their task ids with `steps note`, and end the turn with one status line. Each completion wakes the thread with a message that starts `Delegated task <id> (<title>) [completed]:` and carries the child's result.
4. Continue once every child has reported. Never poll a child with `task_status`, `sleep`, `Monitor`, or `ScheduleWakeup`. Follow the `next` field that `delegate_task` returns. Stop a child you no longer need with `task_cancel`.
5. A new review round, re-check, fix round, or retry is a new `delegate_task` with consolidated scope (the brief, the findings, and the objections), never `t3_thread_send` to an old child.

## PRs

- **Link every PR.** After `gh pr create`, or a push to a PR you took over, the next call is `link_pull_request`, or `link_pull_requests` with every layer of a stack. T3 often links a PR that a thread creates, so the call can return `alreadyLinked: true`. Make the call anyway. If linking fails, say so.
- **Wait with `watch_pull_request`.** When a PR waits on checks or reviews, finish any push first, call `watch_pull_request`, and end the turn. T3 wakes the thread on failed checks, passing required checks, new comments or reviews, and conflicts. The watch stays on, so do not call it again on a wake. A wake is not a merge decision. Check readiness with a status pass.
- **A status pass is one shot.** `~/.claude/skills/poteto-mode/scripts/watch-pr/watch-pr --status-only` (add `--queued-stack --stack-prs <bottom-to-top>` for a queue) gives GitHub's verdict once. Never run the polling watcher, `sleep` loops, `gh pr checks --watch`, `Monitor`, `ScheduleWakeup`, or `/loop` to wait on a PR.
- **Delegated children never watch.** A child that owns a PR does one round: fix, push, link, and a status pass. It ends its report with the line `PR <full URL>, head <SHA>, checks and reviews <state>`. The parent watches the PR and starts a fresh child for the next round on a wake.
- **Unwatch before handback.** Before a final reply, a pause, or a stop, call `unwatch_pull_request` on every PR this thread watches.

## Surfaces

- **Browser, Electron, and web UIs.** Use T3's preview tools (`preview_open`, `preview_snapshot`, `preview_act`, `preview_wait_for`, `preview_evaluate`) or the **playwright-cli** skill. When a pstack step says to drive the real surface, that is the user's request for browser work. Parallel children each open their own tab with `reuseExistingTab: false`. Close every tab you opened before you reply.
- **iOS Simulator and Android Emulator.** Use `device_list`, `device_open`, and `device_screenshot`, and run the `agent-device` command that `device_open` returns for every launch, tap, text entry, and screenshot. Never drive a device with `xcrun simctl`, `idb`, or `adb`. They stay fine for builds, installs, logs, and deleting simulators.
- **Charts and visual comparisons in a reply** (a benchmark, a hillclimb curve, a pixel diff). Pass the HTML to `html_preview`, then `html_render`.

## Waits, loops, and threads

- Before you end a turn that waits on a background Bash command or a Monitor you started, call `t3_background_wait` with its task id.
- `/loop` and `ScheduleWakeup` stay valid for heartbeats that are not PR waits, such as an Autonomous run predicate or an Autopilot audit tick. Use `schedule_task` for recurring work the user asks to schedule.
- Never create a top-level thread (`t3_thread_launch`, `create_threads`) unless the user asks for one. pstack fans out with `delegate_task` children.
- Given a T3 thread id or link to pick up, read it with `t3_thread_read` first. Mention a thread by its `link`, verbatim.
- For a secret, call `request_secret` and pass its `secretRef`. Never ask for a secret in chat.

## Hooks

t3-pstack installs hooks that turn the rules below into checks. A blocked call or reply names the fix. Make the fix and never route around the hook.

- **Stop.** In a poteto-mode session, the hook blocks a reply that names a principle whose leaf `SKILL.md` this session never read. It also blocks a session that opened a playbook without a step ledger.
- **PreToolUse on `gh pr create` and `gh pr new`.** In a poteto-mode session, the hook blocks a PR until this session, or one of its subagents, has run `/simplify` and the comment-sicko pass from `/no-comments`, and has read **technical-writing** and **unslop**. Reading `no-comments/SKILL.md` alone does not count. The comment-sicko pass is an Agent call with `subagent_type: "comment-sicko"`, or a `delegate_task` whose task opens with the comment-sicko role line. The hook reads the command text. It removes line continuations, backslash escapes, and quotes, then matches `gh`, any flags, `pr`, any flags, and `create` or `new`. So flags, split lines, and quoted words are caught. A command built from variables, `$'...'` quoting, `eval`, a script, or a `gh api` call is not caught, so the hook guards against a skipped step, not a determined bypass. Because it removes quotes, it also blocks a command that only mentions `gh pr create` in an argument, such as a `steps note`, until the gates ran. Reword the argument.
- **Where hooks run.** Hooks run in Claude sessions and in their delegated Claude children. They do not run in Codex children, so a Codex child that opens a PR skips the PR gate. Give PR-owner roles to Claude children.
- **PreToolUse on the Agent tool.** Under T3, the hook blocks `run_in_background: true` and `isolation`, and sets a missing `run_in_background` to `false`.

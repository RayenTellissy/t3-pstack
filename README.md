# pstack-claude

[pstack](https://github.com/cursor/plugins/tree/main/pstack), poteto's rigorous agent workflow skills, ported from Cursor to Claude Code.

The full README is [`pstack/README.md`](pstack/README.md). The walkthrough is the [pstack guide](pstack/docs/guide/README.md).

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/RayenTellissy/pstack-claude/main/install.sh | sh
```

The script downloads `main` and copies `skills`, `agents`, `output-styles`, and `pstack` into `~/.claude/`. Run the same command again to update. It replaces each pstack skill, agent, and output style and the guide, and removes any that upstream dropped. It keeps your model config, run stores, and your own skills, but you lose any edits or added files inside the installed pstack skills, and a skill of yours with the same name as a pstack skill is replaced. From a clone, `cp -R skills agents output-styles pstack ~/.claude/` works for a first install, but it removes nothing when you update.

Start a new Claude Code session, then run `/setup-pstack` to pick a reasoning budget, or skip it to keep the defaults. Use `/poteto-mode` at the start of any task that needs rigor. To keep it on every turn, run `/output-style poteto-mode`.

The poteto-mode `watch-pr` script and the `/statechart` scripts need [Node.js](https://nodejs.org) 22.18 or later. `/statechart` also installs TLC and Java with [mise](https://mise.jdx.dev) on its first run.

## What changed from upstream

- Models. Opus takes the code at `high` effort, and judgment, prose, and the hardest changes at `xhigh`. Review panels add Fable as a second voice. `/setup-pstack` writes `~/.claude/pstack/models.md`. Upstream picks each subagent's reasoning level and fast or standard speed per job. Claude Code has no per-subagent fast mode, so the port adjusts only `effort`.
- Subagents. `Task` becomes the Agent tool. Read-only reviewers use the bundled `pstack-readonly` agent. Cloud agents become subagents in their own git worktree.
- Custom Mode becomes the `poteto-mode` output style.
- Skills that use other pstack skills read them by path (`~/.claude/skills/<name>/SKILL.md`). Every pstack skill but `setup-pstack` sets `disable-model-invocation`, so the Skill tool refuses them.
- Cursor-only dependencies map to Claude Code equivalents: `/simplify` for `/deslop`, browser automation or Bash with a PTY (`expect` or `script`) for the control skills, and skill-creator for `create-skill`.
- Not ported: the benny automations, `make-bot-ui`, Origin, and upstream's own Claude Code plugin adapter (`docs/harness/`), which this port stands in for. Bugbot triage covers review bots in general.

The first commit is the untouched upstream, so `git diff $(git rev-list --max-parents=0 HEAD) -M` shows the whole port.

## Keeping up with upstream

[`scripts/upstream.json`](scripts/upstream.json) records the last upstream commit ported. Every Monday, the [Check upstream pstack](.github/workflows/check-upstream.yml) workflow compares it with upstream. When upstream has moved, it opens an issue labeled `upstream` that lists the new commits and every added, changed, renamed, or deleted file, by its path in this repo. New commits update the issue, and the workflow closes it once you are caught up. Run it by hand from the Actions tab.

To port by hand:

```bash
node scripts/check-upstream.mjs
node scripts/check-upstream.mjs --diff skills/swarm/SKILL.md
node scripts/check-upstream.mjs --done <commit>
```

The first prints the same report, and exits 1 while there is something to port. The second prints one file's upstream diff, or all of them without a path. After you port the changes, the third records the commit the report named. Commit `scripts/upstream.json` with the port.

## License

[MIT](LICENSE), copyright Lauren Tan.

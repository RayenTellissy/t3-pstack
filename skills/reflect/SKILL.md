---
name: reflect
description: Spawn three parallel review subagents over the active transcript, surface learnings, and route each to a concrete edit on an existing skill. Use when the user says reflect.
disable-model-invocation: true
---

# Reflect

Other pstack skills named here are files, not Skill tool calls, and the Skill tool refuses them. To run or apply one, Read `~/.claude/skills/<name>/SKILL.md` in full, or `~/.claude/skills/principle-<name>/SKILL.md` for a principle.

Mine the current conversation for durable learnings, then route them into skill edits.

Invoke when the user says "reflect" or "/reflect". Skip when the conversation is trivial, off-topic, or already covered by an existing skill the parent followed correctly. One-offs are not learnings.

## 1. Locate the active transcript

Before fanning out, find this conversation's transcript. Claude Code writes it to `~/.claude/projects/<project>/<session-id>.jsonl`, and the session id is in the `CLAUDE_CODE_SESSION_ID` environment variable inside Bash. Do not glob across `~/.claude/projects/*/`. That crosses workspace boundaries and reads private chats from unrelated projects.

```bash
find ~/.claude/projects -maxdepth 2 -name "$CLAUDE_CODE_SESSION_ID.jsonl"
```

This session's subagent transcripts sit beside it at `<project>/<session-id>/subagents/agent-<agentId>.jsonl`. If the lookup finds nothing, pass a tight digest of the session instead.

## 2. Spawn three reviewers in parallel

One message, three Agent calls, `subagent_type: "general-purpose"`. Reviewers need MCP access to look up the tickets, chat threads, and observability traces the transcript references, and `pstack-readonly` has no MCP tools.

Each reviewer and the synthesizer name a role line in `~/.claude/pstack/models.md` and a default. Pass that line's model and effort as the Agent call's `model` and `effort`, or the default if the file or the line is missing. Omit both when the value is `inherit`. A `codex/<model>` value is also valid under T3. The Spawning section of `~/.claude/skills/poteto-mode/references/t3-harness.md` says which tool runs each value. A value it does not cover falls back to the default, so say so. Pick each subagent's effort for the job, per the Subagents section of the **poteto-mode** skill (`~/.claude/skills/poteto-mode/SKILL.md`).

| Lens | Role line | Default `model` | Default `effort` | Prompt template |
|---|---|---|---|---|
| Judgment | `reflect judgment, divergent, synthesizer` | `opus` | `xhigh` | `references/judgment-reviewer.md` |
| Tooling | `reflect tooling` | `opus` | `high` | `references/tooling-reviewer.md` |
| Divergent | `reflect judgment, divergent, synthesizer` | `opus` | `xhigh` | `references/divergent-reviewer.md` |

Pass each template verbatim, substituting the transcript path or digest where marked. Reviewers return findings in the Agent response body.

## 3. Synthesize

One Agent call, `subagent_type: "general-purpose"`, `model` and `effort` from the `reflect judgment, divergent, synthesizer` line (default `opus xhigh`). It spot-verifies citations through MCP, and `pstack-readonly` has no MCP tools. Pass `references/synthesizer.md` verbatim, with each reviewer's full output inlined where marked. It returns an Accepted / Rejected / Backlog list.

## 4. Structural enforcement check

Move any Accepted item that a lint rule, script, metadata flag, or runtime check would enforce more reliably to Backlog. See the **encode-lessons-in-structure** principle skill.

## 5. Apply

Present the synthesizer's full Accepted / Rejected / Backlog output and wait for explicit approval before applying any Accepted edit. The user picks the subset and may redirect routings. Skill changes affect every future agent in the org. Do not auto-apply.

List each Backlog item in the summary, or in a local file, without waiting. File Backlog items to an issue tracker only if the user names one or approves it.

Never edit a skill under `~/.claude/plugins/cache/`. Before approval, show its destination, `.claude/skills/<skill>/` or `~/.claude/skills/<skill>/`. After approval, copy the skill folder there and edit the copy. Never open a PR or push.

Follow each approved row's Routing exactly:

- Trivial existing-skill edit (a one-line bullet, a tightened sentence, a stale fact corrected): the parent does it directly.
- Substantive existing-skill edit (a new section, a new pattern table, more than ~10 lines): hand to the **skill-creator** skill and run its draft / test / iterate loop. Without skill-creator installed, follow Claude Code's skills docs (https://code.claude.com/docs/en/skills).
- `tune description: <skill path>` (the skill exists but didn't trigger when it should have): hand to skill-creator and run its description-optimization loop.
- `new skill via skill-creator: <kebab-name>`: hand creation to skill-creator. Do not invent the shape ad hoc.

If your environment ships a SKILL.md validator, run it on every touched skill before declaring done.

## 6. Summarize for the user

Short list, no preamble:

- Edits applied: `<skill path>`. What changed, one line each.
- New skills created: `<skill path>`. One line each (rare).
- Backlog: `<item title>` (`<tags>`), plus the issue link if it was filed. One line each.
- Dropped: one line per rejected finding + reason from the synthesizer.

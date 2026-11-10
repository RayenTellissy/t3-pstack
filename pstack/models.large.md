# pstack model configuration. One line per role. Delete a line to fall back to the skill default.
# A value is `<model> <effort>`, passed as the Agent call's `model` and `effort`.
# `inherit` as a value: the role runs on the parent session's model (omit `model` and `effort`). `inherit` entries in a panel list still count toward its fan-out.
# Under T3, `codex/<model> <effort>` runs through delegate_task. See ~/.claude/skills/poteto-mode/references/t3-harness.md.
# budget: large (xhigh)
feature, refactoring: opus high
bug-fix: opus high
perf-issue: opus high
hillclimb: opus high
judgment and prose: opus xhigh
hardest tasks: fable medium
how explorer: haiku high
how explainer: opus xhigh
why investigators: opus high
why synthesizer: opus xhigh
reflect tooling: opus medium
reflect judgment, divergent, synthesizer: opus xhigh
arena runners: opus high, fable medium, codex/gpt-6.1-sol xhigh, codex/gpt-6-astra xhigh
arena cross-judge pool: opus xhigh, fable medium, codex/gpt-6.1-sol xhigh, codex/gpt-6-astra xhigh
swarm workers: opus high
architect runners: opus xhigh, fable medium, codex/gpt-6.1-sol xhigh, codex/gpt-6-astra xhigh
interrogate reviewers: opus xhigh, fable medium, codex/gpt-6.1-sol xhigh, codex/gpt-6-astra xhigh

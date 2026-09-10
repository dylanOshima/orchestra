---
name: using-orchestra
description: Use when starting any conversation - establishes how to find and use skills, requiring skill invocation before ANY response including clarifying questions. Orchestra is OpenCode-native fast-flow methodology.
---

<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task, ignore this skill.
</SUBAGENT-STOP>

<EXTREMELY-IMPORTANT>
If you think there is even a 1% chance a skill might apply to what you are doing, you ABSOLUTELY MUST invoke the skill.

IF A SKILL APPLIES TO YOUR TASK, YOU DO NOT HAVE A CHOICE. YOU MUST USE IT.

This is not negotiable. You cannot rationalize your way out of this.
</EXTREMELY-IMPORTANT>

## The Rule

**Invoke relevant or requested skills BEFORE any response or action** — including clarifying questions, exploring the codebase, or checking files. If it turns out wrong for the situation, you don't have to use it.

**Before entering plan mode:** if you haven't already brainstormed, invoke the brainstorming skill first.

Then announce "Using [skill] to [purpose]" and follow the skill exactly. If it has a checklist, create a todo per item.

## Skill Priority

When multiple skills apply, process skills come first — they set the approach, then implementation skills (frontend-design, etc.) carry it out. Brainstorming and systematic-debugging are orchestra's most common process skills, but the rule holds for any of them.

- "Let's build X" → brainstorming first, then task-breakdown → executing-tasks deliver it (also works as mvp:brainstorming for Claude compatibility).
- "Fix this bug" → systematic-debugging first, then domain skills.
- "Keep going on <feature>" → executing-tasks resumes from docs/mvp/tasks.jsonl.
- Shared protocol: `docs/mvp/tasks.jsonl` is cross-harness; progress tracked via `.progress/*.json` + fallback STATUS block + file watcher.

## Red Flags

These thoughts mean STOP—you're rationalizing:

| Thought | Reality |
|---------|---------|
| "This is just a simple question" | Questions are tasks. Check for skills. |
| "I need more context first" | Skill check comes BEFORE clarifying questions. |
| "Let me explore the codebase first" | Skills tell you HOW to explore. Check first. |
| "I can check git/files quickly" | Files lack conversation context. Check for skills. |
| "Let me gather information first" | Skills tell you HOW to gather information. |
| "This doesn't need a formal skill" | If a skill exists, use it. |
| "I remember this skill" | Skills evolve. Read current version. |
| "This doesn't count as a task" | Action = task. Check for skills. |
| "The skill is overkill" | Simple things become complex. Use it. |
| "I'll just do this one thing first" | Check BEFORE doing anything. |
| "This feels productive" | Undisciplined action wastes time. Skills prevent this. |
| "I know what that means" | Knowing the concept ≠ using the skill. Invoke it. |

## Platform Adaptation

If your harness appears here, read its reference file for special instructions:

- OpenCode: `references/opencode-tools.md` (primary – orchestra is OpenCode-native)
- Codex: `references/codex-tools.md`
- Pi: `references/pi-tools.md`
- Antigravity: `references/antigravity-tools.md`
- Hermes Agent: `references/hermes-tools.md`

### OpenCode Notes (orchestra-optimized)
- Skills are loaded via native `skill` tool (bare names: `brainstorming`, not `mvp:brainstorming`)
- Task tracking via `orchestra_tasks` custom tool + file watcher on `docs/mvp/.progress/*.json`
- Subagents via `task` tool – use `orchestra-task-executor` and `orchestra-orchestrator`
- Completion signal is STATUS block + `.progress/*.json` (shared protocol)
- Scripts path via env `ORCHESTRA_SCRIPTS` (compat `CLAUDE_PLUGIN_ROOT` alias set by plugin)
- Bootstrap injected via `experimental.chat.messages.transform` + compaction preserved via `experimental.session.compacting`

## User Instructions

User instructions (CLAUDE.md, AGENTS.md, GEMINI.md, etc, direct requests) take precedence over skills, which in turn override default behavior. Only skip skill workflows or instructions when your human partner has explicitly told you to.

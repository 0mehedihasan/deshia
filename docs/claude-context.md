# Claude Context System

DeshiA ships a self-contained context system so a fresh Claude / coding-agent
session can work productively **without any prior conversation history**.

## What's included

```
.claude/
├─ CLAUDE.md                     # authoritative project instructions (read first)
└─ skills/
   ├─ frontend-design/SKILL.md   # workstation aesthetic, tokens, three-zone layout
   ├─ annotation-engine/SKILL.md # schema-driven engine, bbox math, color palette
   ├─ dataset-engine/SKILL.md    # scanner: discovery, checksum, metadata, dedupe
   ├─ database/SKILL.md          # Drizzle + better-sqlite3, repositories, txns
   ├─ export/SKILL.md            # Pascal VOC, output tree, submission transaction
   ├─ testing/SKILL.md           # Vitest units, Playwright loop, verification gate
   ├─ research-quality/SKILL.md  # data integrity, reproducibility, no fabrication
   ├─ desktop-filesystem/SKILL.md# Tauri shell, native dialogs, path safety
   └─ recovery/SKILL.md          # autosave, drafts, crash recovery
AGENTS.md                        # entry point + working agreement for agents
CONTRIBUTING.md                  # human + agent contribution guide
docs/*.md                        # detailed subsystem documentation
```

## How to use it

1. **Read [`.claude/CLAUDE.md`](../.claude/CLAUDE.md)** — project purpose,
   architecture, golden rules, tech stack, design system, DB/annotation/color/
   filesystem/export rules, the Rickshaw schema, testing, workflow, and key
   architectural decisions.
2. **Open the relevant skill** in `.claude/skills/` for the subsystem you're
   touching. Skills are focused playbooks with the exact files and constraints.
3. **Consult `docs/`** for depth (architecture, schema, dataset/export formats,
   development, recovery).
4. Follow [`AGENTS.md`](../AGENTS.md) for the working agreement and the
   verification gate.

## Precedence

When sources conflict, prefer in this order: **the code** → `.claude/CLAUDE.md`
→ skills → `docs/`. If you find a discrepancy, fix the code or update the doc so
they agree — stale instructions are worse than none.

## Keeping it accurate

Any change that alters behavior (new rule, renamed module, changed export
layout, new dependency) must update `.claude/CLAUDE.md` and the affected
`docs/`/skill in the same change. The context system is only useful if it stays
true to the implementation.

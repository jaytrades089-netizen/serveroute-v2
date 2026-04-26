# ServeRoute V2 — Workspace Map
**Product:** Process serving workflow app | **Stack:** React/Vite + TanStack Query + Shadcn/ui + Tailwind | **Platform:** Base44 (auto-syncs from GitHub)
**Repo:** github.com/jaytrades089-netizen/serveroute-v2 | **Local:** ~/Desktop/Claude/serveroute-v2

---

## Session Startup — Run Every Time
```bash
cd ~/Desktop/Claude/serveroute-v2 && git pull
```

---

## Folder Structure

```
serveroute-v2/
├── CLAUDE.md                  ← You are here (always loaded)
├── docs/
│   ├── WORKFLOW.md            ← Full rules manual — read before any code work
│   ├── specs/                 ← Feature specs before building (spec_[feature].md)
│   └── handoffs/              ← Session handoff notes (handoff_YYYY-MM-DD.md)
└── src/
    ├── pages/                 ← One file per screen, auto-registers (no routing config)
    ├── components/
    │   └── hooks/             ← ALL hooks live here only, never anywhere else
    └── api/                   ← Base44 data layer
```

---

## Quick Navigation

| Want to... | Read first | Skip |
|---|---|---|
| Fix a bug | `docs/WORKFLOW.md` + affected `.jsx` file | Everything else |
| Build a new feature | `docs/WORKFLOW.md` + relevant spec in `docs/specs/` | Unrelated components |
| Start a new session | `CLAUDE.md` + latest file in `docs/handoffs/` | `node_modules`, configs |
| Write a Base44 prompt | Feature spec + affected component files | Assets, unrelated pages |
| Add a hook | `src/components/hooks/` only | Anywhere else |

---

## Naming Conventions

| File type | Pattern | Example |
|---|---|---|
| Feature spec | `spec_[feature].md` | `spec_scheduled-serve.md` |
| Session handoff | `handoff_[YYYY-MM-DD].md` | `handoff_2026-04-24.md` |
| Bug note | `fix_[component]_[YYYY-MM].md` | `fix_android-camera_2026-04.md` |
| Audit note | `audit_[topic].md` | `audit_derived-state.md` |
| Components | PascalCase | `WorkerRouteDetail.jsx` |
| Hooks | camelCase with `use` prefix | `useRouteCache.js` |

---

## File Placement Rules

- **New components** → `src/components/`
- **New hooks** → `src/components/hooks/` (mandatory)
- **New screens** → `src/pages/` (auto-registers, no routing config needed)
- **Feature specs** → `docs/specs/spec_[feature].md`
- **Session handoffs** → `docs/handoffs/handoff_[YYYY-MM-DD].md`
- **Never touch** → `pages.config.js` (Base44 regenerates on every deploy)

---

## Push to GitHub (Joshua runs this after every delivery)
```bash
cd ~/Desktop/Claude/serveroute-v2 && git add -A && git commit -m "your message" && git push
```
Base44 auto-syncs. Build status: **"Live"** = deployed. **"Building"** = still syncing. Wait for Live before concluding a fix didn't work.

---

## Hard Rules (never break these)
- Read the file before editing it — never write from memory
- Return complete files only — no snippets, no partial edits
- Only modify files explicitly requested — no drive-by changes
- Use `refetchQueries` not `invalidateQueries`
- Never mutate cached arrays directly — spread first: `[...array].sort()`
- Any new modal with input gets: `onInteractOutside={(e) => e.preventDefault()}` and `onEscapeKeyDown={(e) => e.preventDefault()}`
- Any button firing a DB write gets a `disabled` state guard
- `company_id` on every new database entity from day one

---

## Workspace Audit

This workspace uses `serveroute-gemma:latest` for small tasks via Cline.
Audit results recorded in: `~/Desktop/Claude/Skills/GEMMA_WORKSPACE_AUDIT.md`

Re-run the audit any time this CLAUDE.md changes significantly or new files are added.
Audit prompt lives in the audit doc — paste into Cline with serveroute-gemma, record results.

---

*ServeRoute V2 — April 2026 | RouteToServe LLC*

# ServeRoute V2 — Full Workflow Manual
*The rules. Read this before any code work. CLAUDE.md is the map — this is the manual.*
*Last updated: April 2026*

---

## The Stack

- **Framework:** React + Vite
- **UI:** Shadcn/ui + Tailwind CSS
- **Data fetching:** TanStack Query (v5)
- **Platform:** Base44 (no-code hosting, auto-syncs from GitHub)
- **Maps:** HERE Maps (geocoding), MapQuest (route optimization)
- **OCR:** Google Vision API + ML Kit on-device
- **Local repo:** `~/Desktop/Claude/serveroute-v2`
- **GitHub:** `github.com/jaytrades089-netizen/serveroute-v2`

---

## How to Read the Codebase

### Key paths

```
src/
  pages/            — One file per screen. Pages auto-register — no routing config needed.
  components/       — Shared UI components
  components/hooks/ — ALL hooks must live here. Never anywhere else.
  api/              — Base44 data layer (entities, queries)
```

### Before touching any file
1. Read the relevant source files first — never write blind
2. Check `docs/` for any relevant spec or handoff note
3. If editing a component that uses TanStack Query, check the query key before touching anything cache-related

---

## How to Make Changes

### The rule: read first, then write
Always read the current file before editing. Never overwrite from memory or a prior session — the file may have changed.

### Return format — non-negotiable
Every file delivered must be:
- **Complete** — no snippets, no `// rest of file unchanged` placeholders
- **Labeled** — 2–3 sentences explaining what changed and why
- **Scoped** — only files explicitly requested get modified

### Never do these without being asked
- Add new screens, buttons, icons, or UI elements
- Write to `pages.config.js` (Base44 regenerates it on every deploy)
- Add new npm packages without flagging first
- Create files outside `src/` without confirming

---

## Field Bug Prevention — Mandatory

### Any new modal that takes user input must have:
```jsx
<DialogContent
  onInteractOutside={(e) => e.preventDefault()}
  onEscapeKeyDown={(e) => e.preventDefault()}
>
```

### Any button firing a database write must have a disabled state guard:
```jsx
const [saving, setSaving] = useState(false);

async function handleSave() {
  setSaving(true);
  try {
    await Entity.create({ ... });
  } finally {
    setSaving(false);
  }
}

<Button disabled={saving} onClick={handleSave}>Save</Button>
```

### Optimistic UI / temp record filter:
Any `useEffect` merging server data into local state must filter out pending temp records:
```jsx
.filter(item => !item.id?.startsWith('temp_'))
```

---

## GitHub Push (Joshua runs this)

```bash
cd ~/Desktop/Claude/serveroute-v2 && git add -A && git commit -m "your message" && git push
```

If there are stashed changes:
```bash
cd ~/Desktop/Claude/serveroute-v2 && git stash && git pull --rebase && git stash pop && git add -A && git commit -m "your message" && git push
```

**Base44 auto-syncs after every push. Wait for "Live" status before concluding a fix didn't work.**

---

## TanStack Query Rules

- Use `refetchQueries` — **not** `invalidateQueries` (offline-first requirement)
- `staleTime` is 4 hours globally — do not override without a reason
- Cache keys must be unique per query shape — shared keys with conflicting return types cause crashes
- Never mutate cached data directly — always spread: `[...cachedArray].sort()`
- Temp records use `id.startsWith('temp_')` — filter in any useEffect merging server + local state

---

## Architecture Rules

- `company_id` on every new database entity from day one — required for solo → company migration
- Never store computed fields: `order_index`, `combo_total_miles`, `combo_total_drive_time_minutes`, `run_count` — build in memory at runtime
- Never read stored `order_index` for re-optimization — always build fresh in memory
- `localStorage` scratch-pad pattern: key format `feature:type:userId:periodTag` — sweep stale keys on mount, wrap in try/catch
- Never put viewport backgrounds at `z-index: -1` — use `z-index: 0` with `pointerEvents: 'none'`

---

## When Two Approaches Exist
Always choose the one that changes fewer files. Minimize blast radius.

---

## Quick Reference — Never Do This

| Never | Why |
|---|---|
| Write to `pages.config.js` | Base44 regenerates on every deploy |
| Put hooks outside `src/components/hooks/` | Breaks Base44 hot reload |
| Use `invalidateQueries` | Breaks offline-first caching |
| Mutate cached arrays directly | React rendering bugs |
| Add UI not in spec | Scope creep, costs credits |
| Use `new Date(value)` without null check | Crashes on null scheduled_datetime |
| Put viewport bg at `z-index: -1` | Paints under html background-color |

---

## Base44 Specifics

- `pages.config.js` is regenerated on every deploy — never manually register routes
- Routing workarounds must live inside existing page files
- Serverless functions only — no separate backend
- Google Vision API key stays in Base44 secrets only, never in codebase
- Build takes ~2–3 minutes after push — confirm "Live" before concluding failure

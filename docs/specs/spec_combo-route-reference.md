# Combo Route System — Reference Document

**Last updated:** 2026-04-29  
**Purpose:** Complete technical reference for the combo route feature. Read this before touching any combo route file.

---

## What It Does

A combo route lets Joshua select 2+ individual route folders, run a single optimized drive order across all of them, then see a review screen that tells him how to physically organize his folders to match the route. Numbers 1–N are global — stop #1 is the first address regardless of which folder it's in.

**Core user workflow:**
1. Tap "Combo Route" from WorkerRoutes
2. Select routes to combine (checkboxes)
3. Tap "Continue to Optimize" → optimization modal slides down
4. Set start location (GPS toggle or saved location), optimization mode, end location
5. Tap "Optimize Combo Route" → geocoding + MapQuest runs
6. Navigate to **ComboRouteReview** → shows all addresses in drive order, grouped by folder with global sequence numbers
7. Joshua physically re-orders his folders to match
8. Taps "Start Combo Route" → goes to **WorkerComboRouteDetail** to run the route

---

## Files

| File | Role |
|---|---|
| `src/pages/ComboRouteSelection.jsx` | Route selection + optimization modal + entire optimization logic |
| `src/pages/ComboRouteReview.jsx` | Review screen — addresses in drive order, grouped by folder |
| `src/pages/WorkerComboRouteDetail.jsx` | Active running screen (same pattern as WorkerRouteDetail) |
| `src/components/common/ComboRouteCard.jsx` | Card shown on WorkerRoutes for active combo |
| `src/components/services/OptimizationService.jsx` | Shared optimization engine (not combo-specific) |

---

## Database Entity: `ComboRoute`

Key fields that the combo route system reads and writes:

| Field | Type | Purpose |
|---|---|---|
| `id` | string | Primary key |
| `user_id` | string | Owner |
| `company_id` | string | Required on create |
| `route_ids` | string[] | IDs of all selected Route records |
| `route_order` | string[] | Folder IDs in the order they first appear in the optimized sequence |
| `optimized_order` | string[] | **THE critical field** — Address IDs in global drive order. This is what every screen uses to sort addresses. If empty, all screens fall back to creation-date sort. |
| `end_location_id` | string | SavedLocation ID for the end point |
| `status` | string | `'active'` while running, `'completed'` when stopped or a new combo is created |
| `total_addresses` | number | Count at creation time |
| `total_miles` | number | MapQuest-calculated drive distance |
| `total_drive_time_minutes` | number | MapQuest-calculated drive time |
| `started_at` | ISO string | Timestamp when combo was created |

**On individual Address records**, the field `order_index` (1–N integer) is also written during optimization as a secondary reference, but **screens sort by `combo.optimized_order`, not `order_index`**.

---

## Optimization Flow (inside `handleOptimizeCombo`)

```
1. Guard: optimizingRef.current blocks double-fire
2. Validate: ≥2 routes selected, API key present, GPS/start location ready
3. setIsOptimizing(true)
4. Mark all existing active ComboRoutes as 'completed' + clear combo_route_ids on their routes
5. Fetch all addresses from selected routes (served: false, not deleted)
6. Geocode any addresses missing lat/lng (uses HERE then MapQuest fallback, with GPS bias)
7. Outlier detection: warn if any address is 100+ miles from the centroid
8. Call optimizeWithHybrid(addresses, startLat, startLng, endLat, endLng, apiKey)
   └── nearest-neighbor pre-sort from GPS
   └── MapQuest optimizedroute API (chunks of 23 stops max)
   └── Falls back to nearest-neighbor if MapQuest fails
9. Build optimizedOrder = array of address IDs in drive sequence
10. Calculate route metrics (MapQuest Directions API, chunked in 90-waypoint blocks)
11. ComboRoute.create({ ..., optimized_order: optimizedOrder, ... })
12. Write order_index to each Address in batches of 10
13. Set all selected routes to status: 'active'
14. Poll until ComboRoute record is readable AND optimized_order.length > 0 (up to 9s)
15. navigate(ComboRouteReview?id=..., { state: { optimized_order: optimizedOrder } })
```

All Base44 calls in steps 4–14 go through the `b44()` retry wrapper which retries up to 3× on 429 rate-limit errors with 3s/6s/9s backoff.

---

## How `ComboRouteReview` Renders

The review screen groups addresses by folder but numbers them globally.

**Sort order (priority):**
1. `location.state.optimized_order` — passed via React Router navigation state immediately from `ComboRouteSelection`. Available the instant the page loads, before any DB fetch completes.
2. `combo.optimized_order` — from the DB record. Kicks in if user navigates back to this page directly (e.g., from a bookmark or back button), where nav state is gone.
3. Fallback: sort by `created_date` — only if both are missing. Produces meaningless creation order, not a real route.

**The `globalOrderMap`:**
```js
sortedAddresses.forEach((addr, idx) => { map[addr.id] = idx + 1; });
```
Every address gets a number 1–N from its position in the sorted list. This is what renders in the yellow circle badge. Numbers are global across all folders — folder A might show 1, 2, 7, 11 if those are its stops in the overall route.

**Folder grouping:**
Addresses are grouped by `route_id`, then folders are sorted by the position of their earliest address in `sortedAddresses`. So the folder whose first address is stop #1 appears at the top of the review screen.

---

## How `WorkerComboRouteDetail` Renders

Same `sortedAddresses` logic as ComboRouteReview, but reads from `combo.optimized_order` only (no nav state — user navigates here from the review screen's "Start" button). Delegates address card rendering to `AnimatedAddressList`.

**On stop:**
- Each route: status → `'completed'` if all addresses served, `'assigned'` if not
- ComboRoute: status → `'completed'`
- Does NOT delete the ComboRoute — history is preserved

**Auto-refetch:** addresses query uses `refetchInterval: 30000` to pick up serves done by other devices.

---

## Known Issues Fixed (important for debugging)

### Sequence numbers showing `?`
**Cause:** `combo.optimized_order` was empty (no optimization run, or old combo).  
**Fix:** `globalOrderMap` is built from `sortedAddresses` which always has a fallback, so badges always show a number.

### Review screen showed wrong order (creation-date sort instead of optimized)
**Cause:** Base44 has a propagation delay (~30s) between writing `optimized_order` to the DB and it being readable on the GET endpoint. ComboRouteReview fetched the record immediately after navigation and got an empty `optimized_order`.  
**Fix:** `optimized_order` is passed through React Router navigation state from `ComboRouteSelection`. The review screen reads from nav state first, so it shows the correct order immediately without touching the DB.

### "Combo route not found" on review screen
**Cause:** Same propagation delay — the DB record itself wasn't readable yet.  
**Fix:** `handleOptimizeCombo` polls for `ComboRoute.filter({ id: combo.id })` with `optimized_order.length > 0` check before navigating (up to 9s).

### Optimization running multiple times
**Cause:** React state updates are async — `isOptimizing` doesn't re-render the disabled button before a second tap registers.  
**Fix:** `optimizingRef.current` (useRef) blocks re-entry synchronously at the very top of `handleOptimizeCombo`.

### 429 Rate Limit errors
**Cause:** Repeated API calls from old bugs (refetchInterval loop, duplicate optimizations) exhaust Base44's rate limit window.  
**Fix:** All Base44 calls in `handleOptimizeCombo` go through `b44(fn)` which auto-retries on 429 with 3s/6s/9s backoff.

### Archived/completed routes showing in combo selector
**Cause:** The DB query `{ deleted_at: null }` was unreliable in Base44 for routes where the field was never explicitly set.  
**Fix:** JS-side filter `!r.deleted_at && ['ready', 'assigned', 'active'].includes(r.status)` instead of relying on the DB-side filter.

### Optimization not interleaving addresses (all one folder first, then another)
**This may not be a bug.** If the two routes are geographically clustered in separate areas, MapQuest's optimal route IS to do all of one area before moving to the other. You'll only see interleaved numbers (e.g., B4: 1, 3, 7 / B2: 2, 4, 5, 6) when the routes have stops physically adjacent to each other.

---

## API Dependencies

| API | Used For | Key |
|---|---|---|
| MapQuest Optimized Route | Sequencing stops in drive order | `mapquest_api_key` in UserSettings or backendApiKeys |
| MapQuest Directions | Calculating total miles + drive time | Same key |
| MapQuest Geocoding | Reverse geocode GPS → readable address label | Same key |
| HERE Maps | Geocoding addresses (primary, falls back to MapQuest) | `here_api_key` in UserSettings or backendApiKeys |

Keys are fetched via two paths (in priority order):
1. `base44.functions.invoke('getApiKeys')` → `backendApiKeys`
2. `base44.entities.UserSettings.filter({ user_id })` → `userSettings`

The combined key is: `backendApiKeys?.mapquest_api_key || userSettings?.mapquest_api_key`

**If optimization fails silently** (addresses in creation order, no toast error): check that the MapQuest key is valid. A 401 from MapQuest causes nearest-neighbor fallback, not an error toast, because the error is inside `OptimizationService` which catches it quietly.

---

## Optimization Engine Notes (`OptimizationService.jsx`)

`optimizeWithHybrid(addresses, startLat, startLng, endLat, endLng, apiKey)`:
- Filters addresses without coordinates into `invalidAddresses` (appended at end — they cannot be routed)
- Step 1: Nearest-neighbor pre-sort from GPS
- Step 2: Split into chunks of 23 (MapQuest limit is 25 total locations including start/end)
- Step 3: MapQuest `optimizedroute` API on each chunk. On 401/failure → chunk keeps nearest-neighbor order
- Step 4: Assign zone labels (cosmetic only, no effect on order)
- Returns full array in drive order

**The `routeType` parameter** (fastest vs shortest) — as of April 2026 this is passed to the Directions API for metrics calculation but `optimizeChunkWithMapQuest` still hardcodes `routeType: 'fastest'` for the actual sequencing call. If you need to fix this, update line ~58 in `OptimizationService.jsx`.

---

## Query Key Reference

| Query Key | Data |
|---|---|
| `['comboRoute', comboId]` | Single ComboRoute record |
| `['comboRoutes', combo?.route_ids]` | Route records for a combo |
| `['comboAddresses', combo?.route_ids]` | All addresses across all routes in a combo |
| `['comboDetailRoutes', combo?.route_ids]` | Routes on the detail/running screen |
| `['comboDetailAddresses', combo?.route_ids]` | Addresses on the detail/running screen |
| `['comboDetailAttempts', combo?.route_ids]` | Serve attempts on the detail screen |

---

*RouteToServe V2 — Combo Route Reference | April 2026*

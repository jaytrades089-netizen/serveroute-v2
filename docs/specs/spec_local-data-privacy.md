# Local Data Privacy — Encrypted On-Device Store

**Last updated:** 2026-04-29
**Status:** Spec complete — not yet built
**Priority:** High — legal compliance requirement

---

## Context & Decision Log

Joshua runs a legal process serving business. Defendant names, legal addresses, and serve photos are sensitive PII. Base44 is the hosting platform and database provider — any field written through `base44.entities.Address` lands on Base44's cloud servers in plain text. This is unacceptable for legal compliance.

**Decision:** Hybrid approach.
- Sensitive address fields → AES-256 encrypted, stored in IndexedDB on the device
- Photos taken during serving → stored as raw blobs in IndexedDB (no cloud upload)
- Non-sensitive fields (served status, order, route ID, attempt history) → Base44 as normal
- Backup/recovery → exportable encrypted JSON file that the user saves to their device
- Future migration path → the backup file IS the data portability format for the next app

**What Joshua confirmed:**
1. The backup file contains both the key and the data — whoever holds the file holds the data. That is intentional. The file should be kept somewhere safe on the device.
2. Existing addresses in Base44 should be migrated into the local store first. Leave Base44 data intact for now — wipe sensitive fields from Base44 later once routes are completed, as a safety net.
3. Photo loss is acceptable — photos do NOT need a backup copy.
4. The backup file format should be clean and versioned so the new app can import from it directly.

---

## What Goes Where

### Sensitive — local encrypted store only
| Field | Notes |
|---|---|
| `defendant_name` | Core PII |
| `legal_address` | Core PII |
| `normalized_address` | Core PII |
| `lat` | Derived from address — PII |
| `lng` | Derived from address — PII |
| `notes` | May contain personal details |

### Photos — IndexedDB blob store only
Stored as raw blobs keyed by `attemptId + index`. Never uploaded to Base44. Currently `AddressCard.jsx` calls `base44.integrations.Core.UploadFile` — this gets replaced with a local blob write.

### Non-sensitive — Base44 (unchanged)
`id`, `route_id`, `company_id`, `user_id`, `serve_type`, `pay_rate`, `geocode_status`, `status`, `served`, `served_at`, `order_index`, `attempts_count`, `receipt_status`, `created_date`, `deleted_at`, `combo_route_id`

Attempt records (attempt time, type, result) stay in Base44. Only `photo_urls` changes — instead of cloud URLs it will hold local reference keys (`local:attemptId:0`, `local:attemptId:1`, etc.) so the app knows to read from IndexedDB.

---

## Backup File Format

```json
{
  "version": "1",
  "app": "RouteToServe",
  "exported_at": "2026-04-29T12:00:00.000Z",
  "user_id": "<base44 user id>",
  "key": "<base64-encoded raw AES-256 key>",
  "addresses": [
    {
      "id": "<base44 address id>",
      "route_id": "<base44 route id>",
      "iv": "<base64 initialization vector>",
      "data": "<base64 AES-GCM encrypted JSON blob>"
    }
  ]
}
```

Each encrypted blob decrypts to:
```json
{
  "defendant_name": "...",
  "legal_address": "...",
  "normalized_address": "...",
  "lat": 0.0,
  "lng": 0.0,
  "notes": "..."
}
```

**Design notes for new app import:**
- Check `version` field first — bump to `"2"` if the schema ever changes
- The `key` field is the raw exported AES-256 key, base64 encoded
- Each address encrypted independently with its own `iv`
- Decrypt with: `AES-GCM`, key from `key` field, iv from each record's `iv` field
- The `id` field maps to whatever the address ID is in the current system

---

## IndexedDB Schema

**Database name:** `rts_local_v1`

| Store | Key | Value | Purpose |
|---|---|---|---|
| `address_sensitive` | addressId (string) | `{ id, route_id, iv, data }` | Encrypted address blobs |
| `photos` | `"attemptId:index"` (string) | `{ blob, mimeType, capturedAt }` | Raw photo blobs |
| `meta` | string | any | App metadata (key material, migration state) |

**Meta keys:**
- `keyMaterial` → base64 raw AES-256 key (generated on first run, never leaves device except in backup file)
- `migrationCompleted` → boolean — true once the one-time Base44 migration has run

---

## Files to Create

### `src/components/services/LocalDataService.js`
The core encryption engine. All other code goes through this.

**Responsibilities:**
- Key management: generate on first run, persist to IndexedDB `meta` store, retrieve on subsequent runs
- `encryptAddress(id, routeId, sensitiveData)` → writes encrypted record to `address_sensitive` store
- `decryptAddress(id)` → reads and decrypts one record
- `decryptAllAddresses()` → returns all decrypted records as `{ [addressId]: sensitiveData }`
- `savePhoto(attemptId, index, blob, mimeType)` → writes blob to `photos` store
- `getPhoto(attemptId, index)` → reads blob, returns object URL for display
- `deletePhoto(attemptId, index)` → removes blob
- `exportBackup(userId)` → builds the full backup JSON (key + all encrypted records), triggers browser download
- `importBackup(file)` → reads backup file, re-imports key + all address records, overwrites existing

**Encryption implementation:**
```js
// Key generation (run once, persisted to IndexedDB)
const key = await crypto.subtle.generateKey(
  { name: 'AES-GCM', length: 256 },
  true,
  ['encrypt', 'decrypt']
);

// Encrypt a record
const iv = crypto.getRandomValues(new Uint8Array(12));
const encoded = new TextEncoder().encode(JSON.stringify(sensitiveData));
const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
// Store: { iv: base64(iv), data: base64(encrypted) }

// Decrypt a record
const decrypted = await crypto.subtle.decrypt(
  { name: 'AES-GCM', iv: base64ToUint8(record.iv) },
  key,
  base64ToUint8(record.data)
);
const sensitiveData = JSON.parse(new TextDecoder().decode(decrypted));
```

### `src/components/hooks/useLocalAddressStore.js`
React hook wrapping `LocalDataService`. Provides:
- `localData` — map of `{ [addressId]: { defendant_name, legal_address, normalized_address, lat, lng, notes } }`
- `isReady` — boolean, true once key is loaded and store is initialized
- `saveAddress(id, routeId, sensitiveData)` — encrypts and writes
- `exportBackup()` — triggers download
- `importBackup(file)` — restores from file
- `migrationStatus` — `'needed'` | `'running'` | `'done'`
- `runMigration(allAddresses)` — one-time pull from Base44, encrypt locally

Loads all decrypted data into memory on mount. Components merge this with Base44 address stubs to get the full address object.

---

## Files to Modify

### `src/pages/WorkerRoutes.jsx`
**Read path:** After `allAddresses` loads from Base44, merge `localData` from `useLocalAddressStore`:
```js
const { localData, isReady } = useLocalAddressStore();

const mergedAddresses = useMemo(() => {
  if (!isReady) return allAddresses;
  return allAddresses.map(a => ({ ...a, ...(localData[a.id] || {}) }));
}, [allAddresses, localData, isReady]);
```
Pass `mergedAddresses` instead of `allAddresses` to `RouteCard` and `AddressSearch`.

Also update the cache-seeding `useEffect` to seed from `mergedAddresses` so `WorkerRouteDetail` gets the full merged data pre-populated.

### `src/pages/WorkerRouteDetail.jsx`
Same merge pattern on the `addresses` query result:
```js
const { localData, isReady } = useLocalAddressStore();

const mergedAddresses = useMemo(() => {
  if (!isReady) return addresses;
  return addresses.map(a => ({ ...a, ...(localData[a.id] || {}) }));
}, [addresses, localData, isReady]);
```
Use `mergedAddresses` everywhere `addresses` is currently used in the render.

### `src/pages/AddAddress.jsx` (line 65)
Split the `Address.create` call:
```js
// 1. Write non-sensitive fields to Base44
const newAddress = await base44.entities.Address.create({
  route_id, company_id, user_id, serve_type, pay_rate,
  geocode_status: 'pending', status: 'pending'
});

// 2. Write sensitive fields to local store
await saveAddress(newAddress.id, routeId, {
  defendant_name, legal_address, normalized_address,
  lat, lng, notes
});
```

### `src/pages/AddressImport.jsx` (line 227)
Same split pattern. Fields to keep in Base44: `company_id`, `serve_type`, `pay_rate`, `geocode_status`, `status`. Fields to send to local store: `legal_address`, `normalized_address`, `city`, `state`, `zip`.

Note: `city`, `state`, `zip` are lower sensitivity — at Joshua's discretion whether these stay local or go to Base44. Default: keep local.

### `src/pages/ScanRouteSetup.jsx` (line 194)
Same split. Scan-created addresses have `legal_address` and `normalized_address` from OCR — both local.

### `src/pages/ScanAddToRoute.jsx` (line 154)
Same split.

### `src/pages/BulkRouteSetup.jsx` (line 202)
Same split.

### `src/pages/EditAddress.jsx` (line 111)
Split the `Address.update` call. Sensitive fields go to `saveAddress`, non-sensitive to Base44.

### `src/components/address/AddressCard.jsx` (lines 267, 348, 414)
**Photo upload replacement.** Currently:
```js
const { file_url } = await base44.integrations.Core.UploadFile({ file: photoToUpload.file });
photo_urls: [file_url]
```

Replace with:
```js
const index = existingPhotos.length;
await savePhoto(attemptId, index, photoToUpload.file, photoToUpload.file.type);
const localKey = `local:${attemptId}:${index}`;
photo_urls: [...existingPhotos, localKey]
```

**Photo display.** Wherever `photo_urls` is rendered (lines ~925, 1078, 1365), detect `local:` prefix and resolve via `getPhoto()`:
```js
const resolvePhotoUrl = async (url) => {
  if (url.startsWith('local:')) {
    const [, attemptId, index] = url.split(':');
    return await getPhoto(attemptId, parseInt(index));
  }
  return url; // legacy cloud URL — still works
};
```

This backward-compatibility means existing cloud photos continue displaying. Only new photos go local.

### `src/pages/WorkerSettings.jsx`
Add a **"Data & Privacy"** section with:
- **Export Backup** button → calls `exportBackup()`, downloads `rts-backup-YYYY-MM-DD.json`
- **Import Backup** button → file picker, calls `importBackup(file)`
- **Migrate Existing Addresses** button → visible only when `migrationStatus === 'needed'`
  - Shows count of addresses found in Base44 with sensitive fields
  - On confirm: runs `runMigration(allAddresses)`, encrypts all to local store
  - Sets `migrationCompleted: true` in IndexedDB meta
  - Does NOT wipe Base44 yet — Joshua will do that manually later per route

---

## Migration Flow (one-time)

Triggered from WorkerSettings by Joshua manually after first deploy.

```
1. Show banner: "X addresses found in cloud — tap to move to device"
2. Joshua taps "Migrate"
3. Fetch all addresses for this user from Base44
4. For each address:
   a. Extract sensitive fields (defendant_name, legal_address, normalized_address, lat, lng, notes)
   b. Call saveAddress(id, route_id, sensitiveFields)
   c. Show progress bar
5. Set migrationCompleted = true in meta store
6. Show success: "X addresses moved to device. Cloud copies left intact — wipe them from Base44 when routes are complete."
```

**What to wipe from Base44 later (Joshua does this manually per route when done):**
Not built yet — just delete the route from Base44 or clear the sensitive fields via a future admin tool. No code needed now.

---

## Build Order (session plan)

### Session 1 — Infrastructure
1. Create `src/components/services/LocalDataService.js`
   - IndexedDB open/init
   - Key generation + persistence
   - `encryptAddress`, `decryptAddress`, `decryptAllAddresses`
   - `savePhoto`, `getPhoto`, `deletePhoto`
   - `exportBackup`, `importBackup`
2. Create `src/components/hooks/useLocalAddressStore.js`
3. Test in isolation: open the app, verify key generates, write a test record, decrypt it

### Session 2 — Reads (safest change, no data loss risk)
4. Add `useLocalAddressStore` to `WorkerRoutes.jsx` — merge on read
5. Add `useLocalAddressStore` to `WorkerRouteDetail.jsx` — merge on read
6. Verify merged addresses display correctly (data still comes from Base44, local store is empty — merge is transparent)

### Session 3 — Migration + Settings UI
7. Add migration runner to `useLocalAddressStore`
8. Add Data & Privacy section to `WorkerSettings.jsx`
9. Joshua runs migration on his device — verify all addresses appear correctly from local store
10. Verify export backup downloads a valid JSON file
11. Verify import backup restores correctly

### Session 4 — Writes
12. Split `Address.create` in `AddAddress.jsx`
13. Split `Address.create` in `AddressImport.jsx`
14. Split `Address.create` in `ScanRouteSetup.jsx`, `ScanAddToRoute.jsx`, `BulkRouteSetup.jsx`
15. Split `Address.update` in `EditAddress.jsx`
16. New addresses verified: Base44 has stub, local store has sensitive fields

### Session 5 — Photos
17. Replace `UploadFile` in `AddressCard.jsx` with `savePhoto` (3 locations: lines 267, 348, 414)
18. Add `resolvePhotoUrl` display helper for `local:` prefix detection
19. Verify photos taken on new serves display from IndexedDB
20. Verify legacy cloud URL photos still display (backward compat)

---

## Resuming This Work

**Say:** "pull up the spec for local data privacy" → read this file before touching any code.

**Current state when this spec was written:**
- Device-first caching is already done (`staleTime: Infinity`, `refetchOnMount: 'always'`, cache seeding) — that was a separate session
- The `LocalDataService` and `useLocalAddressStore` do not exist yet
- No address data has been migrated
- All photos are still uploading to Base44 cloud
- No Settings UI has been added
- Nothing in this spec has been built yet — start at Session 1

**Key architectural rules to maintain throughout:**
- `LocalDataService` is a plain JS module (not a React component) — it can be imported anywhere
- `useLocalAddressStore` is the only React-facing interface to `LocalDataService`
- Never call `LocalDataService` directly from page components — always go through the hook
- The merge pattern (Base44 stub + local sensitive data) must happen at the page level, not inside `LocalDataService`
- Follow all hard rules in `CLAUDE.md`: read files before editing, complete files only, `refetchQueries` not `invalidateQueries`, `company_id` on all new entities

---

*RouteToServe V2 — Local Data Privacy Spec | April 2026*

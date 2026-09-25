# Manager Area Dashboard Redesign

Date: 2026-09-25
Status: Draft for user review
Scope: Manager Account Area tab (web) only
Out of scope: BillCollector Android app (follow-up after this ships)

## Problem

Managers assign customers to areas from the Area tab, but each customer row only shows name and phone. Without username and address it is hard to tell customers apart when setting areas.

Area cards show this-month collection only. Managers cannot see month/year collection, expected amount, or how much of expected dues has actually been recovered.

The customer list inside an area has no sort and no multi-select, so bulk area assignment is one dropdown at a time.

## Goals

1. Show username and address next to customer name in the Area detail customer list.
2. Show collected amount for a chosen month, plus that year's total, on every area card.
3. Show expected amount (active customers' plan fees) and an animated circular recovery percentage.
4. Add sort and multi-select on the area customer list for bulk area assign.
5. Do not change backend APIs, database schema, Android, or other Manager tabs.

## Non-goals

- BillCollector / Android Area UI (explicit follow-up).
- New aggregation endpoints.
- Changing how areas are stored (`settings.areas` string list, `user.area` string).
- Changing Customer Directory, except it already consumes `settings.areas`.

## Current behavior (keep)

File: `components/AreaDashboard.tsx`
Wired from `App.tsx` when `activeTab === 'area'`.

Props stay:

- `users`, `receipts`, `settings`
- `onUpdateAreas(areas: string[])`
- `onAssignUserArea(userId: string, area: string)`

Keep:

- Add / remove area names (remove does not wipe customer `area` values).
- Assign a single customer to another area via dropdown.
- Active / expired / suspended counts.
- Pending = sum of plan price for expired, non-suspended, non-deleted customers in that area.
- Plan-price lookup: matching `settings.availablePlans`, else `settings.monthlyFee`.
- Active rule: not deleted/pending; `activatedMonths` includes current calendar month label, or `expiryDate >= today`.
- Existing dark/light styling and toast.

## Metrics (locked)

### Selected period

- Top of the main Area list: Month dropdown + Year dropdown.
- Default: current calendar month and year.
- All area cards and the overall header use this selected month/year.

### Collected (month)

Successful receipts (`status` is `Success` or `success`) whose `paidAt` (fallback `createdAt`) falls inside the selected calendar month, attributed to the receipt user's `area` (or `"No Area"`).

Sum `paidAmount`. If none: `Rs. 0`.

### Yearly total

Same as collected, but all successful receipts in the selected year (any month). Shown smaller on each card and in the overall header.

### Expected (month target)

Sum of plan price for **active customers only** in that area (deleted excluded). Suspended and expired customers are not in expected.

Expected does not change with the month picker; it is the current active-customer fee base. The picker only filters collected / yearly totals / recovery collected side.

### Pending

Unchanged: expired, not suspended, not deleted, plan-price sum.

### Recovery percentage

```
if collected == 0 and pending == 0 -> 0%
if pending == 0 and collected > 0 -> 100%
else -> round(collected / (collected + pending) * 100)
```

This is recovery of dues, not "active customers / total customers".

Ring color: single indigo-to-emerald stroke matching the existing progress bar. No red/amber/green bands.

## UI — main Area list

Header (unchanged title/subtitle) plus:

- Month select (January–December)
- Year select: current year minus 2 through current year, plus any extra years that appear on receipts outside that range (sorted ascending)

Overall totals strip:

- Selected-month collected
- Selected-year total collected
- Pending recovery (current, not month-filtered)
- Total active / total expired (unchanged)

Each area card:

- Area name, customer count
- Collected for selected month (primary amount)
- Yearly total (secondary, smaller)
- Expected (active fees)
- Pending (if > 0)
- Animated circular recovery % (SVG ring, number in the center, stroke-dashoffset transition)
- Active / expired / suspended counts
- Click still opens area detail

Search and sort of area cards stay: by total customers, by (selected-month) revenue, by expired count.

## UI — Area detail customer list

Each row:

- Checkbox (when bulk mode / always visible for multi-select)
- Name (bold)
- Username
- Address (truncate, full title/tooltip)
- Phone • plan (existing)
- Status badge (existing)
- Area dropdown (existing single assign)

Toolbar above the list:

- Sort: Name, Username, Address, Status, Plan (toggle asc/desc)
- Select all / clear
- When `N > 0` selected: sticky bar with count, area dropdown, Apply
- Apply calls `onAssignUserArea` once per selected id (existing callback, no new API)
- Then clear selection and toast how many were moved

Empty month/area: existing empty copy; amounts `Rs. 0`, ring `0%`. No crash.

## Architecture

Single-file enhancement of `components/AreaDashboard.tsx`.

No `App.tsx` prop changes unless a type-only local interface update is needed (none expected).

Optional: extract pure helpers in the same file (or `utils/areaDashboardStats.ts` if tests need a module) for:

- `isReceiptInMonth(receipt, year, monthIndex)`
- `recoveryPercent(collected, pending)`
- `planPrice(user, settings)`

Do not split into AreaList / AreaDetail / RecoveryRing files in this change.

## Data flow

```
users + receipts + settings
        -> month/year state
        -> per-area stats (counts, expected, pending, month collected, year collected, recovery %)
        -> area cards
        -> selected area users (sort + multi-select) -> onAssignUserArea
```

Client-side only. Receipts already loaded for the manager.

## Error handling

- Missing `paidAt`/`createdAt`: skip that receipt for period filters.
- Unknown plan: expected/pending use `monthlyFee` or 0.
- Divide-by-zero: recovery formula above.
- Bulk apply with empty area name: allowed (same as single dropdown "No Area").

## Testing

Add focused tests for:

1. `recoveryPercent(0, 0) === 0`
2. `recoveryPercent(100, 0) === 100`
3. `recoveryPercent(40000, 10000) === 80`
4. Month filter includes a receipt on the 1st and last day of the selected month, excludes other months.
5. Expected sums only active customers' plan fees (expired/suspended/deleted excluded).

If the repo test runner already covers components, prefer a small util module so tests do not mount the full dashboard.

## Implementation notes

- Preserve add/remove area and single-assign dropdown.
- Do not rewrite `handleFullUpdateUser` in `App.tsx`.
- No emoji in new UI strings if avoiding new ones; existing location pin copy may remain.
- `allowedHosts` / reverse proxy: unchanged; this is not a new web server.
- Android BillCollector implementation is a separate spec after this PR merges.

## Success criteria

- Manager can identify a customer by name + username + address while assigning area.
- Manager can pick month and year and see collected, yearly total, expected, pending, and recovery % per area.
- Manager can sort the area's customer list and bulk-assign an area.
- Existing area CRUD and single assign still work.
- No Android changes in this PR.

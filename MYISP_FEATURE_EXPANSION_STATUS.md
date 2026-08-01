# MYISP Feature Expansion — Status Tracker
**Source spec:** `MYISP_FEATURE_EXPANSION_SPEC.md` (uploaded by Mahad, Aug 1 2026)
**Purpose:** Resume point for a new chat. Read this file first — don't re-ask what's done.

---

## ✅ Feature A — Granular Access Rights Matrix + Area Lock
**Status: PARTIALLY DONE — client-side complete, server-side WABot enforcement MISSING**

Done (found already in repo, built in an earlier session not covered by this tracker):
- `types.ts` — `AccessRights`, `ModuleKey`, `MODULE_LABELS`
- `utils/accessControl.ts` — `ALL_MODULE_KEYS`, `canAccess()`, `getDefaultAccessRights()`
- `components/SubManager/EditGranularRights.tsx` — rights editor modal exists
- `Layout.tsx` — nav filtered by `subManagerAccessRights[tab.id]?.view`

**NOT done — this was the critical part per spec ("fixes the WABot problem"):**
- ❌ No `check_agent_permission(manager_id, sub_manager_id, module, action)` Supabase RPC exists (verified via GitHub code search — zero results)
- ❌ WABot webhook (`api/webhook.ts`) does NOT call any permission check before answering billing/customer queries
- **Risk still open:** a WABot session tied to a sub-manager can still theoretically fetch/message data outside its scope server-side, since only the UI hides buttons — nothing blocks it at the data layer.

**Next step if resumed:** Add the RPC (Supabase migration) + wire it into `api/webhook.ts` before any customer/billing lookup.

---

## ✅ Feature E — Business-Branded OTP Email
**Status: CONFIRMED PATH A — no code needed, dashboard-only**

- Checked `Login.tsx`: password reset uses `supabase.auth.resetPasswordForEmail()` + `verifyOtp()` → this is Supabase Auth's built-in email (Path A in spec), NOT a custom OTP flow.
- Per spec, Path A requires **zero app code** — only a manual one-time step:
  `Supabase Dashboard → Authentication → Email Templates → SMTP Settings → Enable Custom SMTP → set business email as sender`
- **Unconfirmed:** whether Mahad has actually done this dashboard step yet. If not done, OTP emails still arrive from Supabase's default domain (not unprofessional-breaking, just not branded).

---

## ✅ Feature B — 3-Way Transaction Ledger (Recovery / Vendor / ISP Payment)
**Status: DONE — built and deployed this session (Aug 1 2026), Vercel production READY**

Files touched (all pushed, all commits deployed successfully):
1. `types.ts` — `Transaction` interface, `AppState.transactions[]`, `ModuleKey` +`'transactions'`, `MODULE_LABELS` entry
2. `utils/accessControl.ts` — `'transactions'` added to `ALL_MODULE_KEYS`
3. `utils/profitCalc.ts` — **NEW FILE** — `calcProfitSummary()`, `sumTransactionsByType()`, `calcMonthlyExpenses()`
4. `components/RecordTransaction.tsx` — **NEW FILE** — 3-tab modal (Recovery / Vendor Payment / ISP Payment)
5. `components/TransactionLedger.tsx` — **NEW FILE** — tab component: summary cards, monthly filter, transaction list, delete, triggers `RecordTransaction`
6. `components/Dashboard.tsx` — 4 new stat cards (Cash Recovered, Vendor Payments, ISP Payments, Profit Ratio)
7. `components/Layout.tsx` — "Transaction Ledger" nav sub-item under the Expenses group
8. `components/Insights.tsx` — new "Profit & Loss Summary" section with month selector
9. `App.tsx` — state init (`transactions: loaded.transactions || []`), `onAdd`/`onDelete` handlers (dual-save), tab wiring, props passed to Dashboard + Insights

**Deliberate deviation from spec (documented, not hidden):**
- Spec's `Transaction.vendorId` / `ispProviderId` were meant as FK-style refs, but no Vendor/ISPProvider registry exists anywhere in the codebase. Implemented as **free-text name fields** for now (field names kept as `vendorId`/`ispProviderId` for forward compatibility if a registry gets built later, e.g. as part of Feature D).
- Entry point: spec said "New Transaction from Payment/Receipt tab" — instead built as its own self-contained tab (`TransactionLedger.tsx`), matching the existing `BusinessExpenses.tsx` pattern (each financial module owns its own add-button + list), rather than modifying the already-huge `ReceiptGenerator.tsx`. This also gives an actual ledger view/delete UI, which the spec's minimal migration steps didn't explicitly include but is needed for the feature to be usable.
- No dedicated Vendor/ISP Provider management screens were built — out of spec's explicit scope.

---

## ⏳ Feature D — Dealer / Reseller Billing Module
**Status: NOT STARTED — Phase 4 in build order, depends on Feature B (done)**

Per spec, needs:
1. New interfaces: `DealerCategory`, `DealerRecord`, `DealerBill` + arrays in `AppState`
2. Master Setup → "Dealer Categories" page (reuse Package list pattern)
3. New "Dealers" tab — list + Register Dealer modal (reuse Customer Dashboard pattern)
4. Extend `Transaction.type` to add `'dealerPayment'` + `dealerId?: string` field (touches `types.ts` + `RecordTransaction.tsx` + `TransactionLedger.tsx` + `profitCalc.ts` from Feature B)
5. Reuse/extend bulk billing engine to auto-generate monthly `DealerBill` records on `billingDayOfMonth`
6. New "Dealer Revenue" dashboard stat card, separate from retail "Cash Recovered"; profit view splits Retail vs Dealer revenue

---

## ⏳ Feature C — Subscription Self-Service Portal
**Status: NOT STARTED — Phase 5 (last), largest surface area**

Verified via GitHub code search: `SubscriptionPortal.tsx` does not exist, `pending_extension` column doesn't exist on `manager_subscriptions`. (Spec's note that a "Subscription Portal" tab "already exists in nav per earlier screenshots" could not be confirmed — check with Mahad if some earlier version exists before rebuilding from scratch.)

Per spec, needs:
1. `ALTER TABLE manager_subscriptions ADD COLUMN pending_extension JSONB` (Supabase migration)
2. New Supabase Storage bucket `subscription-receipts` (private, signed-URL, owner-write/admin-read RLS)
3. Build/extend `SubscriptionPortal.tsx` — plan tier cards, duration selector with discount tiers (`{1M:0, 3M:5%, 6M:10%, 1Y:15%}`), TRX ID + receipt upload, submit → `pending_extension`
4. `AdminDashboard.tsx` — new "Pending Renewals" queue, Approve/Reject
5. New RPC `approve_subscription_extension(manager_id)` — extends `expires_at`, sets plan, clears `pending_extension`

---

## Resume Instructions for New Chat
1. This file lives at repo root: `MYISP_FEATURE_EXPANSION_STATUS.md` — Claude should fetch it fresh from GitHub before starting.
2. Say which feature/phase to start (e.g. "Feature D shuru karo" or "pehle Feature A ka WABot RPC part complete karo").
3. Suggested order per original spec: **Feature A's missing RPC piece** (security gap, quick) → **Feature D** → **Feature C**.
4. All Critical Care Rules from Custom Instructions still apply — fresh SHA before every push, full file list before multi-file work, syntax check before push.

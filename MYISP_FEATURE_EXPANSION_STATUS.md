# MYISP Feature Expansion — Status Tracker
**Source spec:** `MYISP_FEATURE_EXPANSION_SPEC.md` (uploaded by Mahad, Aug 1 2026)
**Purpose:** Resume point for a new chat. Read this file first — don't re-ask what's done.

---

## ✅ Feature A — Granular Access Rights Matrix + Area Lock
**Status: DONE — server-side WABot enforcement now in place (Aug 1 2026 session)**

Done (found already in repo, built in an earlier session not covered by this tracker):
- `types.ts` — `AccessRights`, `ModuleKey`, `MODULE_LABELS`
- `utils/accessControl.ts` — `ALL_MODULE_KEYS`, `canAccess()`, `getDefaultAccessRights()`
- `components/SubManager/EditGranularRights.tsx` — rights editor modal exists
- `Layout.tsx` — nav filtered by `subManagerAccessRights[tab.id]?.view`

**Investigated this session — corrected understanding vs. old spec text:**
- `check_agent_permission(p_manager_id, p_agent_username, p_module, p_action)` Supabase RPC **already existed** in the DB (built in a prior session, just never wired anywhere — the earlier "zero GitHub code search results" check only looked at repo code, not live DB functions).
- `api/webhook.ts` was the WRONG wiring target: it's the single-tenant customer-facing AI reply endpoint (`BOUND_MANAGER_ID='mahadnet'`), never carries sub-manager identity, and `userRole==='sub-manager'` in `App.tsx` never even reaches `WABotInbox.tsx` in the web app (separate restricted render branch — receipts + `SubManagerDashboard` only).
- **Real exposure was the `get_conversation_summaries` RPC** (SECURITY DEFINER) — used by BOTH the PWA (`WABotInbox.tsx`) and the Android app (`Wabot-Android`) for the conversation list. It correctly checked "does this sub-manager belong to this manager" but had ZERO module-level check, so any sub-manager account (once given Android login via `sub_managers.auth_user_id`) would get full conversation access regardless of `accessRights.wabot`.
- Confirmed low current live risk: `sub_managers` table currently has 1 row (`mahad`/`mahadnet`) with `auth_user_id = NULL` — no sub-manager has actually completed Android/Supabase-Auth login yet — but the hole was live-armed for whenever that happens.
- Direct-table access (`whatsapp_messages` etc.) is separately safe: RLS policy `manager_own_whatsapp_messages` requires `manager_id = profiles.username for auth.uid()`, which a sub-manager's own profile never satisfies — only the RPC bypassed this via SECURITY DEFINER.

**Fix applied (migration `gate_conversation_summaries_by_agent_permission`):**
- `get_conversation_summaries` now branches: manager-owner/admin path unchanged (unrestricted); sub-manager path resolves `username` from `sub_managers.auth_user_id = auth.uid()`, then calls `check_agent_permission(manager_id, username, 'wabot', 'view')` and raises/denies if false. Undefined `accessRights` (legacy agents) still defaults to unrestricted — no behavior change for existing agents.

**Deliberately left out of this pass (flag if you want it next):**
- `get_manager_state_snapshot` — loads the *entire* AppState blob (users, receipts, settings, wabot config, everything), not just WABot data, so a single 'wabot' gate doesn't fit it; would need its own scoping design, not a quick fix.
- `api/wabot-send.ts` — has **no auth/identity check at all** (accepts any `managerId` in the request body, no JWT verification). Bigger issue than Feature A's original scope (missing auth entirely, not just missing module-check on top of existing auth). Worth a dedicated follow-up.

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

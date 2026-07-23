# Bill Collector — Android App Build Plan (Manager Login & Account Audit)
*Audited from live `Isp-Billing` main branch, July 23 2026. Read this before starting ANY screen of the new Android app — don't re-discover this from scratch.*

## 0. Goal
Mahad wants a **native Android app** (same idea as `Wabot-Android`) that mirrors the manager-side experience of `billcollector.online` exactly — currently only installed as a Chrome PWA, which he finds low-quality ("thoda maza nahi karwati"). This doc is Phase 0: a full audit of the Login page + manager-account system (the foundation every other screen depends on), done BEFORE writing any React Native code, so the build can proceed screen-by-screen with minimal bugs.

**New repo (not created yet):** suggest `mahadahmad82-source/Billcollector-Android`, package `com.mahadnet.billcollector`, Expo SDK 51 (match Wabot-Android for shared tooling/EAS familiarity).

---

## 1. Key Findings — Corrections to Prior Assumptions
Cross-checked against live code; two prior memory notes are **stale/inaccurate** and must not be carried into the Android build:

1. **No biometric lock screen exists in the live app.** Memory referenced a "BiometricLockScreen.tsx" / WebAuthn enrollment in Settings — grepped `App.tsx`, `Settings.tsx`, `ProfileDialog.tsx`, `Layout.tsx`, and the full repo tree: zero matches for `biometric`/`webauthn`/`fingerprint`. Either it was reverted or never merged. **Do not port a feature that doesn't exist** — if Mahad wants fingerprint unlock, it needs to be scoped as new work (Android has native biometric APIs via `expo-local-authentication`, which would actually be a nicer fit than the web WebAuthn version anyway).
2. **`EmployeePanel.tsx` + `EmployeeSessionLoader.tsx` are dead code.** Not imported anywhere in `App.tsx` or any live entry point — confirmed via repo-wide search. This looks like a legacy prototype for agent logins that was superseded by the current `SubManagerAccount` / `find_sub_manager_login` RPC system (§3, §5). **Skip entirely** — do not port this to Android.
3. Minor: `App.tsx` passes `theme` / `onToggleTheme` props to `<Login>` (line ~1280) but `LoginProps` interface only declares `onLogin` / `onBack`. Harmless (extra props ignored), but a sign the web Login component's dark/light theming is hardcoded to dark rather than reactive — Android version should just build one dark theme matching the current visual design, no need to wire a toggle unless requested.

---

## 2. Login System — Full State Machine (`components/Login.tsx`, 602 lines)

Single component, `view` state drives everything: `'recent' | 'login' | 'signup' | 'forgot' | 'forgot-otp' | 'forgot-newpass'`. (`'otp'` and `'agentLogin'` exist in the `ViewType` union but are **never rendered** — dead states, ignore.)

### 2.1 `recent` — Saved Accounts Picker (first screen if any accounts saved locally)
- Lists all `ManagerAccount` entries from local storage, avatar = first letter of business name, tap → prefills login form (auto-fills password too if `rememberPassword` was true).
- Per-row delete (✕ on hover/press) → `removeAccount(username)`.
- "Clear All" → confirm modal → `clearAllAccounts()`, drops to `signup` view.
- "+ Register Node" → signup, "Manual Login" → blank login form.
- If zero saved accounts, this view is skipped entirely and `login` is shown first.

### 2.2 `login` — Main Login Form
Fields: Login ID (email/phone/username, lowercased+trimmed), Password, Remember Me checkbox, Forgot Password link.

**`doLogin(username, password)` — the core auth waterfall, in priority order:**
1. **Local admin shortcut**: if a locally-saved account matches with `role === 'admin'`, log in instantly (no network wait) — but *also* fire `supabase.auth.signInWithPassword` in the background (fire-and-forget) because admin RPCs (delete/reset manager) require a real `auth.uid()` session server-side. If that background call fails, the local session still proceeds (admin isn't blocked).
2. **Normal Supabase Auth**: try `signInWithPassword({ email: identifier.includes('@') ? identifier : identifier+'@myisp.local', password })`.
3. **Real-email fallback**: if that fails and identifier has no `@`, call RPC `resolve_login_email(p_identifier)` — handles managers who signed up with a synthetic `@myisp.local` email initially but later have a real recovery email on file — retry sign-in with the resolved email.
4. **Local→Supabase migration fallback**: if still failing AND a matching local account exists (pre-Supabase-Auth legacy account), attempt `signUp` + `signInWithPassword` to migrate them live; on success, `removeAccount()` the old local-only entry. If migration itself fails, fall back to trusting the local session anyway (never lock out a legitimate local user).
5. **Sub-manager (agent) lookup**: if no local account matched at all, call RPC `find_sub_manager_login(p_identifier, p_password)` — a scoped server-side lookup (does NOT pull every manager's full customer/password data to the browser, unlike an older insecure approach). On match, save a local `ManagerAccount` with `role:'sub-manager'`, `managerUsername: match.manager_id`.
6. Else → `throw new Error('Invalid username or password.')`.
7. On any successful Supabase Auth path: backfill `profiles.username` if null (required for RLS scoping), fetch `profiles.role/manager_id/full_name`, `setActiveSession(username)`, optionally `saveAccount()` if Remember Me checked, call `onLogin(username)`.

### 2.3 `signup` — New Manager Registration
Fields: Business Name, Phone (used as the username), Email (optional — enables OTP password recovery later), Password, Confirm Password.
- Validation: password ≥4 chars, password===confirm, phone not already taken (checked against `ADMIN_USERNAME='admin'` and local accounts list), email if provided must contain `@` and not end in `@myisp.local`.
- Auth email = real email if given, else synthetic `{phone}@myisp.local`.
- `supabase.auth.signUp` → `signInWithPassword` → backfill `profiles.username`/`full_name` → `saveAccount()` locally → `writeLog({action:'SIGNUP'})` → `onLogin(phone)`.

### 2.4 Forgot Password — 3-Step OTP Flow
1. **`forgot`**: enter username or email. If username given, resolve via RPC `resolve_login_email`. If resolved email is empty or is a synthetic `@myisp.local` address (no real recovery email on file), **show a "Support Modal"** instead of proceeding — offers a direct WhatsApp deep link (`wa.me/923042773453`) to MahadNet support for manual reset, since there's no email to send an OTP to. Otherwise: `supabase.auth.resetPasswordForEmail(email)` → advance to next step.
2. **`forgot-otp`**: 6-digit code input → `supabase.auth.verifyOtp({ email, token, type:'recovery' })`.
3. **`forgot-newpass`**: new password + confirm → `supabase.auth.updateUser({ password })` → success message → auto-return to login after 2s.

### 2.5 Cross-cutting UI details worth matching
- Loading state disables the submit button and shows a shimmering progress bar + dynamic loading text ("Authorising...", "Initialising New Node...", "Searching Remote Nodes...", "Sending OTP...", etc).
- Errors auto-dismiss after 4s (`showError` sets a timeout).
- Language toggle (English/Urdu) top-right, persisted via `utils/i18n.ts` `getStoredLanguage`/`setStoredLanguage`.
- Footer: "Local node data remains strictly on this device" + Terms & Policies link + version tag.
- Support modal and "Purge All Data" confirm modal are both full-screen centered dialogs, not inline.

---

## 3. Session Bootstrap & Role Routing (`App.tsx`)

### 3.1 State & role derivation
- `activeManager` = `getActiveSession()` from local storage on boot (persists across app restarts — equivalent to "remember me at the OS level", separate from the Login form's own Remember Me checkbox which remembers *credentials*, not just session).
- On every `[activeManager, activeTab]` change: re-derive `isAdmin` (`activeManager === 'admin'`) and `userRole` (`'admin' | 'manager' | 'sub-manager'`) by looking up the local account's `.role` field, or inferring `sub-manager` if `activeManager` starts with `agent_`.
- Admin auto-redirects to `admin-overview` tab if landing anywhere else.

### 3.2 Data loading — `smartLoadAndSync`
On login, `dataOwner` = the manager's own username, UNLESS the logged-in account is a sub-manager (`role==='sub-manager'`), in which case `dataOwner = account.managerUsername` (agents read/write into their manager's data blob, not their own). Then:
```
localState = loadState(activeManager)
smartLoadAndSync(dataOwner, localState) → finalState   // compares local vs Supabase, richer one wins
setState({ ...finalState, ...various array-default-fallbacks })
```

### 3.3 Sub-manager safety check (runs every session start)
RPC `check_sub_manager_exists(p_username)` — if the manager deleted this agent server-side, force-logout immediately even though a valid local session/cache still exists (`setActiveSession(null)`, `removeAccount()`, `setActiveManager(null)`). **This must be ported** — otherwise a fired agent keeps using a "logged in" Android app indefinitely.

### 3.4 Auto-logout on inactivity
`INACTIVITY_LIMIT = 30 minutes`. A `lastActivityRef` is bumped on mousemove/keydown/touchstart/click; a 60s interval checks elapsed time and force-logs-out if exceeded. **Android equivalent**: track touch/gesture events app-wide (or just app-foreground time), same 30-min threshold.

### 3.5 OAuth (Google/Facebook) listener
`supabase.auth.onAuthStateChange` — if a `SIGNED_IN` event fires for a non-email provider while `activeManager` is still null, derive a username from the email local-part, auto-create/find the local account, backfill `profiles.username`, and log them in. **Low priority for Android v1** unless Mahad specifically wants social login on mobile — flag as a decision point, don't build speculatively.

### 3.6 Logout
`handleLogout`: clear session key, clear `sessionStorage`, reset state, then `window.location.href = '/'` after 100ms. Android equivalent: reset navigation stack to the Login screen (no literal page reload needed/possible).

### 3.7 Post-login routing — three distinct branches
1. **No `activeManager`** → Login/Landing/Terms routes (public).
2. **`userRole === 'sub-manager'`** → a *restricted* shell, NOT the full manager dashboard. Only two states observed: a `'team'` tab (their home — presumably `SubManagerDashboard`-style agent view, not yet deep-audited, see §6 open item) and a `'receipts'` tab that renders a stripped-down `ReceiptGenerator` titled "New Invoice / Agent Terminal Node" with `hideHistory=true` and `defaultCollectedBy` pinned to their own agent id. **This confirms agents get a deliberately narrow, task-focused UI — do not give them the full manager tab bar in the Android app.**
3. **Manager or Admin** → full `Layout` shell with the complete tab set (§6).

---

## 4. Manager Account Data Model (`types.ts`)

```ts
interface ManagerAccount {          // what Login.tsx reads/writes locally
  username: string; password: string; businessName: string;
  email: string; phone: string;
  role?: 'admin' | 'manager' | 'sub-manager';
  managerUsername?: string;         // set only for sub-manager accounts
  createdAt: string; rememberPassword?: boolean;
}

interface SubManagerAccount {       // the actual "agent" record inside manager_data JSONB
  id: string; username: string; name: string; managerUsername: string;
  dutyStatus: 'online' | 'offline'; lastCheckIn?: string; lastCheckOut?: string;
  lastLocation?: { lat: number; lng: number; timestamp: string };
  area?: string; isLeave?: boolean;
  baseSalary?: number; commissionPercent?: number; complaintCommission?: number;
  salaryPayments?: SalaryPayment[];
}
```
Note the split: `ManagerAccount` = local device credential cache (per-device, in `localStorage`). `SubManagerAccount` = the canonical server-side record living inside `manager_data.data.subManagers[]` (per non-negotiable rule §2 of PROJECT_KNOWLEDGE.md — never a separate table).

### Local storage keys (`utils/storage.ts`) — map these to `AsyncStorage`/`expo-secure-store` in the Android app:
| Key | Purpose |
|---|---|
| `mahadnet_accounts` | JSON array of all `ManagerAccount` saved on this device |
| `mahadnet_active_session` | current logged-in username (survives restart) |
| `mahadnet_data_{username}` | full `AppState` JSONB blob, localStorage mirror of `manager_data` row |

Recommend: credentials (password field inside saved accounts) → `expo-secure-store` (encrypted), not plain `AsyncStorage`, since the web version's plaintext-in-localStorage approach is already a known weak spot — Android gives us an easy upgrade here for free.

---

## 5. Subscription / Feature Gating (`hooks/useSubscription.ts`)
Tiers: `trial | starter | business | pro | suspended`. Reads `manager_subscriptions` table (`status`, `plan`, `trial_ends_at`, `customer_limit`, `agent_limit`). No row found → auto-assign 30-day trial. `admin` account is hardcoded to unlimited `pro`. `TIER_FEATURES` gates: equipment, leads, area, suspension, outage, analytics, reports, aging, expenses, team, systemlogs — each a plain boolean per tier, plus `customerLimit`/`agentLimit` caps. **Android app must replicate this gating** (via `canAccess(sub, feature)` logic) so a `starter`-tier manager doesn't see tabs they haven't paid for — same as web.

---

## 6. Full Manager Feature/Tab Inventory (for phased build scoping)
From `Layout.tsx` nav config — build these as native screens roughly in this order (core → nice-to-have):

**Core (Phase 1 after auth):** Dashboard, Customers (`users`), Receipts, Recoveries, Expiries, AI Insights (`reports`), Sys Logs (`systemlogs`), Settings.

**Extended (Phase 2, subscription-gated):** Team Hub (`team`), Expenses, Analytics, Outage, Area, Equipment, Leads, Reminders, Message Templates, WABot (likely just deep-links to the already-existing Wabot-Android app rather than reimplementing).

**Admin-only (Phase 3, only if `admin` account needed on mobile):** Overview, Managers, All Customers, Activity, System, Subscriptions.

**Not yet audited — do before building:** `components/SubManager/*` (8 files: `SubManagerDashboard`, `SubManagerManagement`, `AgentAttendance`, `AgentPerformanceReport`, `ActivityLogs`, `LiveTracking`, `LocationTracker`, `RecruitAgentModal`) — this is the agent-facing `'team'` tab referenced in §3.7 and is likely the single most-used screen if Mahad's field agents end up using this Android app too. Recommend this be the subject of the *next* audit pass before Phase 1 build starts, since agents may be a primary user group for a "feels native" app (they're the ones out in the field on phones, not managers at a desk).

---

## 7. Precedent to Reuse from `Wabot-Android`
That repo already solved the exact same problem (real Supabase Auth session in a React Native/Expo app talking to the same Supabase project):
- `src/context/AuthContext.tsx` — real `supabase.auth.signInWithPassword` session, required because RLS policies like `manager_own_whatsapp_config`/`manager_own_data_full_access` only grant the `authenticated` Postgres role, not `anon`. **Copy this pattern directly** rather than reinventing.
- Same Supabase project (`mzmajmjzopmkzboizrbm`), same anon key — no new Supabase setup needed.
- Same EAS Cloud build pipeline via GitHub Actions (`workflow_dispatch`, `secrets.EXPO_TOKEN` already provisioned org-wide) — reuse the same `.github/workflows/eas-build.yml` shape in the new repo.
- Phone number normalization convention (bare 10-digit, no `+92`) — irrelevant to login itself but keep consistent once Receipts/Customers screens are built.

---

## 8. Decisions — LOCKED (confirmed by Mahad, July 23 2026)
1. **Scope**: ✅ **Manager + Agents dono.** Both roles ship in this app — §3.7's restricted agent shell and full `SubManagerDashboard` (§10) are now in-scope for the build, not deferred.
2. **Biometric unlock**: ✅ **Skip for v1.** Revisit later as new functionality if requested — not a port of anything existing.
3. **Admin panel**: ✅ **Required.** `admin` login + the 6 `admin-*` tabs (§6) must work on mobile too.
4. **Social login (Google/Facebook)**: not asked — default to **defer** (§3.5) since it's a small user segment and adds OAuth redirect complexity that's awkward in a WebView-less native flow. Revisit if Mahad asks.

---

## 10. Agent Side — SubManager System Audit (`components/SubManager/*`, now in-scope)

### 10.1 Two completely different components share the "Team Hub" name — don't confuse them
- **`SubManagerManagement.tsx`** (710 lines) — the **manager's** view of their agents: recruit new agent, attendance overview, live map, performance reports, activity log, complaint assignment. Rendered only when `activeTab === 'team' && userRole !== 'sub-manager'` (App.tsx line ~1774). Lazy-loads `LiveTracking` and `ComplaintManager` internally (`React.lazy` + `Suspense`) so a map/complaint bug can't crash the whole tab.
- **`SubManagerDashboard.tsx`** (988 lines) — the **agent's own** home screen. Rendered for literally *any* tab value except `'receipts'` when `userRole === 'sub-manager'` (App.tsx ~line 1346) — i.e. this single component IS the agent's whole app, not just one tab among several. Handles: duty check-in/out (via `LocationTracker`), issuing invoices (hands off to the stripped `ReceiptGenerator`, §3.7), viewing past receipts, resolving assigned complaint tickets.

**Practical implication for Android**: the agent experience is really just two screens (`SubManagerDashboard` + the receipts/invoice screen), not the full manager tab bar. Build this as its own lightweight navigator, separate from the manager's tab-bar shell.

### 10.2 Agent recruitment & credential flow — how an agent's login actually gets created
Traced end-to-end via `RecruitAgentModal.tsx` → `SubManagerManagement`'s `onAgentRecruited` prop → `App.tsx` handler (~line 1782):
1. `RecruitAgentModal` form (name/username/phone/email/password/area/salary) — despite importing `supabase`, it makes **zero actual Supabase calls**; it's a client-side-only form that does a fake `setTimeout` then calls `onSuccess(formData)`. All real persistence happens one level up.
2. `App.tsx`'s `onAgentRecruited` handler: `saveAccount()`s a `ManagerAccount{role:'sub-manager', managerUsername}` into the **recruiting manager's own local device** storage (so the manager could theoretically test-login as the agent from their own browser), AND pushes a new entry into `state.subManagers[]` → dual-saved to `manager_data` via the normal save pattern.
3. **Confirmed via live DB function inspection** (`find_sub_manager_login` source, pulled directly from Supabase): the `subManagers[]` JSONB array element **does store a plaintext `password` field** server-side, even though `types.ts`'s `SubManagerAccount` interface doesn't declare it (the recruitment payload is passed through as loosely-typed `any`, so the extra field silently persists). This is what makes the RPC work from *any* device — `find_sub_manager_login(identifier, password)` does a `SECURITY DEFINER` scan across every manager's `manager_data.subManagers[]` JSONB for a matching username/email/phone **and** matching plaintext password, returning the match with `password` stripped out of the response.
4. **Security note** (worth flagging to Mahad, not blocking for the Android build): agent passwords are stored in plaintext inside the JSONB blob, same weak spot as `ManagerAccount` in localStorage. Not this doc's job to fix, but don't make it worse — e.g. don't log these payloads anywhere in the new app.

### 10.3 Native-porting gotchas found in this folder
- **`LiveTracking.tsx`** dynamically loads **Leaflet** (`window.L`, injected `<link>`/`<script>` tags) — this is a browser-only approach and **will not work in React Native**. Needs a full rebuild using `react-native-maps` (or `expo-maps`) for the agent-location map in the manager's Team Hub screen.
- **`LocationTracker.tsx`** uses `navigator.geolocation.getCurrentPosition`/`watchPosition` — maps cleanly to `expo-location`'s equivalent APIs, no architecture change needed, just an API swap.
- **`AgentPerformanceReport.tsx`** uses `recharts` + `lucide-react` (both web-only React libs) — charts need a React Native charting lib (e.g. `react-native-svg`-based charts, or reuse patterns already proven in `Wabot-Android` if it has any chart screens) and icons need `lucide-react-native` instead.
- `SubManagerManagement.tsx`'s `React.lazy`/`Suspense` pattern doesn't apply the same way in React Native (no code-splitting the same way) — just use plain imports; RN bundle size isn't chunked per-route like a web SPA.

---

## 11. Next Step
Create `Billcollector-Android` repo (Expo SDK 51 init, mirroring `Wabot-Android`'s `package.json`/`app.json`/`eas.json` shape), port `AuthContext.tsx` pattern, then build screens in this order:
1. `LoginScreen.tsx` — §2's states one-by-one, starting with plain `login` + `signup` (defer forgot-password OTP + support-modal edge case + admin's background-reauth shortcut until the base flow works end-to-end).
2. Role-based navigator split at the root: admin shell (6 `admin-*` screens) / manager shell (tab bar, §6 core tabs first) / agent shell (`SubManagerDashboard` + receipts, §10.1) — mirrors App.tsx's three-way branch (§3.7) exactly so there's no ambiguity about which screens a given login lands on.
3. Manager's Team Hub (`SubManagerManagement` port) can come later in Phase 2 — it's the most complex single screen here (map + charts + lazy sub-sections) and isn't needed for a manager to do their core daily job (dashboard/customers/receipts/recoveries).

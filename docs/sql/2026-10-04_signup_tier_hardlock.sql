-- 2026-10-04 — Signup tier hard-lock backend (handoff doc: Claude_backend_handoff, W4/W5/A1–A4)
-- Already applied to the live Supabase project (mzmajmjzopmkzboizrbm) as migration
-- `signup_tier_hardlock`. Kept here for history / re-creation.
--
-- Policy (decided by Mahad, 2026-10-03): HARD LOCK, trial system discontinued.
--   free tier  -> status 'active' immediately
--   paid tier  -> status 'pending_payment' until an admin approves
--   pending_payment is enforced server-side at FREE limits.
-- Existing rows (incl. legacy status='trial') are NOT rewritten by this migration.

-- ── Shared tier caps (single source of truth for the DB) ────────────────────
-- Mirrors DEFAULT_ISP_PLANS (utils/pricing.ts): 50 / 150 / 250 / 500 / 1000 / unlimited.
-- 'pro' is the legacy name of Enterprise. Unknown plan => free (hard lock). NULL = unlimited.
create or replace function public.tier_customer_cap(p_plan text)
returns int language sql immutable set search_path = public as $$
  select case lower(coalesce(p_plan, 'free'))
    when 'free' then 50 when 'starter' then 150 when 'growth' then 250
    when 'business' then 500 when 'enterprise' then 1000 when 'pro' then 1000
    when 'custom' then null
    else 50 end;
$$;

-- Sub-manager (agent) caps are unchanged from the previous trigger.
create or replace function public.tier_submanager_cap(p_plan text)
returns int language sql immutable set search_path = public as $$
  select case lower(coalesce(p_plan, 'free'))
    when 'free' then 0 when 'starter' then 1 when 'growth' then 2
    when 'business' then 3 when 'enterprise' then 5 when 'pro' then 5
    when 'custom' then null
    else 0 end;
$$;

-- ── W4: select_signup_tier ──────────────────────────────────────────────────
-- Returns BOTH { ok, success } so the frontend contract ({ok:false}) and the
-- repo-wide RPC convention ({success:false}) are both satisfied.
-- Only callable while the caller's subscription is still in its signup phase
-- (no row / pending_payment / free+active / legacy trial). An admin-approved
-- paid plan, or a locked/expired account, can NOT be changed through this RPC
-- (previously a locked manager could un-lock themselves with select_signup_tier('free')).
create or replace function public.select_signup_tier(p_tier text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_username text;
  v_tier text := lower(btrim(coalesce(p_tier, '')));
  v_status text;
  v_cur record;
begin
  select username into v_username from public.profiles
   where id = auth.uid() and role = 'manager' and coalesce(is_active, true);
  if v_username is null then
    return jsonb_build_object('ok', false, 'success', false, 'error', 'Not logged in');
  end if;
  if v_tier not in ('free','starter','growth','business','enterprise','custom') then
    return jsonb_build_object('ok', false, 'success', false, 'error', 'Invalid tier');
  end if;
  v_status := case when v_tier = 'free' then 'active' else 'pending_payment' end;

  select status, plan, plan_activated_at into v_cur
    from public.manager_subscriptions where manager_id = v_username for update;
  if found and not (
       v_cur.plan_activated_at is null
       and (v_cur.status in ('pending_payment', 'trial')
            or (v_cur.status = 'active' and v_cur.plan = 'free'))
     ) then
    return jsonb_build_object('ok', false, 'success', false,
      'error', 'Your plan is already set. Contact support to change it.');
  end if;

  insert into public.manager_subscriptions as ms (manager_id, plan, status, trial_ends_at, updated_at)
  values (v_username, v_tier, v_status, null, now())
  on conflict (manager_id) do update set
    plan = excluded.plan,
    status = excluded.status,
    trial_ends_at = null,
    payment_proof_url = case when excluded.status = 'active' then null else ms.payment_proof_url end,
    updated_at = now();

  return jsonb_build_object('ok', true, 'success', true, 'tier', v_tier, 'status', v_status);
end $$;

-- ── W5: submit_signup_payment_proof ─────────────────────────────────────────
-- Link must be an https URL under .../signup-proofs/... (the only place the
-- signup flow uploads to) — the admin panel renders it as a clickable <a href>,
-- so javascript:/data: or arbitrary URLs must never be storable.
create or replace function public.submit_signup_payment_proof(p_proof_url text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_username text;
  v_rows int;
begin
  select username into v_username from public.profiles
   where id = auth.uid() and role = 'manager' and coalesce(is_active, true);
  if v_username is null then
    return jsonb_build_object('ok', false, 'success', false, 'error', 'Not logged in');
  end if;
  if p_proof_url is null or length(p_proof_url) > 1000
     or p_proof_url !~ '^https://[^[:space:]]+/signup-proofs/[^[:space:]]+$' then
    return jsonb_build_object('ok', false, 'success', false, 'error', 'Invalid proof link');
  end if;

  update public.manager_subscriptions
     set payment_proof_url = p_proof_url, updated_at = now()
   where manager_id = v_username and status = 'pending_payment';
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return jsonb_build_object('ok', false, 'success', false,
      'error', 'No pending payment found — select a paid plan first');
  end if;
  return jsonb_build_object('ok', true, 'success', true);
end $$;

-- ── A2: client-readable status (RLS select policy on the table also exists) ──
create or replace function public.get_my_subscription()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_username text;
  s record;
  v_plan text;
  v_cust int;
  v_subs int;
begin
  select username into v_username from public.profiles where id = auth.uid() and role = 'manager';
  if v_username is null then
    return jsonb_build_object('ok', false, 'success', false, 'error', 'Not logged in');
  end if;
  select * into s from public.manager_subscriptions where manager_id = v_username;
  if not found then
    return jsonb_build_object('ok', true, 'success', true, 'exists', false, 'plan', 'free', 'status', 'active',
      'customer_limit', public.tier_customer_cap('free'), 'submanager_limit', public.tier_submanager_cap('free'),
      'payment_proof_submitted', false);
  end if;
  v_plan := case when s.status = 'pending_payment' then 'free' else s.plan end;
  v_cust := case when s.customer_limit is not null and s.customer_limit < 99999 then s.customer_limit
                 else public.tier_customer_cap(v_plan) end;
  v_subs := case when s.agent_limit is not null and s.agent_limit < 99999 then s.agent_limit
                 else public.tier_submanager_cap(v_plan) end;
  return jsonb_build_object('ok', true, 'success', true, 'exists', true,
    'plan', s.plan, 'status', s.status, 'plan_expires_at', s.plan_expires_at,
    'customer_limit', case when v_cust is null then null else greatest(v_cust, s.grandfathered_customers) end,
    'submanager_limit', case when v_subs is null then null else greatest(v_subs, s.grandfathered_submanagers) end,
    'payment_proof_submitted', s.payment_proof_url is not null);
end $$;

revoke all on function public.select_signup_tier(text), public.submit_signup_payment_proof(text),
  public.get_my_subscription() from public, anon;
grant execute on function public.select_signup_tier(text), public.submit_signup_payment_proof(text),
  public.get_my_subscription() to authenticated, service_role;

-- ── A3: server-side cap enforcement (BEFORE INSERT/UPDATE on manager_data) ──
-- Covers every write path (direct dual-save upsert AND save_manager_state RPC).
-- Fixes vs. the previous version:
--   * caps now mirror the pricing page (was 75/256/512/750/1056)
--   * a manager with NO subscription row is treated as Free (was: unlimited, which let
--     the very first INSERT — before auto_create_subscription ran — bypass every cap)
--   * manager_subscriptions.customer_limit / agent_limit are honoured as explicit admin
--     overrides when < 99999 (the 99999 column default means "not set")
--   * an UPDATE that does not INCREASE the count is always allowed (a manager above the
--     cap after a downgrade can still edit/delete instead of being locked out)
-- Error text keeps the 'TIER_LIMIT_*' prefix utils/supabaseSync.ts keys on.
create or replace function public.enforce_tier_limits()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_plan text := 'free';
  v_status text := 'pending_payment';
  v_cl int; v_al int;
  v_gc int := 0; v_gs int := 0;
  v_tier text;
  v_max_customers int;
  v_max_submanagers int;
  v_customer_count int;
  v_submanager_count int;
  v_bot_plan text;
  v_max_agents int;
  v_agent_count int;
begin
  if NEW.manager_id in ('admin', '_bot_sessions') then return NEW; end if;

  -- No row => stays Free / pending_payment (defaults above), never unlimited.
  select plan, status, customer_limit, agent_limit, grandfathered_customers, grandfathered_submanagers
    into v_plan, v_status, v_cl, v_al, v_gc, v_gs
    from public.manager_subscriptions where manager_id = NEW.manager_id;
  if not found then
    v_plan := 'free'; v_status := 'pending_payment'; v_cl := null; v_al := null; v_gc := 0; v_gs := 0;
  end if;

  v_tier := case when v_status = 'pending_payment' then 'free' else v_plan end;

  v_max_customers := case when v_cl is not null and v_cl < 99999
                          then v_cl else public.tier_customer_cap(v_tier) end;
  v_max_submanagers := case when v_al is not null and v_al < 99999
                            then v_al else public.tier_submanager_cap(v_tier) end;

  if v_max_customers is not null then
    v_max_customers := greatest(v_max_customers, v_gc);
    v_customer_count := coalesce(jsonb_array_length(NEW.data->'users'), 0);
    if v_customer_count > v_max_customers
       and not (TG_OP = 'UPDATE' and v_customer_count <= coalesce(jsonb_array_length(OLD.data->'users'), 0)) then
      raise exception 'TIER_LIMIT_CUSTOMERS: Your % plan allows up to % customers (currently %). Please upgrade to add more.',
        v_tier, v_max_customers, v_customer_count;
    end if;
  end if;

  if v_max_submanagers is not null then
    v_max_submanagers := greatest(v_max_submanagers, v_gs);
    v_submanager_count := coalesce(jsonb_array_length(NEW.data->'subManagers'), 0);
    if v_submanager_count > v_max_submanagers
       and not (TG_OP = 'UPDATE' and v_submanager_count <= coalesce(jsonb_array_length(OLD.data->'subManagers'), 0)) then
      raise exception 'TIER_LIMIT_SUBMANAGERS: Your % plan allows up to % sub-manager accounts (currently %). Please upgrade to add more.',
        v_tier, v_max_submanagers, v_submanager_count;
    end if;
  end if;

  -- NetBot voice-agent caps: unchanged.
  select plan_type into v_bot_plan from public.whatsapp_configs where manager_id = NEW.manager_id;
  if v_bot_plan is not null then
    v_max_agents := case v_bot_plan
      when 'text_only' then 1 when 'basic' then 1 when 'pro' then 3 when 'unlimited' then 7 else null end;
    if v_max_agents is not null then
      v_agent_count := coalesce(jsonb_array_length(NEW.data->'settings'->'wabotAgents'), 0);
      if v_agent_count > v_max_agents then
        raise exception 'TIER_LIMIT_AGENTS: Your NetBot % plan allows up to % voice agents (currently %). Please upgrade to add more.',
          v_bot_plan, v_max_agents, v_agent_count;
      end if;
    end if;
  end if;

  return NEW;
end $$;

-- ── A1: subscription row at signup + no more 'trial' defaults ───────────────
-- (a) manager_data first insert (legacy safety net): Free / active instead of starter / trial.
create or replace function public.auto_create_subscription()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.manager_subscriptions (manager_id, plan, status)
  values (NEW.manager_id, 'free', 'active')
  on conflict (manager_id) do nothing;
  return NEW;
end $$;

-- (b) the moment a manager's profiles.username is set (web finishSignup and Android
--     signup() both do this right after sign-in), create their subscription row.
--     select_signup_tier then upgrades it to pending_payment if a paid tier is picked.
create or replace function public.create_subscription_on_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.username is not null and NEW.role = 'manager' and NEW.manager_id is null
     and NEW.username <> 'admin'
     and (TG_OP = 'INSERT' or OLD.username is distinct from NEW.username) then
    insert into public.manager_subscriptions (manager_id, plan, status)
    values (NEW.username, 'free', 'active')
    on conflict (manager_id) do nothing;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_profiles_create_subscription on public.profiles;
create trigger trg_profiles_create_subscription
  after insert or update of username on public.profiles
  for each row execute function public.create_subscription_on_profile();

alter table public.manager_subscriptions alter column plan set default 'free';
alter table public.manager_subscriptions alter column status set default 'active';

-- (c) admin RPC: 'trial' is no longer an assignable status; inserts default to free/active;
--     p_trial_ends_at is accepted (signature unchanged for existing callers) but ignored.
create or replace function public.admin_update_manager_subscription(
  p_manager_id text, p_plan text default null, p_status text default null,
  p_trial_ends_at timestamptz default null, p_amount_pkr integer default null,
  p_notes text default null, p_customer_limit integer default null,
  p_agent_limit integer default null, p_netbot_addon boolean default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_admin_username text;
  v_allowed_plans text[] := array['free','starter','growth','business','enterprise','custom'];
  v_allowed_status text[] := array['active','locked','expired','pending_payment'];
begin
  select username into v_admin_username from public.profiles where id = auth.uid() and role = 'admin';
  if v_admin_username is null then
    return jsonb_build_object('success', false, 'error', 'Unauthorized: admin session required');
  end if;
  if p_manager_id is null or btrim(p_manager_id) = '' then
    return jsonb_build_object('success', false, 'error', 'manager_id required');
  end if;
  if not exists (select 1 from public.profiles where username = p_manager_id and role != 'admin') then
    return jsonb_build_object('success', false, 'error', 'Manager not found: ' || p_manager_id);
  end if;
  if p_plan is not null and not (p_plan = any(v_allowed_plans)) then
    return jsonb_build_object('success', false, 'error', 'Invalid plan: ' || p_plan);
  end if;
  if p_status is not null and not (p_status = any(v_allowed_status)) then
    return jsonb_build_object('success', false, 'error', 'Invalid status: ' || p_status);
  end if;
  if p_amount_pkr is not null and p_amount_pkr < 0 then
    return jsonb_build_object('success', false, 'error', 'amount_pkr cannot be negative');
  end if;

  insert into public.manager_subscriptions as ms
    (manager_id, plan, status, amount_pkr, notes, customer_limit, agent_limit, updated_at)
  values
    (p_manager_id, coalesce(p_plan,'free'), coalesce(p_status,'active'), coalesce(p_amount_pkr,0),
     p_notes, p_customer_limit, p_agent_limit, now())
  on conflict (manager_id) do update set
    plan = coalesce(p_plan, ms.plan),
    status = coalesce(p_status, ms.status),
    amount_pkr = coalesce(p_amount_pkr, ms.amount_pkr),
    notes = coalesce(p_notes, ms.notes),
    customer_limit = coalesce(p_customer_limit, ms.customer_limit),
    agent_limit = coalesce(p_agent_limit, ms.agent_limit),
    updated_at = now();

  insert into public.admin_action_logs (admin_id, admin_username, action, target_username, details)
  values (auth.uid(), v_admin_username, 'update_manager_subscription', p_manager_id,
    jsonb_build_object('plan', p_plan, 'status', p_status, 'amount_pkr', p_amount_pkr, 'notes', p_notes,
      'customer_limit', p_customer_limit, 'agent_limit', p_agent_limit));

  return jsonb_build_object('success', true, 'manager_id', p_manager_id);
exception when others then
  return jsonb_build_object('success', false, 'error', sqlerrm);
end $$;

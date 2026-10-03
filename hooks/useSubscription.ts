import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// NOTE (2026-10-04): the trial system is discontinued — HARD LOCK. New signups are
// 'active' on the Free plan or 'pending_payment' until an admin approves. There is no
// 'trial' tier any more: Free / pending_payment / legacy status='trial' rows all get the
// Free-level feature gate ('starter' tier below), never full access.
export type PlanTier = 'starter' | 'business' | 'pro' | 'suspended';

export interface SubscriptionInfo {
  managerId: string;
  tier: PlanTier;
  planExpiresAt: Date | null;
  customerLimit: number;
  agentLimit: number;
  isActive: boolean;
  loading: boolean;
}

// Feature access per tier
export const TIER_FEATURES: Record<PlanTier, {
  equipment: boolean;
  leads: boolean;
  area: boolean;
  suspension: boolean;
  outage: boolean;
  analytics: boolean;
  reports: boolean;
  aging: boolean;
  expenses: boolean;
  team: boolean;
  systemlogs: boolean;
  customerLimit: number;
  agentLimit: number;
  label: string;
  color: string;
}> = {
  starter: {
    equipment: false, leads: false, area: false, suspension: false,
    outage: false, analytics: false, reports: true, aging: true,
    expenses: true, team: true, systemlogs: false,
    customerLimit: 150, agentLimit: 1,
    label: 'Starter', color: 'text-indigo-400',
  },
  business: {
    equipment: true, leads: true, area: true, suspension: true,
    outage: true, analytics: true, reports: true, aging: true,
    expenses: true, team: true, systemlogs: true,
    customerLimit: 500, agentLimit: 3,
    label: 'Business', color: 'text-purple-400',
  },
  pro: {
    equipment: true, leads: true, area: true, suspension: true,
    outage: true, analytics: true, reports: true, aging: true,
    expenses: true, team: true, systemlogs: true,
    customerLimit: 99999, agentLimit: 99999,
    label: 'Pro', color: 'text-cyan-400',
  },
  suspended: {
    equipment: false, leads: false, area: false, suspension: false,
    outage: false, analytics: false, reports: false, aging: false,
    expenses: false, team: false, systemlogs: false,
    customerLimit: 0, agentLimit: 0,
    label: 'Suspended', color: 'text-red-400',
  },
};

// Server-side caps (public.tier_customer_cap / tier_submanager_cap) — display only here;
// the real enforcement is the enforce_tier_limits trigger on manager_data.
// 99999 = unlimited. pending_payment is enforced at FREE limits.
const CUSTOMER_CAP: Record<string, number> = { free: 50, starter: 150, growth: 250, business: 500, enterprise: 1000, pro: 1000, custom: 99999 };
const SUBMANAGER_CAP: Record<string, number> = { free: 0, starter: 1, growth: 2, business: 3, enterprise: 5, pro: 5, custom: 99999 };

const DEFAULT_SUB: SubscriptionInfo = {
  managerId: '',
  tier: 'starter',
  planExpiresAt: null,
  customerLimit: CUSTOMER_CAP.free,
  agentLimit: SUBMANAGER_CAP.free,
  isActive: true,
  loading: true,
};

// Maps admin panel's status+plan columns → PlanTier.
// NOTE: SUBSCRIPTION_PLAN_OPTIONS (AdminDashboard.tsx) now mirrors the live
// pricing_plans list exactly (free/starter/growth/business/enterprise/custom) —
// 'whatsapp-bot' is no longer an assignable base-plan value; NetBot is a fully
// standalone product (see whatsapp_configs.plan_type / provision_netbot_default),
// unrelated to this ISP-tier mapping.
const PLAN_TO_TIER: Record<string, PlanTier> = {
  free: 'starter',
  starter: 'starter',
  growth: 'business',
  business: 'business',
  enterprise: 'pro',
  pro: 'pro',
  custom: 'pro',
};

function deriveTier(status: string, plan: string): PlanTier {
  if (status === 'locked' || status === 'expired') return 'suspended';
  if (status === 'active') {
    const mapped = PLAN_TO_TIER[plan];
    if (!mapped && typeof console !== 'undefined') {
      console.warn(`[useSubscription] Unrecognized plan value "${plan}" — defaulting to 'starter' features.`);
    }
    return mapped || 'starter';
  }
  // pending_payment (paid plan chosen, not yet approved) and legacy status='trial' rows:
  // Free-level access only until an admin sets status='active'. Never full access.
  return 'starter';
}

export function useSubscription(managerId: string | null): SubscriptionInfo {
  const [info, setInfo] = useState<SubscriptionInfo>(DEFAULT_SUB);

  useEffect(() => {
    if (!managerId || managerId === 'admin') {
      setInfo({ ...DEFAULT_SUB, managerId: managerId || '', tier: 'pro', loading: false, customerLimit: 99999, agentLimit: 99999 });
      return;
    }

    const fetchSub = async () => {
      try {
        const { data, error } = await supabase
          .from('manager_subscriptions')
          .select('*')
          .eq('manager_id', managerId)
          .single();

        if (error && (error as any).code !== 'PGRST116') {
          // Transient failure (network/5xx) — keep whatever we already knew for this manager
          // rather than flipping a paying manager to Free for a blip; first load fails closed.
          setInfo(prev => prev.managerId === managerId && !prev.loading ? prev : { ...DEFAULT_SUB, managerId, loading: false });
          return;
        }
        if (!data) {
          // No subscription row = Free (hard lock). The DB creates the row at signup; this only
          // covers rows that are missing for legacy reasons.
          setInfo({ ...DEFAULT_SUB, managerId, loading: false });
          return;
        }

        const status = (data.status as string) || 'pending_payment';
        const plan = (data.plan as string) || 'free';
        const planExpires = data.plan_expires_at ? new Date(data.plan_expires_at) : null;

        const tier = deriveTier(status, plan);
        const isActive = tier !== 'suspended';
        const features = TIER_FEATURES[tier];
        const capPlan = status === 'pending_payment' ? 'free' : plan;
        // customer_limit / agent_limit columns default to 99999 = "not set"; only a lower
        // explicit admin override replaces the plan cap (same rule as enforce_tier_limits).
        const customerLimit = data.customer_limit != null && data.customer_limit < 99999
          ? data.customer_limit : (CUSTOMER_CAP[capPlan] ?? CUSTOMER_CAP.free);
        const agentLimit = data.agent_limit != null && data.agent_limit < 99999
          ? data.agent_limit : (SUBMANAGER_CAP[capPlan] ?? SUBMANAGER_CAP.free);

        setInfo({
          managerId,
          tier,
          planExpiresAt: planExpires,
          customerLimit: tier === 'suspended' ? features.customerLimit : customerLimit,
          agentLimit: tier === 'suspended' ? features.agentLimit : agentLimit,
          isActive,
          loading: false,
        });
      } catch {
        setInfo({ ...DEFAULT_SUB, managerId, loading: false });
      }
    };

    fetchSub();

    // Reflect admin-side plan/status changes immediately in an already-open
    // session, without requiring the manager to log out/in or reload.
    const channel = supabase
      .channel(`manager_subscription_${managerId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'manager_subscriptions', filter: `manager_id=eq.${managerId}` },
        () => { fetchSub(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [managerId]);

  return info;
}

// Check if a specific feature is accessible
export function canAccess(sub: SubscriptionInfo, feature: keyof typeof TIER_FEATURES['starter']): boolean {
  if (sub.loading) return true;
  const features = TIER_FEATURES[sub.tier];
  return typeof features[feature] === 'boolean' ? features[feature] as boolean : true;
}

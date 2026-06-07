import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export type PlanTier = 'trial' | 'starter' | 'business' | 'pro' | 'suspended';

export interface SubscriptionInfo {
  managerId: string;
  tier: PlanTier;
  trialExpiresAt: Date | null;
  planExpiresAt: Date | null;
  customerLimit: number;
  agentLimit: number;
  isTrialExpired: boolean;
  daysLeftInTrial: number;
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
  trial: {
    equipment: true, leads: true, area: true, suspension: true,
    outage: true, analytics: true, reports: true, aging: true,
    expenses: true, team: true, systemlogs: true,
    customerLimit: 99999, agentLimit: 99999,
    label: 'Free Trial', color: 'text-emerald-400',
  },
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

const DEFAULT_SUB: SubscriptionInfo = {
  managerId: '',
  tier: 'trial',
  trialExpiresAt: null,
  planExpiresAt: null,
  customerLimit: 99999,
  agentLimit: 99999,
  isTrialExpired: false,
  daysLeftInTrial: 90,
  isActive: true,
  loading: true,
};

export function useSubscription(managerId: string | null): SubscriptionInfo {
  const [info, setInfo] = useState<SubscriptionInfo>(DEFAULT_SUB);

  useEffect(() => {
    if (!managerId || managerId === 'admin') {
      setInfo({ ...DEFAULT_SUB, managerId: managerId || '', tier: 'pro', loading: false, daysLeftInTrial: 9999 });
      return;
    }

    const fetchSub = async () => {
      try {
        const { data, error } = await supabase
          .from('manager_subscriptions')
          .select('*')
          .eq('manager_id', managerId)
          .single();

        if (error || !data) {
          // No row = auto-trial
          setInfo({
            ...DEFAULT_SUB, managerId, tier: 'trial', loading: false,
            trialExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            daysLeftInTrial: 90, isActive: true,
          });
          return;
        }

        const now = new Date();
        const trialExpires = data.trial_expires_at ? new Date(data.trial_expires_at) : null;
        const planExpires = data.plan_expires_at ? new Date(data.plan_expires_at) : null;
        const tier = data.plan_tier as PlanTier;

        const isTrialExpired = tier === 'trial' && trialExpires ? trialExpires < now : false;
        const daysLeftInTrial = trialExpires
          ? Math.max(0, Math.ceil((trialExpires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
          : 0;

        const isActive = tier !== 'suspended' && !isTrialExpired;

        const features = TIER_FEATURES[isTrialExpired ? 'starter' : tier];

        setInfo({
          managerId,
          tier: isTrialExpired ? 'starter' : tier,
          trialExpiresAt: trialExpires,
          planExpiresAt: planExpires,
          customerLimit: data.customer_limit ?? features.customerLimit,
          agentLimit: data.agent_limit ?? features.agentLimit,
          isTrialExpired,
          daysLeftInTrial,
          isActive,
          loading: false,
        });
      } catch {
        setInfo({ ...DEFAULT_SUB, managerId, loading: false });
      }
    };

    fetchSub();
  }, [managerId]);

  return info;
}

// Check if a specific feature is accessible
export function canAccess(sub: SubscriptionInfo, feature: keyof typeof TIER_FEATURES['trial']): boolean {
  if (sub.loading) return true;
  const tier = sub.isTrialExpired ? 'starter' : sub.tier;
  const features = TIER_FEATURES[tier];
  return typeof features[feature] === 'boolean' ? features[feature] as boolean : true;
}

import { supabase } from '../lib/supabase';

export interface PricingPlan {
  name: string;
  price: string;
  period: string;
  color: string;
  features: string[];
  cta: string;
  highlight: boolean;
}

/**
 * The WhatsApp Bot (NetBot) is a standalone service, separate from the ISP
 * billing tiers — sold on its own tiered pricing regardless of which ISP plan
 * (if any) a manager is on. Real tiers confirmed and enforced server-side via
 * whatsapp_configs.plan_type / QUOTA_MAP in api/admin-maintenance.ts.
 * Only 3 tiers are sold (Unlimited/Enterprise retired) — each gets its own
 * pricing card instead of one shared card.
 */
export const WHATSAPP_BOT_PLANS: PricingPlan[] = [
  {
    name: 'NetBot Text-Only',
    price: 'Rs. 1,000',
    period: 'month',
    color: '#22c55e',
    features: [
      '1,000 text messages',
      '30-day validity',
      'Works standalone or alongside any ISP plan — sold separately',
      'Meta WhatsApp Business setup included',
    ],
    cta: 'Get Text-Only',
    highlight: false,
  },
  {
    name: 'NetBot Basic',
    price: 'Rs. 2,500',
    period: 'month',
    color: '#22c55e',
    features: [
      '1,000 text messages + 375 voice replies',
      '30-day validity',
      'Works standalone or alongside any ISP plan — sold separately',
      'Meta WhatsApp Business setup included',
    ],
    cta: 'Get Basic',
    highlight: false,
  },
  {
    name: 'NetBot Pro',
    price: 'Rs. 5,000',
    period: 'month',
    color: '#22c55e',
    features: [
      '2,000 text messages + 750 voice replies',
      '30-day validity',
      'WhatsApp utility templates & auto-reminders',
      'Meta WhatsApp Business setup included',
    ],
    cta: 'Get Pro',
    highlight: false,
  },
];

/**
 * Keeps the 3 standalone NetBot pricing cards present while preserving any
 * plans already saved by an administrator. Strips the old single "WhatsApp
 * Bot" card (pre-split legacy shape) if found, then adds back whichever of
 * the 3 NetBot tier cards are missing by name. A copy is returned to avoid
 * mutating Supabase response objects or React state in place.
 */
export const ensureWhatsAppBotPlan = (plans: PricingPlan[]): PricingPlan[] => {
  const withoutLegacyCard = plans.filter((plan) => plan.name.trim().toLowerCase() !== 'whatsapp bot');
  const existingNames = new Set(withoutLegacyCard.map((plan) => plan.name.trim().toLowerCase()));
  const missing = WHATSAPP_BOT_PLANS.filter((plan) => !existingNames.has(plan.name.trim().toLowerCase()));
  return [...withoutLegacyCard, ...missing.map((plan) => ({ ...plan, features: [...plan.features] }))];
};

/**
 * Fallback ISP billing tiers — used until (or unless) admin-edited plans load
 * from Supabase, and whenever that fetch fails, so pricing never goes blank.
 * Single source of truth for the *default* copy; the live, admin-edited
 * values always come from `site_settings.pricing_plans` via fetchPricingPlans().
 */
export const DEFAULT_ISP_PLANS: PricingPlan[] = [
  {
    name: 'Free', price: 'Free', period: '', color: '#64748b',
    features: ['Up to 50 customers', 'Core billing, receipts & recovery ledger', 'Manual WhatsApp reminders', 'Cloud sync'],
    cta: 'Start Free', highlight: false,
  },
  {
    name: 'Starter', price: 'Rs. 1,000', period: 'month', color: '#6366f1',
    features: ['Up to 150 customers', 'Area Dashboard & Equipment Tracker', 'Leads Pipeline & Analytics', 'Cloud sync & backups'],
    cta: 'Get Starter', highlight: false,
  },
  {
    name: 'Growth', price: 'Rs. 1,500', period: 'month', color: '#8b5cf6',
    features: ['Up to 250 customers', 'Full manager toolset included', 'Area Dashboard, Equipment Tracker, Leads Pipeline, Analytics'],
    cta: 'Get Growth', highlight: false,
  },
  {
    name: 'Business', price: 'Rs. 2,000', period: 'month', color: '#4f46e5',
    features: ['Up to 500 customers', 'Full manager toolset included', 'Priority support'],
    cta: 'Get Business', highlight: true,
  },
  {
    name: 'Enterprise', price: 'Rs. 3,000', period: 'month', color: '#06b6d4',
    features: ['Up to 1,000 customers', 'Full manager toolset included', 'Meta message templates built for you', 'Priority support'],
    cta: 'Get Enterprise', highlight: false,
  },
  {
    name: 'Custom', price: 'Custom', period: '', color: '#f59e0b',
    features: ['Unlimited customers', 'Meta message templates built for you', 'Custom branding & domain', 'Dedicated onboarding & priority support'],
    cta: 'Contact Us', highlight: false,
  },
];

/**
 * Fetches the admin-edited ISP billing plans from Supabase
 * `site_settings.pricing_plans` — the exact same row the public landing
 * page's pricing section reads. Falls back to DEFAULT_ISP_PLANS on any
 * network/parse failure or empty result. Both the landing page AND the
 * post-signup tier-selection screen call this, so the two can never show
 * different tiers/prices again.
 */
export const fetchPricingPlans = async (): Promise<PricingPlan[]> => {
  try {
    const { data, error } = await supabase
      .from('site_settings')
      .select('pricing_plans')
      .eq('id', 'default')
      .maybeSingle();
    if (!error && Array.isArray(data?.pricing_plans) && data.pricing_plans.length > 0) {
      return ensureWhatsAppBotPlan(data.pricing_plans as PricingPlan[]);
    }
  } catch {
    // Network/parse failure — fall through to defaults below.
  }
  return ensureWhatsAppBotPlan(DEFAULT_ISP_PLANS);
};

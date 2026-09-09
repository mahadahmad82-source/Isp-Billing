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

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
 */
export const WHATSAPP_BOT_PLAN: PricingPlan = {
  name: 'WhatsApp Bot',
  price: 'From Rs. 1,500',
  period: 'month',
  color: '#22c55e',
  features: [
    'Text-Only — Rs. 1,500/mo (1,750 messages)',
    'Basic — Rs. 2,000/mo (2,500 msgs, text + voice)',
    'Pro — Rs. 4,000/mo (5,000 msgs, text + voice)',
    'Unlimited — Rs. 8,000/mo',
    'Works standalone or alongside any ISP plan above',
    'Meta WhatsApp Business setup included',
  ],
  cta: 'Get WhatsApp Bot',
  highlight: false,
};

/**
 * Keeps the standalone WhatsApp Bot card present while preserving any plans
 * already saved by an administrator. A copy is returned to avoid mutating
 * Supabase response objects or React state in place.
 */
export const ensureWhatsAppBotPlan = (plans: PricingPlan[]): PricingPlan[] => {
  const hasWhatsAppBot = plans.some((plan) => plan.name.trim().toLowerCase() === 'whatsapp bot');
  return hasWhatsAppBot ? plans : [...plans, { ...WHATSAPP_BOT_PLAN, features: [...WHATSAPP_BOT_PLAN.features] }];
};

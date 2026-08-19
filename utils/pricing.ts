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
 * The WhatsApp Bot is a standalone service card, separate from the ISP billing tiers.
 * Its commercial amount remains editable from Admin > Pricing until the final bot
 * rate is confirmed; the feature scope is kept explicit so it is not lost from
 * the landing page or the admin plan catalog.
 */
export const WHATSAPP_BOT_PLAN: PricingPlan = {
  name: 'WhatsApp Bot',
  price: 'Contact Us',
  period: '',
  color: '#22c55e',
  features: [
    'AI WhatsApp customer support for billing, complaints & technical queries',
    'Automated text replies with voice-message support',
    'Customer inbox, complaint capture & lead routing',
    'Meta WhatsApp Business setup and message templates',
    'Dedicated onboarding and bot configuration',
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

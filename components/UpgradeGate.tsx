import React from 'react';
import { SubscriptionInfo, TIER_FEATURES } from '../hooks/useSubscription';

interface Props {
  sub: SubscriptionInfo;
  feature: string;
  featureName: string;
  requiredTier?: 'starter' | 'business' | 'pro';
  children?: React.ReactNode;
}

const TIER_ORDER = { trial: 0, starter: 1, business: 2, pro: 3, suspended: -1 };

const UPGRADE_INFO: Record<string, { emoji: string; desc: string; tier: string }> = {
  equipment:  { emoji: '📡', desc: 'Routers, ONUs aur devices track karo', tier: 'Business' },
  leads:      { emoji: '🎯', desc: 'New connection inquiries pipeline manage karo', tier: 'Business' },
  area:       { emoji: '📍', desc: 'Area-wise customers aur revenue dekho', tier: 'Business' },
  suspension: { emoji: '🚫', desc: 'Connection suspend/restore with full log', tier: 'Business' },
  outage:     { emoji: '⚡', desc: 'Network downtime track karo', tier: 'Business' },
  analytics:  { emoji: '📊', desc: 'Revenue trends aur business insights', tier: 'Business' },
  systemlogs: { emoji: '📋', desc: 'Poora system activity log', tier: 'Business' },
};

const UpgradeGate: React.FC<Props> = ({ sub, feature, featureName, children }) => {
  const tier = sub.isTrialExpired ? 'starter' : sub.tier;
  const features = TIER_FEATURES[tier];
  const hasAccess = typeof (features as any)[feature] === 'boolean' ? (features as any)[feature] : true;

  if (hasAccess || sub.loading) return children ? <>{children}</> : null;

  const info = UPGRADE_INFO[feature] || { emoji: '🔒', desc: featureName, tier: 'Business' };

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-white flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center">
        {/* Lock icon */}
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-indigo-500/20 flex items-center justify-center mx-auto mb-6">
          <span className="text-5xl">{info.emoji}</span>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full mb-4">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-red-400">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
          <span className="text-red-400 text-xs font-black uppercase tracking-wider">Locked — {info.tier} Plan Required</span>
        </div>

        <h2 className="text-2xl font-black mb-2">{featureName}</h2>
        <p className="text-white/50 text-sm mb-8">{info.desc}</p>

        {/* Current plan */}
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 mb-6">
          <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Aapka Current Plan</p>
          <p className="font-black text-lg">
            {TIER_FEATURES[tier].label}
            {sub.isTrialExpired && <span className="text-red-400 text-sm ml-2">(Trial Expired)</span>}
          </p>
        </div>

        {/* Plans needed */}
        <div className="space-y-3 mb-8">
          {[
            { tier: 'business', label: 'Business', price: 'Rs. 1,500/month', color: 'from-purple-600/20 to-indigo-600/20 border-purple-500/30' },
            { tier: 'pro', label: 'Pro', price: 'Rs. 2,500/month', color: 'from-cyan-600/20 to-blue-600/20 border-cyan-500/30' },
          ].map(plan => (
            <div key={plan.tier} className={`bg-gradient-to-r ${plan.color} border rounded-2xl p-4 flex items-center justify-between`}>
              <div>
                <p className="font-black text-sm">{plan.label} Plan</p>
                <p className="text-white/50 text-xs">{plan.price}</p>
              </div>
              <a href={`https://wa.me/923042773453?text=MYISP ${plan.label} plan chahiye — manager: ${sub.managerId}`}
                target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-500 rounded-xl text-xs font-black transition-all active:scale-95">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.553 4.126 1.52 5.874L0 24l6.296-1.496A11.933 11.933 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.797 9.797 0 01-4.988-1.366l-.358-.213-3.713.882.939-3.63-.234-.373A9.797 9.797 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z"/></svg>
                Upgrade
              </a>
            </div>
          ))}
        </div>

        <p className="text-white/30 text-xs">WhatsApp karo: 0304-2773453</p>
      </div>
    </div>
  );
};

export default UpgradeGate;

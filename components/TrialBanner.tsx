import React, { useState } from 'react';
import { SubscriptionInfo, TIER_FEATURES } from '../hooks/useSubscription';
import { AlertSirenIcon, WarningIcon, NoEntryIcon, PackageIcon, CloseIcon } from './icons/UiIcons';

interface Props {
  sub: SubscriptionInfo;
}

const TrialBanner: React.FC<Props> = ({ sub }) => {
  const [dismissed, setDismissed] = useState(false);

  if (sub.loading || dismissed) return null;
  if (sub.tier === 'pro') return null;
  if (sub.tier === 'trial' && sub.daysLeftInTrial > 10) return null;

  // Trial expired
  if (sub.isTrialExpired) return (
    <div className="fixed top-0 left-0 right-0 z-[200] bg-red-600 text-white px-4 py-2.5 flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm">
        <AlertSirenIcon className="w-4 h-4" />
        <span className="font-black">Your free trial has expired!</span>
        <span className="hidden sm:inline text-red-200">Premium features are locked. Please upgrade.</span>
      </div>
      <a href={`https://wa.me/923042773453?text=I want to upgrade Bill Collector — ID: ${sub.managerId}`}
        target="_blank" rel="noreferrer"
        className="flex items-center gap-1.5 bg-white text-red-600 px-4 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider">
        Upgrade Now
      </a>
    </div>
  );

  // Suspended
  if (sub.tier === 'suspended') return (
    <div className="fixed top-0 left-0 right-0 z-[200] bg-red-800 text-white px-4 py-2.5 text-center text-sm font-black flex items-center justify-center gap-2">
      <NoEntryIcon className="w-4 h-4" /> Account is suspended. WhatsApp us: 0304-2773453
    </div>
  );

  // Trial ending soon (10 days or less)
  if (sub.tier === 'trial' && sub.daysLeftInTrial <= 10) {
    const urgent = sub.daysLeftInTrial <= 3;
    return (
      <div className={`fixed top-0 left-0 right-0 z-[200] ${urgent ? 'bg-orange-600' : 'bg-amber-600'} text-white px-4 py-2.5 flex items-center justify-between`}>
        <div className="flex items-center gap-2 text-sm">
          {urgent ? <AlertSirenIcon className="w-4 h-4" /> : <WarningIcon className="w-4 h-4" />}
          <span className="font-black">
            Only <span className="underline">{sub.daysLeftInTrial} days</span> left in your free trial!
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a href={`https://wa.me/923042773453?text=I want to upgrade Bill Collector — ID: ${sub.managerId}`}
            target="_blank" rel="noreferrer"
            className="bg-white text-amber-700 px-3 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider">
            Upgrade
          </a>
          <button onClick={() => setDismissed(true)} className="text-white/70 hover:text-white"><CloseIcon className="w-4 h-4" /></button>
        </div>
      </div>
    );
  }

  // Starter plan — show what's locked
  if (sub.tier === 'starter') return (
    <div className="fixed top-0 left-0 right-0 z-[200] bg-indigo-700 text-white px-4 py-2 flex items-center justify-between">
      <span className="text-xs font-bold flex items-center gap-1.5"><PackageIcon className="w-3.5 h-3.5" /> Starter Plan — Equipment, Leads, Analytics locked</span>
      <div className="flex items-center gap-2">
        <a href={`https://wa.me/923042773453?text=I want the Business plan — ID: ${sub.managerId}`}
          target="_blank" rel="noreferrer"
          className="bg-white text-indigo-700 px-3 py-1 rounded-lg font-black text-[10px] uppercase">
          Upgrade
        </a>
        <button onClick={() => setDismissed(true)} className="text-white/60 hover:text-white"><CloseIcon className="w-4 h-4" /></button>
      </div>
    </div>
  );

  return null;
};

export default TrialBanner;

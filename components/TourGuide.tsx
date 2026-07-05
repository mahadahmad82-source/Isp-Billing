import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export type TourLang = 'en' | 'ur';

interface StepText { en: string; ur: string; }

export interface TourStep {
  id: string;
  icon: string;
  /** DOM element id to spotlight. If omitted (or not found), the step renders as a centered card. */
  targetId?: string;
  title: StepText;
  description: StepText;
}

const LANG_KEY = 'myisp_tour_lang';

// ─────────────────────────────────────────────────────────
// WELCOME TOUR — short, runs once after first manager login
// ─────────────────────────────────────────────────────────
export const WELCOME_STEPS: TourStep[] = [
  {
    id: 'welcome', icon: '👋',
    title: { en: 'Welcome to MYISP!', ur: 'MYISP میں خوش آمدید!' },
    description: {
      en: 'Let\'s take a quick 60-second tour so you know exactly how to run your ISP business from here. You can replay this anytime from Settings.',
      ur: 'آئیے ایک مختصر ٹور کرتے ہیں تاکہ آپ اپنا ISP بزنس یہاں سے چلانا اچھی طرح سیکھ لیں۔ یہ ٹور آپ کسی بھی وقت سیٹنگز سے دوبارہ چلا سکتے ہیں۔'
    }
  },
  {
    id: 'top-header', icon: '🧭', targetId: 'tour-top-header',
    title: { en: 'Your Top Bar', ur: 'اوپر والی بار' },
    description: {
      en: 'Save status, dark/light theme, notifications and your profile all live here — always visible, on every screen.',
      ur: 'سیو اسٹیٹس، تھیم، نوٹیفیکیشنز اور آپ کی پروفائل ہمیشہ یہاں موجود ہوتی ہیں — ہر اسکرین پر نظر آئیں گی۔'
    }
  },
  {
    id: 'nav', icon: '📂', targetId: 'tour-sidebar-nav',
    title: { en: 'Menu — All Your Features', ur: 'مینو — آپ کے تمام فیچرز' },
    description: {
      en: 'Tap the ☰ icon anytime to open this menu. Every feature of your business — Customers, Receipts, Recoveries and more — is one tap away.',
      ur: '☰ آئیکن پر ٹیپ کر کے یہ مینو کبھی بھی کھولیں۔ آپ کے بزنس کا ہر فیچر — کسٹمرز، رسیدیں، ریکوریز وغیرہ — یہاں سے صرف ایک ٹیپ کی دوری پر ہے۔'
    }
  },
  {
    id: 'profile', icon: '👤', targetId: 'tour-mobile-profile',
    title: { en: 'Your Account', ur: 'آپ کا اکاؤنٹ' },
    description: {
      en: 'Tap your avatar to edit your profile, change your password, or log out.',
      ur: 'اپنی پروفائل ایڈٹ کرنے، پاسورڈ بدلنے یا لاگ آؤٹ کرنے کے لیے اپنی تصویر پر ٹیپ کریں۔'
    }
  },
  {
    id: 'stats', icon: '📊', targetId: 'tour-stats-grid',
    title: { en: 'Live Business Stats', ur: 'لائیو بزنس اعداد و شمار' },
    description: {
      en: 'Revenue, balances, active/expired customers and 3-day alerts — tap any card to jump straight into the details.',
      ur: 'ریونیو، بقایا رقم، ایکٹو/ایکسپائرڈ کسٹمرز اور 3 دن کی یاد دہانیاں — کسی بھی کارڈ پر ٹیپ کر کے تفصیل دیکھیں۔'
    }
  },
  {
    id: 'reminder', icon: '⏰', targetId: 'tour-reminder-hub',
    title: { en: '3-Day Reminder Hub', ur: '3 دن کی یاد دہانی' },
    description: {
      en: 'Whenever customers are about to expire in 3 days, this banner appears so you can remind them before they\'re gone.',
      ur: 'جب کسی کسٹمر کا پیکج 3 دن میں ختم ہونے والا ہو تو یہ بینر ظاہر ہوتا ہے تاکہ آپ وقت پر یاد دہانی بھیج سکیں۔'
    }
  },
  {
    id: 'finish', icon: '🚀',
    title: { en: 'You\'re All Set!', ur: 'آپ اب تیار ہیں!' },
    description: {
      en: 'As you open each tab for the first time, a quick tip will explain what it\'s for. Want to see all this again? Go to Settings → Tour Guide.',
      ur: 'جب آپ ہر ٹیب پہلی بار کھولیں گے تو ایک مختصر ٹِپ سمجھا دے گی کہ وہ کس کام کی ہے۔ دوبارہ دیکھنا چاہیں تو سیٹنگز → ٹور گائیڈ میں جائیں۔'
    }
  },
];

// ─────────────────────────────────────────────────────────
// PER-TAB TIPS — shown once, the first time a manager opens that tab
// ─────────────────────────────────────────────────────────
export const TAB_STEPS: Record<string, TourStep[]> = {
  users: [{
    id: 'users', icon: '👥',
    title: { en: 'Customers', ur: 'کسٹمرز' },
    description: {
      en: 'Manage every subscriber here — add new customers, search instantly, and track their plan, status and expiry.',
      ur: 'اپنے تمام صارفین یہاں سے منظم کریں — نئے کسٹمر شامل کریں، فوری تلاش کریں اور ان کا پلان، اسٹیٹس اور معیاد دیکھیں۔'
    }
  }],
  receipts: [{
    id: 'receipts', icon: '🧾',
    title: { en: 'Receipts', ur: 'رسیدیں' },
    description: {
      en: 'Generate professional payment receipts and share them straight to WhatsApp. Past receipts are always searchable in History.',
      ur: 'پروفیشنل ادائیگی کی رسیدیں بنائیں اور براہ راست واٹس ایپ پر بھیجیں۔ پرانی رسیدیں ہمیشہ ہسٹری میں تلاش کی جا سکتی ہیں۔'
    }
  }],
  recoveries: [{
    id: 'recoveries', icon: '💰',
    title: { en: 'Recovery Ledger', ur: 'ریکوری لیجر' },
    description: {
      en: 'Every month becomes its own folder here — tap one to see who paid, who\'s pending, and your recovery %.',
      ur: 'ہر مہینہ یہاں اپنا الگ فولڈر بن جاتا ہے — کسی پر ٹیپ کریں اور دیکھیں کس نے ادائیگی کی، کس کی باقی ہے، اور ریکوری فیصد کیا ہے۔'
    }
  }],
  expiries: [{
    id: 'expiries', icon: '⏰',
    title: { en: 'Expiries', ur: 'معیاد ختم' },
    description: {
      en: 'See exactly whose internet is expiring soon and send timely renewal reminders. Check this every morning.',
      ur: 'دیکھیں کن کسٹمرز کا انٹرنیٹ جلد ختم ہونے والا ہے اور بروقت یاد دہانی بھیجیں۔ ہر صبح یہ سیکشن ضرور چیک کریں۔'
    }
  }],
  reports: [{
    id: 'reports', icon: '🤖',
    title: { en: 'AI Insights', ur: 'اے آئی بصیرت' },
    description: {
      en: 'A yearly ledger plus an AI-written summary of your business trends — updated automatically as you collect payments.',
      ur: 'سالانہ لیجر کے ساتھ آپ کے بزنس کے رجحانات کا AI خلاصہ — جیسے ہی آپ ادائیگیاں وصول کرتے ہیں یہ خودکار اپڈیٹ ہوتا ہے۔'
    }
  }],
  analytics: [{
    id: 'analytics', icon: '📈',
    title: { en: 'Business Analytics', ur: 'بزنس اینالیٹکس' },
    description: {
      en: 'Deep-dive into revenue trends, plan-wise breakdown, discounts, and now Daily Collection — all in one place.',
      ur: 'ریونیو کے رجحانات، پلان کے حساب سے تفصیل، ڈسکاؤنٹس اور اب روزانہ کی وصولی — سب کچھ ایک ہی جگہ۔'
    }
  }],
  settings: [{
    id: 'settings', icon: '⚙️',
    title: { en: 'Settings', ur: 'سیٹنگز' },
    description: {
      en: 'Set your business name, logo, plan prices and theme here. You can also replay this Tour Guide anytime from here.',
      ur: 'اپنا بزنس نام، لوگو، پلان کی قیمتیں اور تھیم یہاں سیٹ کریں۔ آپ ٹور گائیڈ بھی یہیں سے دوبارہ چلا سکتے ہیں۔'
    }
  }],
  team: [{
    id: 'team', icon: '🧑‍💼',
    title: { en: 'Team Hub', ur: 'ٹیم ہب' },
    description: {
      en: 'Add sub-managers or staff, control exactly what each one can see or do, and track their activity.',
      ur: 'سب مینیجرز یا اسٹاف شامل کریں، ہر ایک کو مخصوص اجازتیں دیں اور ان کی ایکٹیویٹی ٹریک کریں۔'
    }
  }],
  expenses: [{
    id: 'expenses', icon: '💸',
    title: { en: 'Business Expenses', ur: 'بزنس اخراجات' },
    description: {
      en: 'Log salaries, bills, and equipment costs here — your Dashboard profit number automatically subtracts these.',
      ur: 'تنخواہیں، بل اور آلات کے اخراجات یہاں درج کریں — ڈیش بورڈ کا منافع خودکار طور پر ان کو منہا کر کے دکھاتا ہے۔'
    }
  }],
  outage: [{
    id: 'outage', icon: '🛰️',
    title: { en: 'Outage Tracker', ur: 'آؤٹیج ٹریکر' },
    description: {
      en: 'Log network outages by area so you always know what\'s down, since when, and who to notify.',
      ur: 'علاقے کے حساب سے نیٹ ورک آؤٹیج درج کریں تاکہ معلوم رہے کیا بند ہے، کب سے، اور کسے مطلع کرنا ہے۔'
    }
  }],
  area: [{
    id: 'area', icon: '🗺️',
    title: { en: 'Area Dashboard', ur: 'ایریا ڈیش بورڈ' },
    description: {
      en: 'See customers, revenue and recovery broken down zone by zone, to spot which areas need attention.',
      ur: 'کسٹمرز، ریونیو اور ریکوری کو علاقے کے لحاظ سے دیکھیں تاکہ پتا چلے کس زون پر توجہ درکار ہے۔'
    }
  }],
  equipment: [{
    id: 'equipment', icon: '📡',
    title: { en: 'Equipment Tracker', ur: 'آلات ٹریکر' },
    description: {
      en: 'Track every router, ONU and cable issued to customers, plus what\'s left in your stock.',
      ur: 'ہر راؤٹر، ONU اور کیبل جو کسٹمرز کو دی گئی، اور اسٹاک میں باقی سامان یہاں سے ٹریک کریں۔'
    }
  }],
  leads: [{
    id: 'leads', icon: '🎯',
    title: { en: 'Leads Pipeline', ur: 'لیڈز پائپ لائن' },
    description: {
      en: 'Track potential new customers from first contact all the way to activation, so no lead gets forgotten.',
      ur: 'نئے ممکنہ کسٹمرز کو پہلے رابطے سے لے کر ایکٹیویشن تک ٹریک کریں تاکہ کوئی لیڈ نہ بھولے۔'
    }
  }],
  reminders: [{
    id: 'reminders', icon: '📢',
    title: { en: 'Bulk Reminders', ur: 'بلک یاد دہانی' },
    description: {
      en: 'Send a WhatsApp reminder to many expiring or overdue customers at once, instead of one by one.',
      ur: 'معیاد ختم ہونے یا بقایا رکھنے والے کئی کسٹمرز کو ایک ساتھ واٹس ایپ یاد دہانی بھیجیں، ایک ایک کر کے نہیں۔'
    }
  }],
  templates: [{
    id: 'templates', icon: '📝',
    title: { en: 'Message Templates', ur: 'میسج ٹیمپلیٹس' },
    description: {
      en: 'Customize the wording of every WhatsApp message the app sends — reminders, receipts, and more.',
      ur: 'ہر واٹس ایپ پیغام کے الفاظ یہاں سے کسٹمائز کریں — یاد دہانی، رسیدیں اور دیگر پیغامات۔'
    }
  }],
  wabot: [{
    id: 'wabot', icon: '🤖',
    title: { en: 'Ayesha — WhatsApp Bot', ur: 'عائشہ — واٹس ایپ بوٹ' },
    description: {
      en: 'Your AI assistant that answers customer questions on WhatsApp automatically. Manage its conversations and training here.',
      ur: 'آپ کا AI اسسٹنٹ جو واٹس ایپ پر کسٹمرز کے سوالات کا خودکار جواب دیتا ہے۔ اس کی گفتگو اور تربیت یہاں سے منظم کریں۔'
    }
  }],
  systemlogs: [{
    id: 'systemlogs', icon: '🗂️',
    title: { en: 'System Logs', ur: 'سسٹم لاگز' },
    description: {
      en: 'A full audit trail of logins, syncs and important changes — useful if something ever looks off.',
      ur: 'لاگ ان، سنک اور اہم تبدیلیوں کا مکمل ریکارڈ — اگر کبھی کچھ غلط لگے تو یہاں سے چیک کریں۔'
    }
  }],
  complaints: [{
    id: 'complaints', icon: '🎫',
    title: { en: 'Complaint Manager', ur: 'شکایات مینیجر' },
    description: {
      en: 'Log and resolve customer complaints end-to-end, so nothing slips through the cracks.',
      ur: 'کسٹمر کی شکایات درج کریں اور مکمل حل کریں تاکہ کوئی مسئلہ نظر انداز نہ ہو۔'
    }
  }],
  invoice: [{
    id: 'invoice', icon: '🧮',
    title: { en: 'Monthly Invoice', ur: 'ماہانہ انوائس' },
    description: {
      en: 'Generate this month\'s invoice for all customers in one go, instead of creating receipts one at a time.',
      ur: 'تمام کسٹمرز کے لیے اس مہینے کا انوائس ایک ہی بار میں بنائیں، ایک ایک کر کے رسید بنانے کے بجائے۔'
    }
  }],
};

interface TourGuideProps {
  steps: TourStep[];
  onClose: () => void;
  onSkipAll?: () => void;
}

const CARD_WIDTH = 320;

const TourGuide: React.FC<TourGuideProps> = ({ steps, onClose, onSkipAll }) => {
  const [idx, setIdx] = useState(0);
  const [lang, setLang] = useState<TourLang>(() => {
    try { return (localStorage.getItem(LANG_KEY) as TourLang) || 'en'; } catch { return 'en'; }
  });
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [resolvedStepId, setResolvedStepId] = useState<string | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const step = steps[idx];

  useEffect(() => {
    try { localStorage.setItem(LANG_KEY, lang); } catch {}
  }, [lang]);

  // Ask Layout to open the slide-out drawer while the "nav" step is active
  useEffect(() => {
    if (step?.id === 'nav') {
      window.dispatchEvent(new CustomEvent('myisp-tour-open-drawer'));
      return () => window.dispatchEvent(new CustomEvent('myisp-tour-close-drawer'));
    }
  }, [step?.id]);

  // Find + scroll the target element into view, then measure it.
  // `resolvedStepId` only flips to this step once we actually know whether a target
  // exists — this stops the tour from flashing the wrong modal type mid-transition.
  useLayoutEffect(() => {
    setCardPos(null);
    setRect(null);
    setResolvedStepId(null);
    if (!step) return;

    if (!step.targetId) { setResolvedStepId(step.id); return; }
    const el = document.getElementById(step.targetId);
    if (!el) { setResolvedStepId(step.id); return; }

    const update = () => { setRect(el.getBoundingClientRect()); setResolvedStepId(step.id); };
    // Bring it into the middle of the screen first (matters most on mobile),
    // then measure once the scroll/drawer animation has settled.
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t1 = setTimeout(update, 120);
    const t2 = setTimeout(update, 380);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [step?.id, step?.targetId]);

  // Once we know the target's position AND the card's real (rendered) size,
  // work out a spot that is 100% guaranteed to sit inside the viewport.
  useLayoutEffect(() => {
    if (!rect) { setCardPos(null); return; }
    const pad = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = Math.min(CARD_WIDTH, vw - pad * 2);
    const height = cardRef.current?.offsetHeight || 280;

    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;
    const placeBelow = spaceBelow >= height + pad || spaceBelow >= spaceAbove;

    let top = placeBelow ? rect.bottom + pad : rect.top - pad - height;
    // Hard clamp — no matter what the target's position is, the card always stays on screen
    top = Math.max(pad, Math.min(top, vh - height - pad));

    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(pad, Math.min(left, vw - width - pad));

    setCardPos({ top, left, width, maxHeight: vh - pad * 2 });
  }, [rect, step?.id, lang]);

  if (!step) return null;

  const isLast = idx === steps.length - 1;
  const isFirst = idx === 0;
  const multiStep = steps.length > 1;

  const finish = () => onClose();
  const handleNext = () => { if (isLast) finish(); else setIdx(i => i + 1); };
  const handleBack = () => setIdx(i => Math.max(0, i - 1));
  const toggleLang = () => setLang(l => (l === 'en' ? 'ur' : 'en'));

  const CardBody = (
    <div className="p-5 sm:p-7" dir={lang === 'ur' ? 'rtl' : 'ltr'} ref={cardRef}>
      <div className="flex items-center justify-between mb-4">
        {multiStep ? (
          <button onClick={onSkipAll} className="text-[9px] font-bold text-slate-400 hover:text-rose-500 uppercase tracking-widest transition-colors">
            {lang === 'en' ? 'Skip All' : 'سب چھوڑیں'}
          </button>
        ) : <span />}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleLang}
            className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 transition-colors"
            title="Change language"
          >
            {lang === 'en' ? 'اردو' : 'EN'}
          </button>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">✕</button>
        </div>
      </div>

      <div className="flex flex-col items-center text-center">
        <div className="w-16 h-16 rounded-[1.5rem] bg-indigo-600 flex items-center justify-center text-3xl mb-5 shadow-xl shadow-indigo-500/20">
          {step.icon}
        </div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2 tracking-tight">
          {step.title[lang]}
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
          {step.description[lang]}
        </p>
      </div>

      {multiStep && (
        <div className="flex items-center justify-center gap-1.5 mb-5">
          {steps.map((s, i) => (
            <span key={s.id} className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-6 bg-indigo-600' : 'w-1.5 bg-slate-300 dark:bg-slate-700'}`} />
          ))}
        </div>
      )}

      <div className="flex gap-2">
        {multiStep && !isFirst && (
          <button onClick={handleBack} className="px-5 py-3.5 rounded-2xl font-bold text-xs uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all active:scale-95">
            {lang === 'en' ? 'Back' : 'واپس'}
          </button>
        )}
        <button
          onClick={handleNext}
          className="flex-1 py-3.5 bg-indigo-600 hover:brightness-110 text-white rounded-2xl font-bold text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95"
        >
          {isLast ? (lang === 'en' ? 'Got it ✓' : 'سمجھ گیا ✓') : (lang === 'en' ? 'Next' : 'اگلا')}
        </button>
      </div>
    </div>
  );

  // Still figuring out whether this step has an on-screen target — render nothing
  // rather than briefly flashing the wrong modal type.
  if (resolvedStepId !== step.id) {
    return <div className="fixed inset-0 z-[600] no-print" />;
  }

  // Spotlight mode — element found, highlight it + place card near it (always fully on-screen)
  if (rect) {
    const ready = !!cardPos;
    const style: React.CSSProperties = ready
      ? { position: 'fixed', top: cardPos!.top, left: cardPos!.left, width: cardPos!.width, maxHeight: cardPos!.maxHeight, overflowY: 'auto' }
      : { position: 'fixed', top: 0, left: -9999, width: Math.min(CARD_WIDTH, window.innerWidth - 24), visibility: 'hidden' };

    return (
      <div className="fixed inset-0 z-[600] no-print">
        <div
          className="fixed pointer-events-none transition-all duration-300 rounded-2xl"
          style={{
            top: rect.top - 8, left: rect.left - 8, width: rect.width + 16, height: rect.height + 16,
            boxShadow: '0 0 0 9999px rgba(2,6,23,0.72)',
            border: '2px solid rgba(99,102,241,0.9)',
            opacity: ready ? 1 : 0,
          }}
        />
        <AnimatePresence mode="wait">
          <motion.div
            key={step.id}
            initial={ready ? { opacity: 0, scale: 0.95 } : false}
            animate={{ opacity: ready ? 1 : 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={style}
            className="bg-white dark:bg-slate-900 rounded-[1.75rem] border border-slate-200 dark:border-slate-800 shadow-2xl"
          >
            {CardBody}
          </motion.div>
        </AnimatePresence>
      </div>
    );
  }

  // Fallback — centered modal (used when there's no targetId, or the element isn't on screen)
  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-md no-print">
      <AnimatePresence mode="wait">
        <motion.div
          key={step.id}
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="w-full max-w-md max-h-[85vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-2xl"
        >
          {CardBody}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default TourGuide;

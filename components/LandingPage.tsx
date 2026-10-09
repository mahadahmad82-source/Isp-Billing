import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { logoBase64 } from '../utils/logoBase64';
import { supabase } from '../lib/supabase';
import { ensureWhatsAppBotPlan, fetchPricingPlans, DEFAULT_ISP_PLANS, type PricingPlan } from '../utils/pricing';
import {
  Zap, Smartphone, BarChart, Users, Globe,
  Check, ArrowRight, ShieldCheck, ChevronDown, CheckCircle,
  FileText, BarChart3, Calendar, Map,
  Play, Star, TrendingUp, Clock, CreditCard, MessageCircle, LockKeyhole,
  X, Menu, Wifi, Receipt, Bell, Fingerprint, HeadphonesIcon, Download, Database
} from 'lucide-react';

const BOT_NAME = 'NetBot';

interface LandingPageProps {
  onGetStarted: () => void;
}

// Fallback plans — used until (or unless) admin-edited plans load from Supabase,
// and whenever that fetch fails, so the pricing section never breaks/goes blank.
// Shared with the post-signup tier screen (components/Login.tsx) via utils/pricing.ts
// so the two screens can never show different tiers/prices again.
const DEFAULT_PRICING_PLANS: PricingPlan[] = ensureWhatsAppBotPlan(DEFAULT_ISP_PLANS);

// Pakistani number formatting for the hero count-up (1,24,500 style)
const formatPKR = (n: number): string => {
  const s = Math.max(0, Math.round(n)).toString();
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return 'Rs. ' + (rest ? rest + ',' + last3 : last3);
};

const countUp = (el: HTMLElement) => {
  const target = parseFloat(el.dataset.count || '0');
  const suffix = el.dataset.suffix || '';
  const plain = el.hasAttribute('data-plain');
  const dur = 1600;
  const t0 = performance.now();
  const fmtPlain = (n: number) => {
    if (!Number.isInteger(target)) return (Math.round(n * 10) / 10).toFixed(1);
    return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  };
  const fmt = (n: number) => (plain ? fmtPlain(n) : formatPKR(n)) + suffix;
  const tick = (t: number) => {
    const p = Math.min((t - t0) / dur, 1);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(target * e);
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = fmt(target);
  };
  requestAnimationFrame(tick);
};

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  const location = useLocation();
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [showSpecs, setShowSpecs] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  // Pricing plans — admin-editable via AdminDashboard, stored in Supabase
  // `site_settings.pricing_plans`. Starts with the known-good defaults so the
  // section always renders correctly even before the fetch resolves.
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>(DEFAULT_PRICING_PLANS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const plans = await fetchPricingPlans();
      if (!cancelled) setPricingPlans(plans);
    })();
    return () => { cancelled = true; };
  }, []);

  // Latest Android app releases (admin-uploaded via AdminDashboard → App Releases)
  interface AppReleaseInfo { app_key: 'wabot' | 'billcollector'; version: string; apk_url: string; file_size_mb: number | null; }
  const [latestReleases, setLatestReleases] = useState<Record<string, AppReleaseInfo>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('app_releases')
          .select('app_key,version,apk_url,file_size_mb,created_at')
          .order('created_at', { ascending: false });
        if (!cancelled && !error && Array.isArray(data)) {
          const latest: Record<string, AppReleaseInfo> = {};
          for (const row of data as any[]) {
            if (!latest[row.app_key]) latest[row.app_key] = row;
          }
          setLatestReleases(latest);
        }
      } catch {
        // Silently hide the download section if the fetch fails.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Scroll handler for routes
  useEffect(() => {
    const path = location.pathname;
    if (path === '/') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (path === '/features') {
      const el = document.getElementById('horizontal');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (path === '/about') {
      const el = document.getElementById('textReveal');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [location.pathname]);

  // Testimonial slider
  const testimonials = [
    {
      name: "Mahad Ahmad",
      role: "Founder, Bill Collector & Owner-Operator, MahadNet",
      location: "Pakistan",
      text: `I built Bill Collector because I was running my own ISP, MahadNet, off scattered spreadsheets and WhatsApp chats. Now every subscriber, receipt, and recovery ledger for MahadNet runs through this same dashboard — and ${BOT_NAME} handles the routine 'when's my bill due' questions on WhatsApp so I don't have to answer them one by one.`,
      rating: 5,
      avatarBg: "#6366f1"
    },
    {
      name: "Humza Rao",
      role: "Owner, Rajput Network",
      location: "Pakistan",
      text: "Rajput Network switched to Bill Collector for subscriber billing and WhatsApp renewal reminders. It's made tracking dues and staying on top of collections far less time-consuming for our team.",
      rating: 5,
      avatarBg: "#8b5cf6"
    }
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % testimonials.length);
    }, 8000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── DATA ───
  const missionText = "Bill Collector was built to empower local businesses with recurring billing through enterprise-grade billing automation, WhatsApp-powered recovery, and real-time cloud synchronization — all while keeping your data secure with AES-256 encryption and role-based access control.";

  const heroStats = [
    { target: "150", suffix: "+", label: "Active Businesses" },
    { target: "99.9", suffix: "%", label: "Uptime SLA" },
    { target: "50000", suffix: "+", label: "Customers Managed" },
    { target: "95", suffix: "%", label: "Recovery Rate" },
  ];

  const featuresList = [
    { title: 'Billing & Receipts', desc: 'Manage customer plans, record collections, and generate professional digital receipts for sharing with customers.', icon: <Receipt className="w-5 h-5" />, color: '#6366f1' },
    { title: 'WhatsApp Reminders', desc: 'Send personalized Urdu and English payment reminders with bill links directly to a customer\u2019s WhatsApp chat with a single tap.', icon: <Smartphone className="w-5 h-5" />, color: '#8b5cf6' },
    { title: 'Cloud Sync', desc: 'Enjoy lightning-fast operations with encrypted local storage coupled with real-time Supabase cloud sync. Your database is always backed up, secure, and accessible from any device.', icon: <LockKeyhole className="w-5 h-5" />, color: '#06b6d4' },
    { title: 'Recovery & Financial Tracking', desc: 'Review area-wise collections, recovery activity, pending balances, and outstanding dues in focused operational dashboards.', icon: <BarChart className="w-5 h-5" />, color: '#10b981' },
    { title: 'Agent Management', desc: 'Authorize collection staff with secure, restricted sub-accounts. Let agents collect outstanding dues, issue instant digital receipts, and record field expenses on the spot.', icon: <Users className="w-5 h-5" />, color: '#f59e0b' },
    { title: 'Network Operations', desc: 'Document service disruptions and maintenance downtime while keeping structured suspension records with reasons and dates.', icon: <Globe className="w-5 h-5" />, color: '#ec4899' },
    { title: 'Subscription Tiers', desc: 'Let businesses sign up online for the subscription tier that fits their operation and scale access as their needs grow.', icon: <CreditCard className="w-5 h-5" />, color: '#14b8a6' },
    { title: 'Admin Subscription Ledger', desc: 'Maintain a central subscription ledger with account status and receipts for admin-side tracking.', icon: <FileText className="w-5 h-5" />, color: '#f97316' },
    { title: `${BOT_NAME} AI Support`, desc: `Connect customers to ${BOT_NAME} for WhatsApp support, with multiple configurable voice-agent personas available on higher tiers.`, icon: <MessageCircle className="w-5 h-5" />, color: '#22c55e' },
  ];

  const infraFeatures = [
    { title: 'Customer Management', desc: 'Manage thousands of customer profiles with ease. Track package plans, billing cycles, expiration dates, outstanding dues, and customer addresses.', icon: <Users className="w-6 h-6" />, borderColor: '#6366f155', bg: 'linear-gradient(145deg, #6366f115, #6366f108 60%, transparent)' },
    { title: 'Digital Receipts', desc: 'Generate beautifully styled, brand-customized digital PDF invoice receipts automatically. Instantly share directly with customers via WhatsApp with zero setup.', icon: <FileText className="w-6 h-6" />, borderColor: '#8b5cf655', bg: 'linear-gradient(145deg, #8b5cf615, #8b5cf608 60%, transparent)' },
    { title: 'Recovery Ledger', desc: "An interactive master grid of your month's finances. Track pending dues, collected cash, outstanding balances, and daily recovery performance in one dashboard.", icon: <BarChart3 className="w-6 h-6" />, borderColor: '#06b6d455', bg: 'linear-gradient(145deg, #06b6d415, #06b6d408 60%, transparent)' },
    { title: 'Leads Pipeline', desc: 'Convert prospective customers into active subscribers. Track inquiries from initial contact to active service with status stages.', icon: <Zap className="w-6 h-6" />, borderColor: '#f59e0b55', bg: 'linear-gradient(145deg, #f59e0b15, #f59e0b08 60%, transparent)' },
    { title: 'Aging Report', desc: 'Identify chronic non-payers. Automatically categorizes outstanding bills into customizable aging buckets, helping you decide when to suspend service.', icon: <Calendar className="w-6 h-6" />, borderColor: '#ec489955', bg: 'linear-gradient(145deg, #ec489915, #ec489908 60%, transparent)' },
    { title: 'Area Dashboard', desc: 'Get deep business insight into your active areas and routes. Identify highly profitable neighborhoods, pending cash-flow zones, and localized customer growth.', icon: <Map className="w-6 h-6" />, borderColor: '#6366f155', bg: 'linear-gradient(145deg, #6366f115, #6366f108 60%, transparent)' },
    { title: 'Suspension Log', desc: 'Maintain a flawless history of inactive users. Log why a customer was suspended (unpaid, moving, support) and automatically track restoration dates.', icon: <LockKeyhole className="w-6 h-6" />, borderColor: '#8b5cf655', bg: 'linear-gradient(145deg, #8b5cf615, #8b5cf608 60%, transparent)' },
  ];

  const howItWorksSteps = [
    { step: 1, title: "Import Your Customers", desc: "Upload your existing Excel/CSV database in under 2 minutes. Customer names, packages, areas, and outstanding balances auto-map to our system.", icon: <Database className="w-6 h-6" />, color: "#6366f1" },
    { step: 2, title: "Set Up Auto-Billing", desc: "Configure monthly billing cycles, package prices, due dates, and late fees. The system auto-generates invoices at midnight on billing day.", icon: <Receipt className="w-6 h-6" />, color: "#8b5cf6" },
    { step: 3, title: "Send WhatsApp Reminders", desc: "With one tap, send personalized Urdu/English payment reminders via WhatsApp. Include digital receipt links and due date alerts.", icon: <MessageCircle className="w-6 h-6" />, color: "#06b6d4" },
    { step: 4, title: "Track & Collect Payments", desc: "Field agents log cash collections via mobile. Managers view real-time recovery dashboards. Auto-sync keeps everything in sync across all devices.", icon: <TrendingUp className="w-6 h-6" />, color: "#10b981" }
  ];

  const trustBadges = [
    { icon: <ShieldCheck className="w-5 h-5" />, label: "AES-256 Encryption", desc: "Bank-grade security" },
    { icon: <Clock className="w-5 h-5" />, label: "99.9% Uptime", desc: "SLA guaranteed" },
    { icon: <Fingerprint className="w-5 h-5" />, label: "Role-Based Access", desc: "Secure permissions" },
    { icon: <CreditCard className="w-5 h-5" />, label: "PKR Billing", desc: "Local currency support" },
    { icon: <Wifi className="w-5 h-5" />, label: "Offline Mode", desc: "Works without internet" },
    { icon: <HeadphonesIcon className="w-5 h-5" />, label: "24/7 Support", desc: "WhatsApp & Email" },
  ];

  const comparisonData = [
    { feature: "WhatsApp Reminders", billcollector: true, competitor1: false, competitor2: false },
    { feature: "Offline Mode", billcollector: true, competitor1: false, competitor2: true },
    { feature: "Equipment Tracker", billcollector: true, competitor1: false, competitor2: false },
    { feature: "Urdu Interface", billcollector: true, competitor1: false, competitor2: false },
    { feature: "Free Starter Plan", billcollector: true, competitor1: false, competitor2: false },
    { feature: "Aging Reports", billcollector: true, competitor1: true, competitor2: true },
    { feature: "Cloud Sync", billcollector: true, competitor1: true, competitor2: true },
  ];

  const faqs = [
    {
      q: "Which businesses is Bill Collector suitable for?",
      a: "Bill Collector is built for any local business with recurring billing — ISPs and internet providers today, with more industries (restaurants, water/RO, gyms, hostels) coming soon. It handles PKR billing, area and route-wise collections, flexible packages, and Urdu/English WhatsApp payment reminders."
    },
    {
      q: "How does the WhatsApp reminder feature work? Do I need a costly API key?",
      a: "No expensive API keys or monthly subscriptions are required! Bill Collector compiles pre-filled, personalized text templates (in English and Urdu) with secure billing links. You just tap the WhatsApp icon, and it instantly opens your customer's chat. Send invoices and reminders in literally 1 second."
    },
    {
      q: "Can I use it offline in remote areas where mobile data is weak?",
      a: "Yes! Bill Collector features encrypted local storage that functions perfectly without active internet. Your collection agents can record payments and write ledger entries while on the field. The moment they connect to a network, all offline operations automatically sync with the cloud."
    },
    {
      q: "Can I import my existing Excel/CSV records?",
      a: "Yes! We support direct bulk import for both .xlsx and .csv spreadsheets. You can upload your customer database, active package details, and outstanding balances in under 2 minutes. No manual re-typing required."
    },
    {
      q: "Can my field collection agents use it securely?",
      a: "Yes, easily! You can add sub-managers or recovery agents with custom role-based permissions. They can check active/expired statuses in their designated areas, log collected cash, and issue PDF receipts. They cannot view your total profits, system settings, or admin-level data."
    },
    {
      q: "How many customers can one account support?",
      a: "The Starter plan supports up to 50 active customers for free. To scale further, our Business plan supports unlimited customer accounts, complete device inventory trackers, leads pipeline, and advanced aging reports."
    },
    {
      q: "Is my data safe? What if my phone breaks?",
      a: "Your data is perfectly safe. Everything is securely stored using enterprise-grade AES-256 encryption and synchronized with secure, redundant cloud databases (Supabase). If your phone gets lost or broken, simply log in from another device to retrieve your complete database instantly."
    }
  ];

  const navLinks = [
    { path: '/', label: 'Home' },
    { path: '/features', label: 'Features' },
    { path: '/about', label: 'About' },
  ];

  // Scroll-driven animations: reveals, video play/pause, count-ups, chat pops
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const rio = new IntersectionObserver((es) => {
      es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); rio.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    root.querySelectorAll('.reveal').forEach(el => rio.observe(el));
    const vio = new IntersectionObserver((es) => {
      es.forEach(e => {
        const v = e.target as HTMLVideoElement;
        if (e.isIntersecting) { v.play().catch(() => {}); } else { v.pause(); }
      });
    }, { threshold: 0.25 });
    root.querySelectorAll('video.vbg').forEach(el => vio.observe(el));
    const cio = new IntersectionObserver((es) => {
      es.forEach(e => { if (e.isIntersecting) { countUp(e.target as HTMLElement); cio.unobserve(e.target); } });
    }, { threshold: 0.4 });
    root.querySelectorAll('[data-count]').forEach(el => cio.observe(el));
    const mio = new IntersectionObserver((es) => {
      es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('play'); mio.unobserve(e.target); } });
    }, { threshold: 0.3 });
    root.querySelectorAll('.shot, .screen').forEach(el => mio.observe(el));
    return () => { rio.disconnect(); vio.disconnect(); cio.disconnect(); mio.disconnect(); };
  }, []);

  return (
    <div ref={rootRef} className="bc-landing">

      <div className="mesh" aria-hidden="true" />

      {/* ── NAV ── */}
      <nav>
        <div className="nav-inner" style={{ position: 'relative' }}>
          <Link to="/" className="brand" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            {logoBase64 && <img src={logoBase64} alt="Bill Collector" />}
          </Link>
          <div className="nav-links">
            <a href="#who">Who it&apos;s for</a>
            <a href="#horizontal">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={onGetStarted} className="btn small" style={{ border: 'none', cursor: 'pointer' }}>Start free</button>
            <button className="mnav btn small ghost" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu"
              style={{ padding: '9px 12px' }}>
              {menuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
          {menuOpen && (
            <div className="mdrop">
              <a href="#who" onClick={() => setMenuOpen(false)}>Who it&apos;s for</a>
              <a href="#horizontal" onClick={() => setMenuOpen(false)}>Features</a>
              <a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
              <a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
            </div>
          )}
        </div>
      </nav>

      {/* ── HERO ── */}
      <header className="hero vband">
        <video className="vbg" muted loop playsInline autoPlay preload="metadata" poster="/landing/hero-poster.jpg">
          <source src="/landing/hero.mp4" type="video/mp4" />
        </video>
        <div className="vshade" />
        <div className="contentwrap"><div className="wrap">
          <div className="wrap hero-grid">
            <div>
              <div className="eyebrow reveal"><span className="dot" />Recurring-billing platform</div>
              <h1 className="reveal d1">Billing that <span className="grad">runs itself.</span></h1>
              <p className="lede reveal d2">BillCollector generates monthly bills, sends WhatsApp reminders, issues receipts and tracks recovery — for ISPs and internet providers — with more industries coming soon. From one dashboard, on any phone.</p>
              <div className="cta-row reveal d3">
                <button onClick={onGetStarted} className="btn" style={{ border: 'none', cursor: 'pointer' }}>Start free</button>
                <a className="btn ghost" href="#horizontal">See how it works</a>
              </div>
              <p className="hero-note reveal d3">Free to start · No card required · Works on Android &amp; web</p>
              <div className="trust-row reveal d3" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
                {trustBadges.slice(0, 4).map((badge, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 700, color: 'var(--ink)', background: 'rgba(255,255,255,.6)', border: '1px solid var(--glass-brd)', padding: '7px 13px', borderRadius: 999 }}>
                    <span style={{ color: '#4f46e5', display: 'inline-flex' }}>{badge.icon}</span>{badge.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="phone-stage reveal d2">
              <div className="phone">
                <div className="screen">
                  <div className="screen-top"><b>Dashboard</b><div className="avatar" /></div>
                  <div className="kpis">
                    <div className="kpi"><small>Collected</small><b data-count="124500">Rs. 0</b><span className="up">▲ this month</span></div>
                    <div className="kpi"><small>Pending</small><b data-count="38200">Rs. 0</b><span className="up" style={{ color: '#c0392b' }}>▼ 12% vs last</span></div>
                  </div>
                  <div className="bars">
                    <small>Collection · last 7 days</small>
                    <div className="bar-row">
                      <div className="bar" style={{ height: '42%' }} /><div className="bar" style={{ height: '68%' }} />
                      <div className="bar" style={{ height: '55%' }} /><div className="bar" style={{ height: '88%' }} />
                      <div className="bar" style={{ height: '74%' }} /><div className="bar" style={{ height: '96%' }} />
                      <div className="bar" style={{ height: '62%' }} />
                    </div>
                  </div>
                  <div className="due-list">
                    <div className="due"><div><b>Ahmed Raza</b><br /><span>Monthly · Fiber 20MB</span></div><span className="pill paid">Paid</span></div>
                    <div className="due"><div><b>Fatima Khan</b><br /><span>Monthly · Fiber 10MB</span></div><span className="pill duep">Due</span></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="stats reveal">
            {heroStats.map((s, i) => (
              <div className="stat" key={i}>
                <b data-count={s.target} data-suffix={s.suffix} data-plain="true">0</b>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
          <div className="scroll-cue">Scroll</div>
        </div></div>
      </header>

      {/* ── WHO IT'S FOR ── */}
      <section id="who">
        <div className="wrap">
          <div className="sec-label reveal">Who it&apos;s for</div>
          <h2 className="reveal d1">One platform.<br />Every recurring business.</h2>
          <p className="sec-sub reveal d2">Built for ISPs today — Restaurant, Water &amp; RO, Gyms and Hostels are coming soon.</p>
          <div className="biz-grid">
            <div className="biz reveal"><div className="ico"><svg viewBox="0 0 24 24"><path d="M5 12a10 10 0 0 1 14 0M8.5 15.5a5 5 0 0 1 7 0M12 19h.01" /></svg></div><b>Internet (ISP)</b><span>Monthly packages, due dates &amp; recovery</span><em className="live-tag">Available now</em></div>
            <div className="biz soon reveal d1"><div className="ico"><svg viewBox="0 0 24 24"><path d="M7 3v8M4 3v5a3 3 0 0 0 6 0V3M7 11v10M17 21V3c-2.5 1.5-4 4.5-4 8h4" /></svg></div><b>Restaurant</b><span>Regular customer tabs &amp; dues</span><em className="soon-tag">Coming soon</em></div>
            <div className="biz soon reveal d2"><div className="ico"><svg viewBox="0 0 24 24"><path d="M12 3c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z" /></svg></div><b>Water &amp; RO</b><span>Daily &amp; monthly billing, deliveries</span><em className="soon-tag">Coming soon</em></div>
            <div className="biz soon reveal d3"><div className="ico"><svg viewBox="0 0 24 24"><path d="M6 7v10M18 7v10M4 9h2M4 15h2M18 9h2M18 15h2M6 12h12" /></svg></div><b>Gyms</b><span>Memberships &amp; fee reminders</span><em className="soon-tag">Coming soon</em></div>
            <div className="biz soon reveal d3"><div className="ico"><svg viewBox="0 0 24 24"><path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 18h18M5 10V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4" /></svg></div><b>Hostels</b><span>Room rents &amp; monthly dues</span><em className="soon-tag">Coming soon</em></div>
          </div>
        </div>
      </section>

      {/* ── FEATURE CHAPTERS ── */}
      <section id="horizontal" style={{ paddingTop: 30 }}>
        <div className="wrap">
          <div className="sec-label reveal">Why teams switch</div>
          <h2 className="reveal d1">Scroll through<br />a month with BillCollector.</h2>
        </div>
      </section>

      <div className="vband vpad">
        <video className="vbg" muted loop playsInline preload="metadata" poster="/landing/billing-poster.jpg">
          <source src="/landing/billing.mp4" type="video/mp4" />
        </video>
        <div className="vshade" />
        <div className="wrap">
          <div className="chapter">
            <div className="txt reveal">
              <div className="sec-label">Chapter 01 · Billing</div>
              <h3>Bills generate themselves.</h3>
              <p>Set a plan once. Every month the bills appear on their own — correct amounts, correct dates, zero spreadsheets.</p>
              <ul>
                <li><span className="tick"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg></span>Monthly &amp; daily billing modes</li>
                <li><span className="tick"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg></span>Advances &amp; partial payments handled</li>
                <li><span className="tick"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg></span>Sub-managers &amp; riders see only their own</li>
              </ul>
            </div>
            <div className="vis reveal d1">
              <div className="shot">
                <div className="cap">November billing · auto-generated</div>
                <div className="receipt">
                  <div className="rhead"><b>Monthly Bill</b><span style={{ color: 'var(--muted)', fontSize: 12 }}>#R-000123</span></div>
                  <div className="rrow"><span>Package · Fiber 20MB</span><span>Rs. 1,500</span></div>
                  <div className="rrow"><span>Previous balance</span><span>Rs. 0</span></div>
                  <div className="rrow"><span>Discount</span><span>− Rs. 0</span></div>
                  <div className="rrow total"><span>Total due</span><span>Rs. 1,500</span></div>
                  <span className="rstamp">GENERATED AUTOMATICALLY</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="vband vpad">
        <video className="vbg" muted loop playsInline preload="metadata" poster="/landing/reminders-poster.jpg">
          <source src="/landing/reminders.mp4" type="video/mp4" />
        </video>
        <div className="vshade" />
        <div className="wrap">
          <div className="chapter flip">
            <div className="txt reveal">
              <div className="sec-label">Chapter 02 · Reminders</div>
              <h3>Reminders that actually get paid.</h3>
              <p>Polite WhatsApp reminders go out before and after the due date — in your customer&apos;s language. You just watch the paid list grow.</p>
              <ul>
                <li><span className="tick"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg></span>WhatsApp billing &amp; reminder templates</li>
                <li><span className="tick"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg></span>Due-date &amp; overdue follow-ups</li>
                <li><span className="tick"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg></span>Tap-to-call customer directory</li>
              </ul>
            </div>
            <div className="vis reveal d1">
              <div className="shot">
                <div className="cap">WhatsApp · reminder sent</div>
                <div className="msg me"><div className="who">BillCollector</div>Assalam-o-Alaikum! Your November bill of Rs. 1,500 is due on the 10th. Pay via JazzCash or at the office. — MahadNet</div>
                <div className="msg"><div className="who">Customer</div>Paid via JazzCash, screenshot attached 👍</div>
                <div className="msg me"><div className="who">BillCollector</div>Received. Receipt #R-000124 sent. Shukriya!</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="vband vpad">
        <video className="vbg" muted loop playsInline preload="metadata" poster="/landing/recovery-poster.jpg">
          <source src="/landing/recovery.mp4" type="video/mp4" />
        </video>
        <div className="vshade" />
        <div className="wrap">
          <div className="chapter">
            <div className="txt reveal">
              <div className="sec-label">Chapter 03 · Recovery</div>
              <h3>See every rupee, chase every due.</h3>
              <p>Live dashboards show collection, pending and recovery rate. Print a pending list for field recovery, or filter by route and rider.</p>
              <ul>
                <li><span className="tick"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg></span>Recovery rate &amp; collection trends</li>
                <li><span className="tick"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg></span>Printable pending lists for the field</li>
                <li><span className="tick"><svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg></span>Route, rider &amp; vehicle reports</li>
              </ul>
            </div>
            <div className="vis reveal d1">
              <div className="shot">
                <div className="cap">Recovery · this month</div>
                <div className="bars" style={{ marginBottom: 12 }}>
                  <small>Recovery rate</small>
                  <div style={{ fontSize: 34, fontWeight: 800, color: 'var(--navy)', margin: '8px 0 4px' }}>87%</div>
                  <div style={{ height: 10, background: '#eef1f5', borderRadius: 6, overflow: 'hidden' }}><div style={{ width: '87%', height: '100%', background: 'linear-gradient(90deg,#6366f1,#06b6d4)', borderRadius: 6 }} /></div>
                </div>
                <div className="due-list">
                  <div className="due"><div><b>Route A · Gulberg</b><br /><span>14 pending</span></div><span className="pill duep">Rs. 21,000</span></div>
                  <div className="due"><div><b>Route B · DHA</b><br /><span>6 pending</span></div><span className="pill duep">Rs. 9,000</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
<style>{`

  .bc-landing{ box-sizing:border-box; }
  :root{
    --navy:#0f172a; --teal:#6366f1; --gold:#8b5cf6; --cyan:#06b6d4;
    --ink:rgba(15,23,42,.92); --muted:rgba(15,23,42,.62);
    --glass:rgba(255,255,255,.58); --glass-brd:rgba(255,255,255,.75);
  }
  .bc-landing{ scroll-behavior:smooth; }
  .bc-landing{
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,"Helvetica Neue",Arial,sans-serif;
    color:var(--ink); overflow-x:hidden; background:#f7f4ef;
  }
  /* ---------- drifting pastel mesh ---------- */


  .wrap{ max-width:1120px; margin:0 auto; padding:0 22px; }
  .vband{ position:relative; overflow:hidden; }
  .vband video.vbg{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
  .vband .vshade{ position:absolute; inset:0; background:linear-gradient(180deg,rgba(247,244,239,.55),rgba(247,244,239,.32) 50%,rgba(247,244,239,.55)); }
  .vband > .wrap, .vband > .contentwrap{ position:relative; z-index:1; }
  .vpad{ padding:70px 0; }

  /* ---------- nav ---------- */
  .bc-landing nav{ position:fixed; top:14px; left:0; right:0; z-index:50; }
  .nav-inner{
    max-width:1120px; margin:0 auto; padding:10px 18px;
    display:flex; align-items:center; justify-content:space-between;
    background:var(--glass); border:1px solid var(--glass-brd); border-radius:18px;
    backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px);
    box-shadow:0 12px 40px rgba(15,23,42,.10);
    margin-left:16px; margin-right:16px;
  }
  @media(min-width:1160px){ .nav-inner{ margin-left:auto; margin-right:auto; } }
  .brand{ display:flex; align-items:center; gap:10px; font-weight:800; font-size:18px; color:var(--navy); text-decoration:none; }
  .brand img{ height:46px; width:auto; object-fit:contain; display:block; }
  .nav-links{ display:none; gap:26px; }
  .nav-links a{ text-decoration:none; color:var(--muted); font-size:14.5px; font-weight:600; }
  .nav-links a:hover{ color:var(--navy); }
  @media(min-width:760px){ .nav-links{ display:flex; } }
  .btn{
    display:inline-block; text-decoration:none; font-weight:700; font-size:15px;
    padding:12px 26px; border-radius:999px; border:none; cursor:pointer;
    background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff;
    box-shadow:0 10px 26px rgba(99,102,241,.35); transition:transform .2s, box-shadow .2s;
  }
  .btn:hover{ transform:translateY(-2px); box-shadow:0 14px 32px rgba(99,102,241,.42); }
  .btn.ghost{ background:rgba(255,255,255,.65); color:var(--navy); border:1px solid var(--glass-brd); box-shadow:0 8px 22px rgba(15,23,42,.10); backdrop-filter:blur(10px); }
  .btn.small{ padding:9px 20px; font-size:14px; }

  /* ---------- hero ---------- */
  .hero{ min-height:100svh; display:flex; align-items:center; padding:130px 0 60px; position:relative; }
  .hero-grid{ display:grid; gap:44px; align-items:center; }
  @media(min-width:900px){ .hero-grid{ grid-template-columns:1.05fr .95fr; } }
  .eyebrow{
    display:inline-flex; align-items:center; gap:8px; font-size:13px; font-weight:700; color:var(--teal);
    background:rgba(255,255,255,.6); border:1px solid var(--glass-brd); padding:8px 16px; border-radius:999px;
    backdrop-filter:blur(10px); margin-bottom:22px;
  }
  .eyebrow .dot{ width:8px;height:8px;border-radius:50%;background:var(--teal); box-shadow:0 0 0 4px rgba(99,102,241,.18); }
  .bc-landing h1{ font-size:clamp(38px,6.4vw,68px); line-height:1.04; letter-spacing:-1.5px; color:var(--navy); font-weight:800; }
  h1 .grad{ background:linear-gradient(120deg,#6366f1,#8b5cf6 55%,#06b6d4); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .lede{ margin-top:20px; font-size:clamp(16px,2.2vw,19px); line-height:1.65; color:var(--muted); max-width:34em; }
  .cta-row{ display:flex; gap:14px; margin-top:32px; flex-wrap:wrap; }
  .hero-note{ margin-top:18px; font-size:13.5px; color:var(--muted); }

  /* phone mockup */
  .phone-stage{ display:flex; justify-content:center; perspective:1200px; }
  .phone{
    width:min(320px,78vw); border-radius:44px; padding:12px;
    background:rgba(15,23,42,.92); box-shadow:0 40px 90px rgba(15,23,42,.35);
    transform:rotateY(-8deg) rotateX(4deg); animation:floaty 7s ease-in-out infinite;
  }
  @keyframes floaty{ 0%,100%{ transform:rotateY(-8deg) rotateX(4deg) translateY(0);} 50%{ transform:rotateY(-8deg) rotateX(4deg) translateY(-14px);} }
  .screen{ background:#f6f8fb; border-radius:34px; overflow:hidden; padding:18px 14px 22px; }
  .screen-top{ display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
  .screen-top b{ font-size:14px; color:var(--navy); }
  .avatar{ width:30px;height:30px;border-radius:50%; background:linear-gradient(135deg,#6366f1,#06b6d4); }
  .kpis{ display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:12px; }
  .kpi{ background:#fff; border-radius:14px; padding:12px; box-shadow:0 4px 14px rgba(15,23,42,.07); }
  .kpi small{ font-size:10px; color:var(--muted); font-weight:600; text-transform:uppercase; letter-spacing:.4px; }
  .kpi b{ display:block; font-size:16px; color:var(--navy); margin-top:4px; }
  .kpi .up{ font-size:10px; color:var(--teal); font-weight:700; }
  .bars{ background:#fff; border-radius:14px; padding:14px; box-shadow:0 4px 14px rgba(15,23,42,.07); }
  .bars small{ font-size:10px; color:var(--muted); font-weight:700; text-transform:uppercase; letter-spacing:.4px; }
  .bar-row{ display:flex; align-items:flex-end; gap:7px; height:74px; margin-top:10px; }
  .bar{ flex:1; border-radius:6px 6px 3px 3px; background:linear-gradient(180deg,#8b5cf6,#6366f1); }
  .bar:nth-child(odd){ background:linear-gradient(180deg,#a5b4fc,#06b6d4); }
  .due-list{ margin-top:12px; background:#fff; border-radius:14px; padding:6px 12px; box-shadow:0 4px 14px rgba(15,23,42,.07); }
  .due{ display:flex; justify-content:space-between; align-items:center; padding:9px 0; border-bottom:1px solid #eef1f5; font-size:12px; }
  .due:last-child{ border:none; }
  .due b{ color:var(--navy); } .due span{ color:var(--muted); }
  .pill{ font-size:10px; font-weight:700; padding:4px 10px; border-radius:999px; }
  .pill.paid{ background:#dcf5ec; color:#0b7a5c; } .pill.duep{ background:#fdeaea; color:#c0392b; }
  .scroll-cue{ position:absolute; bottom:26px; left:50%; transform:translateX(-50%); color:var(--muted); font-size:12px; font-weight:600; letter-spacing:1.5px; text-transform:uppercase; text-align:center; }
  .scroll-cue::after{ content:""; display:block; width:22px; height:36px; margin:10px auto 0; border:2px solid var(--muted); border-radius:12px; position:relative; }
  .scroll-cue::before{ content:""; position:absolute; left:50%; bottom:26px; width:4px; height:8px; margin-left:-2px; border-radius:4px; background:var(--teal); animation:wheel 1.8s infinite; }
  @keyframes wheel{ 0%{ transform:translateY(0); opacity:1;} 70%{ transform:translateY(12px); opacity:0;} 100%{ opacity:0;} }

  /* ---------- sections ---------- */
  .bc-landing section{ padding:90px 0; position:relative; }
  .sec-label{ font-size:13px; font-weight:800; letter-spacing:2px; text-transform:uppercase; color:var(--teal); margin-bottom:14px; }
  .bc-landing h2{ font-size:clamp(30px,4.6vw,48px); letter-spacing:-1px; line-height:1.1; color:var(--navy); font-weight:800; }
  .sec-sub{ margin-top:14px; color:var(--muted); font-size:17px; line-height:1.65; max-width:36em; }

  .reveal{ opacity:0; transform:translateY(36px); transition:opacity .8s ease, transform .8s cubic-bezier(.2,.7,.2,1); }
  .reveal.in{ opacity:1; transform:none; }
  .reveal.d1{ transition-delay:.08s; } .reveal.d2{ transition-delay:.16s; } .reveal.d3{ transition-delay:.24s; }

  /* business cards */
  .biz-grid{ display:grid; gap:18px; margin-top:44px; grid-template-columns:repeat(2,1fr); }
  @media(min-width:860px){ .biz-grid{ grid-template-columns:repeat(5,1fr); } }
  .biz{
    background:var(--glass); border:1px solid var(--glass-brd); border-radius:22px; padding:26px 18px; text-align:center;
    backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px);
    box-shadow:0 14px 40px rgba(15,23,42,.10); transition:transform .25s;
  }
  .biz:hover{ transform:translateY(-6px); }
  .biz.soon{ opacity:.8; }
  .biz .soon-tag, .biz .live-tag{ display:inline-block; margin-top:12px; font-style:normal; font-size:10.5px; font-weight:800; letter-spacing:1px; text-transform:uppercase; padding:5px 11px; border-radius:99px; }
  .biz .soon-tag{ background:rgba(139,92,246,.12); color:#6d28d9; border:1px solid rgba(139,92,246,.25); }
  .biz .live-tag{ background:rgba(16,185,129,.12); color:#0b7a5c; border:1px solid rgba(16,185,129,.28); }
  .biz .ico{ width:52px;height:52px; margin:0 auto 14px; border-radius:16px; display:flex; align-items:center; justify-content:center;
    background:linear-gradient(135deg,rgba(99,102,241,.14),rgba(6,182,212,.14)); }
  .biz .ico svg{ width:26px;height:26px; stroke:var(--teal); fill:none; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
  .biz b{ display:block; color:var(--navy); font-size:15.5px; margin-bottom:6px; }
  .biz span{ font-size:13px; color:var(--muted); line-height:1.5; display:block; }

  /* scrollytelling chapters */
  .chapter{ display:grid; gap:34px; align-items:center; margin-top:70px; }
  @media(min-width:900px){ .chapter{ grid-template-columns:1fr 1fr; } .chapter.flip .txt{ order:2; } .chapter.flip .vis{ order:1; } }
  .txt h3{ font-size:clamp(24px,3.4vw,36px); color:var(--navy); letter-spacing:-.5px; margin:12px 0 14px; font-weight:800; }
  .txt p{ color:var(--muted); font-size:16.5px; line-height:1.7; }
  .txt ul{ margin-top:18px; list-style:none; display:grid; gap:12px; }
  .txt li{ display:flex; gap:12px; align-items:flex-start; font-size:15px; color:var(--ink); font-weight:500; }
  .tick{ flex:none; width:24px;height:24px;border-radius:50%; background:rgba(99,102,241,.14); display:flex;align-items:center;justify-content:center; margin-top:1px;}
  .tick svg{ width:13px;height:13px; stroke:var(--teal); stroke-width:3; fill:none; stroke-linecap:round; stroke-linejoin:round; }
  .vis{ display:flex; justify-content:center; }
  .shot{
    width:min(420px,100%); border-radius:26px; padding:26px;
    background:var(--glass); border:1px solid var(--glass-brd);
    backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px);
    box-shadow:0 30px 70px rgba(15,23,42,.16);
  }
  .shot .cap{ font-size:12px; font-weight:800; letter-spacing:1.5px; text-transform:uppercase; color:var(--teal); margin-bottom:14px; }
  .msg{ background:#fff; border-radius:16px; padding:14px 16px; margin-bottom:10px; box-shadow:0 6px 18px rgba(15,23,42,.08); font-size:14px; line-height:1.55; color:var(--ink); }
  .msg .who{ font-size:11px; font-weight:800; color:var(--muted); text-transform:uppercase; letter-spacing:.6px; margin-bottom:6px; }
  .msg.me{ background:linear-gradient(135deg,#0E7C7B,#149a98); color:#fff; margin-left:34px; }
  .msg.me .who{ color:rgba(255,255,255,.75); }
  .receipt{ background:#fff; border-radius:14px; padding:18px; box-shadow:0 6px 18px rgba(15,23,42,.08); font-size:13.5px; }
  .receipt .rhead{ display:flex; justify-content:space-between; align-items:center; padding-bottom:12px; border-bottom:2px dashed #e5e9f0; margin-bottom:12px;}
  .receipt .rhead b{ color:var(--navy); font-size:15px; }
  .rrow{ display:flex; justify-content:space-between; padding:5px 0; color:var(--muted); }
  .rrow.total{ color:var(--navy); font-weight:800; font-size:15px; border-top:2px dashed #e5e9f0; margin-top:8px; padding-top:12px; }
  .rstamp{ display:inline-block; margin-top:12px; font-size:12px; font-weight:800; color:#0b7a5c; background:#dcf5ec; padding:6px 16px; border-radius:8px; letter-spacing:1px; }

  /* steps */
  .steps{ display:grid; gap:18px; margin-top:44px; }
  @media(min-width:860px){ .steps{ grid-template-columns:repeat(3,1fr); } }
  .step{ background:var(--glass); border:1px solid var(--glass-brd); border-radius:22px; padding:30px 26px; backdrop-filter:blur(16px); box-shadow:0 14px 40px rgba(15,23,42,.10); position:relative; }
  .step .n{ font-size:13px; font-weight:800; color:#fff; background:linear-gradient(135deg,#6366f1,#06b6d4); width:34px;height:34px; border-radius:12px; display:flex;align-items:center;justify-content:center; margin-bottom:16px; }
  .step b{ color:var(--navy); font-size:18px; display:block; margin-bottom:8px; }
  .step p{ color:var(--muted); font-size:14.5px; line-height:1.65; }

  /* final CTA */
  .cta-card{
    background:linear-gradient(135deg,#0f172a,#1e1b4b); border-radius:32px; padding:clamp(40px,7vw,80px) clamp(26px,6vw,70px);
    text-align:center; color:#fff; position:relative; overflow:hidden; box-shadow:0 40px 90px rgba(15,23,42,.35);
  }
  .cta-card::before{ content:""; position:absolute; width:480px;height:480px; border-radius:50%; background:radial-gradient(circle,rgba(99,102,241,.5),transparent 70%); left:-140px; top:-140px; }
  .cta-card::after{ content:""; position:absolute; width:480px;height:480px; border-radius:50%; background:radial-gradient(circle,rgba(6,182,212,.35),transparent 70%); right:-140px; bottom:-140px; }
  .cta-card h2{ color:#fff; position:relative; z-index:1; }
  .cta-card p{ color:rgba(255,255,255,.72); margin:16px auto 30px; max-width:32em; font-size:17px; line-height:1.65; position:relative; z-index:1; }
  .cta-card .cta-row{ justify-content:center; position:relative; z-index:1; }
  .btn.light{ background:#fff; color:var(--navy); box-shadow:0 12px 30px rgba(0,0,0,.25); }
  .btn.outline-w{ background:transparent; color:#fff; border:1.5px solid rgba(255,255,255,.4); box-shadow:none; }

  .bc-landing footer{ padding:44px 0 54px; text-align:center; color:var(--muted); font-size:13.5px; }
  .bc-landing footer .flogo{ display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:14px; color:var(--navy); font-weight:800; font-size:16px; }
  .bc-landing footer img{ height:58px; width:auto; }

  /* ===== entrance animations (JS-gated) ===== */
  .screen .bar{ transform:scaleY(0); transform-origin:bottom; }
  .screen.play .bar{ transform:scaleY(1); transition:transform 1.1s cubic-bezier(.2,.7,.2,1); }
  .screen.play .bar:nth-child(1){ transition-delay:.15s; }
  .screen.play .bar:nth-child(2){ transition-delay:.25s; }
  .screen.play .bar:nth-child(3){ transition-delay:.35s; }
  .screen.play .bar:nth-child(4){ transition-delay:.45s; }
  .screen.play .bar:nth-child(5){ transition-delay:.55s; }
  .screen.play .bar:nth-child(6){ transition-delay:.65s; }
  .screen.play .bar:nth-child(7){ transition-delay:.75s; }
  .screen .due{ opacity:0; transform:translateX(-14px); }
  .screen.play .due{ opacity:1; transform:none; transition:opacity .6s ease, transform .6s ease; }
  .screen.play .due:nth-child(1){ transition-delay:1s; }
  .screen.play .due:nth-child(2){ transition-delay:1.15s; }
  .shot .msg{ opacity:0; transform:translateY(16px) scale(.97); }
  .shot.play .msg{ animation:msgpop .55s cubic-bezier(.2,.9,.3,1.25) forwards; }
  .shot.play .msg:nth-child(2){ animation-delay:.3s; }
  .shot.play .msg:nth-child(3){ animation-delay:1s; }
  .shot.play .msg:nth-child(4){ animation-delay:1.7s; }
  @keyframes msgpop{ to{ opacity:1; transform:none; } }
  .shot .rstamp{ opacity:0; }
  .shot.play .rstamp{ animation:stamppop .6s cubic-bezier(.2,.9,.3,1.3) .9s forwards; }
  @keyframes stamppop{ from{ opacity:0; transform:scale(.5) rotate(-8deg); } 60%{ opacity:1; transform:scale(1.1) rotate(2deg); } to{ opacity:1; transform:scale(1) rotate(0); } }

  /* ---------- mesh background ---------- */
  .bc-landing{ position:relative; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,"Helvetica Neue",Arial,sans-serif; color:var(--ink); overflow-x:hidden; background:#f7f4ef; }
  .bc-landing .mesh{ position:fixed; inset:0; z-index:0; pointer-events:none;
    background:
      radial-gradient(700px 480px at 12% 8%, rgba(99,102,241,.14), transparent 60%),
      radial-gradient(640px 520px at 88% 12%, rgba(6,182,212,.13), transparent 60%),
      radial-gradient(760px 560px at 50% 100%, rgba(139,92,246,.12), transparent 60%);
  }
  .bc-landing .mesh::after{ content:""; position:absolute; inset:0; opacity:.5;
    background-image:radial-gradient(rgba(15,23,42,.06) 1px, transparent 1px); background-size:26px 26px;
    mask-image:radial-gradient(ellipse 90% 70% at 50% 30%, black, transparent); }
  .bc-landing > *:not(.mesh):not(nav){ position:relative; z-index:1; }

  /* ---------- mobile menu ---------- */
  .mnav{ display:none; }
  @media(max-width:759px){
    .nav-links{ display:none !important; }
    .mnav{ display:block; }
    .mdrop{ position:absolute; top:calc(100% + 10px); left:16px; right:16px; background:rgba(255,255,255,.92);
      border:1px solid var(--glass-brd); border-radius:18px; backdrop-filter:blur(18px);
      box-shadow:0 20px 50px rgba(15,23,42,.16); padding:10px; display:grid; gap:2px; }
    .mdrop a{ padding:12px 16px; border-radius:12px; text-decoration:none; color:var(--ink); font-weight:600; font-size:15px; }
    .mdrop a:hover{ background:rgba(99,102,241,.08); }
  }

  /* ---------- stats row ---------- */
  .stats{ display:grid; grid-template-columns:repeat(2,1fr); gap:14px; margin-top:44px; }
  @media(min-width:760px){ .stats{ grid-template-columns:repeat(4,1fr); } }
  .stat{ background:var(--glass); border:1px solid var(--glass-brd); border-radius:18px; padding:20px 16px; text-align:center;
    backdrop-filter:blur(14px); box-shadow:0 10px 30px rgba(15,23,42,.08); }
  .stat b{ display:block; font-size:clamp(24px,3.4vw,34px); font-weight:800; letter-spacing:-.5px;
    background:linear-gradient(120deg,#6366f1,#8b5cf6 60%,#06b6d4); -webkit-background-clip:text; background-clip:text; color:transparent; }
  .stat span{ font-size:12.5px; color:var(--muted); font-weight:600; }

  /* ---------- feature cards grid ---------- */
  .feat-grid{ display:grid; gap:16px; margin-top:44px; grid-template-columns:1fr; }
  @media(min-width:640px){ .feat-grid{ grid-template-columns:repeat(2,1fr); } }
  @media(min-width:1024px){ .feat-grid{ grid-template-columns:repeat(3,1fr); } }
  .feat{ background:var(--glass); border:1px solid var(--glass-brd); border-radius:22px; padding:26px 22px;
    backdrop-filter:blur(16px); box-shadow:0 14px 40px rgba(15,23,42,.10); transition:transform .25s; position:relative; overflow:hidden; }
  .feat:hover{ transform:translateY(-6px); }
  .feat .fico{ width:48px; height:48px; border-radius:15px; display:flex; align-items:center; justify-content:center; margin-bottom:16px; }
  .feat b{ display:block; color:var(--navy); font-size:16.5px; margin-bottom:8px; }
  .feat p{ color:var(--muted); font-size:14px; line-height:1.65; }

  /* ---------- comparison ---------- */
  .cmp{ width:100%; border-collapse:separate; border-spacing:0; background:var(--glass); border:1px solid var(--glass-brd);
    border-radius:22px; overflow:hidden; backdrop-filter:blur(16px); box-shadow:0 14px 40px rgba(15,23,42,.10); }
  .cmp th, .cmp td{ padding:15px 14px; font-size:14px; text-align:center; border-bottom:1px solid rgba(15,23,42,.07); }
  .cmp th{ font-size:11px; text-transform:uppercase; letter-spacing:1px; color:var(--muted); }
  .cmp td:first-child, .cmp th:first-child{ text-align:left; font-weight:600; color:var(--navy); }
  .cmp tr:last-child td{ border-bottom:none; }
  .cmp .me{ background:rgba(99,102,241,.07); font-weight:800; color:#4f46e5; }
  .cmpwrap{ overflow-x:auto; border-radius:22px; }
  .netbot-panel{ margin-top:22px; border-radius:24px; padding:28px; color:#fff; position:relative; overflow:hidden;
    background:linear-gradient(135deg,#0f172a,#1e1b4b); box-shadow:0 30px 70px rgba(15,23,42,.3); }
  .netbot-panel::before{ content:""; position:absolute; width:420px; height:420px; border-radius:50%;
    background:radial-gradient(circle,rgba(6,182,212,.3),transparent 70%); right:-120px; top:-120px; }
  .netbot-panel h3{ position:relative; z-index:1; font-size:22px; margin-bottom:10px; }
  .netbot-panel p{ position:relative; z-index:1; color:rgba(255,255,255,.72); font-size:15px; line-height:1.7; max-width:44em; }
  .netbot-tags{ position:relative; z-index:1; display:flex; flex-wrap:wrap; gap:8px; margin-top:16px; }
  .netbot-tags span{ font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:1px;
    border:1px solid rgba(255,255,255,.25); padding:7px 14px; border-radius:999px; color:#a5f3fc; }

  /* ---------- testimonials ---------- */
  .tslider{ position:relative; max-width:760px; margin:44px auto 0; }
  .tslide{ display:none; background:var(--glass); border:1px solid var(--glass-brd); border-radius:26px; padding:38px 34px;
    backdrop-filter:blur(18px); box-shadow:0 24px 60px rgba(15,23,42,.12); }
  .tslide.on{ display:block; animation:fadein .6s ease; }
  @keyframes fadein{ from{ opacity:0; transform:translateY(14px);} to{ opacity:1; transform:none;} }
  .tslide .stars{ color:#f59e0b; display:flex; gap:3px; margin-bottom:16px; }
  .tslide blockquote{ font-size:17px; line-height:1.7; color:var(--ink); }
  .tslide .who{ display:flex; align-items:center; gap:14px; margin-top:22px; }
  .tslide .ava{ width:48px; height:48px; border-radius:50%; display:flex; align-items:center; justify-content:center;
    color:#fff; font-weight:800; font-size:18px; }
  .tslide .who b{ display:block; color:var(--navy); font-size:15px; }
  .tslide .who span{ font-size:13px; color:var(--muted); }
  .tdots{ display:flex; gap:8px; justify-content:center; margin-top:20px; }
  .tdots button{ width:9px; height:9px; border-radius:50%; border:none; background:rgba(15,23,42,.18); cursor:pointer; padding:0; }
  .tdots button.on{ background:#6366f1; width:26px; border-radius:6px; }

  /* ---------- pricing ---------- */
  .plans{ display:grid; gap:20px; margin-top:48px; grid-template-columns:1fr; align-items:start; }
  @media(min-width:860px){ .plans{ grid-template-columns:repeat(3,1fr); } }
  .plan{ background:var(--glass); border:1px solid var(--glass-brd); border-radius:26px; padding:34px 28px;
    backdrop-filter:blur(18px); box-shadow:0 18px 50px rgba(15,23,42,.10); position:relative; transition:transform .25s; }
  .plan:hover{ transform:translateY(-6px); }
  .plan.hot{ border:2px solid #6366f1; box-shadow:0 24px 60px rgba(99,102,241,.22); }
  @media(min-width:860px){ .plan.hot{ transform:scale(1.04); } .plan.hot:hover{ transform:scale(1.04) translateY(-6px); } }
  .plan .pop{ position:absolute; top:-14px; left:50%; transform:translateX(-50%); background:linear-gradient(135deg,#6366f1,#8b5cf6);
    color:#fff; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:1.5px; padding:7px 18px; border-radius:999px; white-space:nowrap; }
  .plan .pname{ font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:2px; margin-bottom:12px; }
  .plan .price{ font-size:40px; font-weight:800; color:var(--navy); letter-spacing:-1px; }
  .plan .per{ font-size:14px; color:var(--muted); font-weight:600; }
  .plan ul{ list-style:none; margin:22px 0 28px; display:grid; gap:11px; }
  .plan li{ display:flex; gap:10px; align-items:flex-start; font-size:14px; color:var(--ink); }
  .plan li svg{ flex:none; width:17px; height:17px; margin-top:2px; }

  /* ---------- faq ---------- */
  .faq{ max-width:760px; margin:40px auto 0; display:grid; gap:12px; }
  .faq-item{ background:var(--glass); border:1px solid var(--glass-brd); border-radius:18px; backdrop-filter:blur(14px);
    box-shadow:0 10px 30px rgba(15,23,42,.08); overflow:hidden; }
  .faq-q{ width:100%; display:flex; justify-content:space-between; align-items:center; gap:14px; padding:20px 22px;
    background:none; border:none; cursor:pointer; text-align:left; font-size:15.5px; font-weight:700; color:var(--navy); }
  .faq-q svg{ flex:none; transition:transform .3s; color:#6366f1; }
  .faq-item.open .faq-q svg{ transform:rotate(180deg); }
  .faq-a{ max-height:0; overflow:hidden; transition:max-height .35s ease; }
  .faq-item.open .faq-a{ max-height:300px; }
  .faq-a p{ padding:0 22px 22px; color:var(--muted); font-size:14.5px; line-height:1.7; }

  /* ---------- download ---------- */
  .dl-grid{ display:grid; gap:18px; max-width:640px; margin:40px auto 0; grid-template-columns:1fr; }
  @media(min-width:640px){ .dl-grid{ grid-template-columns:1fr 1fr; } }
  .dl-card{ display:flex; flex-direction:column; align-items:center; gap:14px; padding:34px 26px; border-radius:24px;
    background:var(--glass); border:1px solid var(--glass-brd); backdrop-filter:blur(16px);
    box-shadow:0 14px 40px rgba(15,23,42,.10); text-decoration:none; transition:transform .25s; }
  .dl-card:hover{ transform:translateY(-6px); }
  .dl-card .dico{ width:62px; height:62px; border-radius:20px; display:flex; align-items:center; justify-content:center; }
  .dl-card b{ color:var(--navy); font-size:16px; }
  .dl-card span{ font-size:13px; color:var(--muted); }

  /* ---------- about ---------- */
  .about-card{ background:var(--glass); border:1px solid var(--glass-brd); border-radius:28px; padding:clamp(30px,5vw,60px);
    backdrop-filter:blur(18px); box-shadow:0 24px 60px rgba(15,23,42,.12); text-align:center; }

  /* ---------- footer ---------- */
  .fgrid{ display:grid; gap:36px; grid-template-columns:1fr; max-width:1120px; margin:0 auto; padding:0 22px; }
  @media(min-width:760px){ .fgrid{ grid-template-columns:2fr 1fr 1fr; } }
  .fgrid h4{ font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:2px; color:var(--muted); margin-bottom:18px; }
  .fgrid ul{ list-style:none; display:grid; gap:12px; }
  .fgrid ul a{ color:var(--ink); text-decoration:none; font-size:14.5px; font-weight:600; }
  .fgrid ul a:hover{ color:#4f46e5; }
  .fcontact{ display:flex; flex-direction:column; gap:10px; margin-top:20px; max-width:300px; }
  .fcontact a{ display:inline-flex; align-items:center; gap:10px; padding:11px 16px; border-radius:14px; font-size:13.5px;
    font-weight:700; text-decoration:none; }
  .fcontact .wa{ background:rgba(14,124,123,.12); border:1px solid rgba(14,124,123,.3); color:#0b6e6d; }
  .fcontact .em{ background:rgba(99,102,241,.1); border:1px solid rgba(99,102,241,.25); color:#4f46e5; }

  /* ---------- modals ---------- */
  @keyframes modalFadeIn{ from{ opacity:0; } to{ opacity:1; } }
  @keyframes modalScaleIn{ from{ transform:scale(.95) translateY(20px); opacity:0; } to{ transform:scale(1) translateY(0); opacity:1; } }
  .animate-fade-in{ animation:modalFadeIn .25s ease-out forwards; }
  .animate-scale-in{ animation:modalScaleIn .3s cubic-bezier(.34,1.56,.64,1) forwards; }

`}</style>

      {/* ── FEATURES GRID ── */}
      <section id="features">
        <div className="wrap">
          <div className="sec-label reveal">Platform</div>
          <h2 className="reveal d1">Everything to run<br />your billing operation.</h2>
          <p className="sec-sub reveal d2">Ten modules, one dashboard — built for the way local businesses actually collect.</p>
          <div className="feat-grid">
            {featuresList.map((f, i) => (
              <div className={"feat reveal " + (i % 3 === 1 ? "d1" : i % 3 === 2 ? "d2" : "")} key={i}>
                <div className="fico" style={{ background: f.color + '1a', color: f.color }}>{f.icon}</div>
                <b>{f.title}</b>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── INFRA ── */}
      <section id="infra" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="sec-label reveal">Core infrastructure</div>
          <h2 className="reveal d1">Deep tools<br />for serious recovery.</h2>
          <div className="feat-grid">
            {infraFeatures.map((inf, i) => (
              <div className={"feat reveal " + (i % 3 === 1 ? "d1" : i % 3 === 2 ? "d2" : "")} key={i}
                style={{ borderColor: inf.borderColor, background: inf.bg }}>
                <div className="fico" style={{ background: inf.borderColor.slice(0, -2) + '1a', color: inf.borderColor.slice(0, -2) }}>{inf.icon}</div>
                <b>{inf.title}</b>
                <p>{inf.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" style={{ paddingTop: 30 }}>
        <div className="wrap">
          <div className="sec-label reveal">How it works</div>
          <h2 className="reveal d1">Live in an afternoon.</h2>
          <p className="sec-sub reveal d2">From spreadsheet to fully automated billing in 4 simple steps. No technical expertise required.</p>
          <div className="steps" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
            {howItWorksSteps.map((s, i) => (
              <div className={"step reveal " + (i === 1 ? "d1" : i === 2 ? "d2" : i === 3 ? "d3" : "")} key={s.step}>
                <div className="n" style={{ background: "linear-gradient(135deg," + s.color + "," + s.color + "cc)" }}>{s.step}</div>
                <b>{s.title}</b>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
          <div className="reveal" style={{ marginTop: 36, textAlign: 'center' }}>
            <button onClick={onGetStarted} className="btn" style={{ border: 'none', cursor: 'pointer' }}>
              Get Started Now <ArrowRight className="w-4 h-4" style={{ display: 'inline', verticalAlign: '-2px', marginLeft: 6 }} />
            </button>
          </div>
        </div>
      </section>

      {/* ── COMPARISON ── */}
      <section id="compare" style={{ paddingTop: 30 }}>
        <div className="wrap">
          <div className="sec-label reveal">Comparison</div>
          <h2 className="reveal d1">Why teams<br />choose BillCollector.</h2>
          <div className="cmpwrap reveal d1" style={{ marginTop: 36 }}>
            <table className="cmp">
              <thead>
                <tr><th>Feature</th><th className="me">BillCollector</th><th>Others</th><th>Others</th></tr>
              </thead>
              <tbody>
                {comparisonData.map((row, i) => (
                  <tr key={i}>
                    <td>{row.feature}</td>
                    <td className="me">{row.billcollector ? <CheckCircle className="w-5 h-5" style={{ display: 'inline', color: '#4f46e5' }} /> : <X className="w-5 h-5" style={{ display: 'inline', color: '#cbd5e1' }} />}</td>
                    <td>{row.competitor1 ? <CheckCircle className="w-5 h-5" style={{ display: 'inline', color: '#10b981' }} /> : <X className="w-5 h-5" style={{ display: 'inline', color: '#cbd5e1' }} />}</td>
                    <td>{row.competitor2 ? <CheckCircle className="w-5 h-5" style={{ display: 'inline', color: '#10b981' }} /> : <X className="w-5 h-5" style={{ display: 'inline', color: '#cbd5e1' }} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="netbot-panel reveal">
            <h3>{BOT_NAME} — AI WhatsApp customer care</h3>
            <p>{BOT_NAME} is Bill Collector&apos;s AI WhatsApp customer-care service — designed for billing questions, technical support, complaints, and everyday customer assistance. Choose natural-sounding female voices and configure different support tones and voice-agent personas for the way your business communicates with customers.</p>
            <div className="netbot-tags"><span>WhatsApp Care</span><span>Female Voices</span><span>Custom Tones</span></div>
          </div>
        </div>
      </section>

      {/* ── ABOUT ── */}
      <section id="textReveal" style={{ paddingTop: 30 }}>
        <div className="wrap">
          <div className="about-card reveal">
            <div className="sec-label">Our mission</div>
            <h2 style={{ marginBottom: 18 }}>Built for Pakistan&apos;s<br />local businesses.</h2>
            <p style={{ color: 'var(--muted)', fontSize: 17, lineHeight: 1.75, maxWidth: '44em', margin: '0 auto' }}>{missionText}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 26 }}>
              {trustBadges.map((b, i) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: 'var(--ink)', background: 'rgba(255,255,255,.65)', border: '1px solid var(--glass-brd)', padding: '8px 14px', borderRadius: 999 }}>
                  <span style={{ color: '#4f46e5', display: 'inline-flex' }}>{b.icon}</span>{b.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section id="testimonials" style={{ paddingTop: 30 }}>
        <div className="wrap">
          <div className="sec-label reveal" style={{ textAlign: 'center' }}>Loved by owners</div>
          <h2 className="reveal d1" style={{ textAlign: 'center' }}>Real businesses.<br />Real recovery.</h2>
          <div className="tslider reveal d1">
            {testimonials.map((t, i) => (
              <div className={"tslide " + (i === currentSlide ? "on" : "")} key={i}>
                <div className="stars">{Array.from({ length: t.rating }).map((_, s) => <Star key={s} className="w-4 h-4" fill="currentColor" />)}</div>
                <blockquote>&ldquo;{t.text}&rdquo;</blockquote>
                <div className="who">
                  <div className="ava" style={{ background: t.avatarBg }}>{t.name.charAt(0)}</div>
                  <div><b>{t.name}</b><span>{t.role} · {t.location}</span></div>
                </div>
              </div>
            ))}
            <div className="tdots">
              {testimonials.map((_, i) => (
                <button key={i} className={i === currentSlide ? "on" : ""} onClick={() => setCurrentSlide(i)} aria-label={"Slide " + (i + 1)} />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ paddingTop: 30 }}>
        <div className="wrap" style={{ maxWidth: 1020 }}>
          <div className="sec-label reveal" style={{ textAlign: 'center' }}>Simple pricing</div>
          <h2 className="reveal d1" style={{ textAlign: 'center' }}>Choose your plan.</h2>
          <p className="sec-sub reveal d2" style={{ textAlign: 'center', margin: '14px auto 0' }}>Flexible billing subscription plans for local businesses of every size. No hidden charges.</p>
          <div className="plans">
            {pricingPlans.map((plan, i) => (
              <div className={"plan reveal " + (plan.highlight ? "hot" : "") + (i % 3 === 1 ? " d1" : i % 3 === 2 ? " d2" : "")} key={i}>
                {plan.highlight && <div className="pop">Most Popular</div>}
                <p className="pname" style={{ color: plan.color }}>{plan.name}</p>
                <div><span className="price">{plan.price}</span>{plan.period && <span className="per">/{plan.period}</span>}</div>
                <ul>
                  {plan.features.map((f, fi) => (
                    <li key={fi}><Check className="w-4 h-4" style={{ color: plan.color, flex: 'none', marginTop: 2 }} />{f}</li>
                  ))}
                </ul>
                <button
                  onClick={plan.name === 'Free' ? onGetStarted : () => window.open('https://wa.me/923042773453?text=I want to discuss the Bill Collector ' + plan.name + ' plan', '_blank')}
                  className="btn" style={{ width: '100%', border: 'none', cursor: 'pointer', textAlign: 'center' }}>
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
          <p className="reveal" style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, marginTop: 34, fontWeight: 600 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#10b981', marginRight: 8 }} />
            Built natively for Pakistan&apos;s growing local businesses.
          </p>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" style={{ paddingTop: 30 }}>
        <div className="wrap">
          <div className="sec-label reveal" style={{ textAlign: 'center' }}>FAQ</div>
          <h2 className="reveal d1" style={{ textAlign: 'center' }}>Questions, answered.</h2>
          <div className="faq">
            {faqs.map((f, i) => (
              <div className={"faq-item reveal " + (activeFaq === i ? "open" : "")} key={i}>
                <button className="faq-q" onClick={() => setActiveFaq(activeFaq === i ? null : i)}>
                  {f.q}
                  <ChevronDown className="w-5 h-5" />
                </button>
                <div className="faq-a"><p>{f.a}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DOWNLOAD ── */}
      {(latestReleases.billcollector || latestReleases.wabot) && (
        <section id="download-apps" style={{ paddingTop: 30 }}>
          <div className="wrap" style={{ textAlign: 'center' }}>
            <div className="sec-label reveal">Android apps</div>
            <h2 className="reveal d1">Manage on the go.</h2>
            <p className="sec-sub reveal d2" style={{ margin: '14px auto 0', textAlign: 'center' }}>Native Android apps for your billing dashboard and {BOT_NAME} inbox — no browser needed.</p>
            <div className="dl-grid">
              {latestReleases.billcollector && (
                <a href={latestReleases.billcollector.apk_url} target="_blank" rel="noopener noreferrer" className="dl-card reveal">
                  <div className="dico" style={{ background: 'rgba(99,102,241,.14)', color: '#4f46e5' }}><Smartphone className="w-8 h-8" /></div>
                  <div><b>Bill Collector Manager</b><br /><span>v{latestReleases.billcollector.version}{latestReleases.billcollector.file_size_mb ? " · " + latestReleases.billcollector.file_size_mb + " MB" : ''}</span></div>
                  <span className="btn small" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Download className="w-4 h-4" /> Download APK</span>
                </a>
              )}
              {latestReleases.wabot && (
                <a href={latestReleases.wabot.apk_url} target="_blank" rel="noopener noreferrer" className="dl-card reveal d1">
                  <div className="dico" style={{ background: 'rgba(14,124,123,.12)', color: '#0b7a5c' }}><MessageCircle className="w-8 h-8" /></div>
                  <div><b>{BOT_NAME}</b><br /><span>v{latestReleases.wabot.version}{latestReleases.wabot.file_size_mb ? " · " + latestReleases.wabot.file_size_mb + " MB" : ''}</span></div>
                  <span className="btn small" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Download className="w-4 h-4" /> Download APK</span>
                </a>
              )}
            </div>
            <p className="reveal" style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 22 }}>Direct APK download — enable &ldquo;Install from unknown sources&rdquo; if prompted.</p>
          </div>
        </section>
      )}

      {/* ── FINAL CTA ── */}
      <section id="start" style={{ paddingBottom: 110 }}>
        <div className="wrap">
          <div className="cta-card reveal">
            <h2>Stop chasing payments.<br />Start collecting.</h2>
            <p>Join 150+ local businesses already automating their billing. No credit card required. Setup takes less than 2 minutes.</p>
            <div className="cta-row">
              <button onClick={onGetStarted} className="btn light" style={{ border: 'none', cursor: 'pointer' }}>Create free account</button>
              <a className="btn outline-w" href="https://wa.me/923042773453?text=I%20want%20more%20information%20about%20Bill%20Collector" target="_blank" rel="noreferrer">Talk to us</a>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer>
        <div className="fgrid">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              {logoBase64 && <img src={logoBase64} alt="Bill Collector" style={{ height: 58, width: 'auto', objectFit: 'contain', display: 'block' }} />}
            </div>
            <p style={{ color: 'var(--muted)', fontSize: 14.5, lineHeight: 1.7, maxWidth: 340 }}>
              Pakistan&apos;s leading recurring-billing platform for local businesses. From small neighborhood businesses to growing enterprises — built for every subscription-style business.
            </p>
            <div className="fcontact">
              <a className="wa" href="https://wa.me/923042773453?text=I%20want%20more%20information%20about%20Bill%20Collector" target="_blank" rel="noreferrer">
                <MessageCircle className="w-4 h-4" /> WhatsApp: 0304-2773453
              </a>
              <a className="em" href="mailto:support@billcollector.online">support@billcollector.online</a>
            </div>
          </div>
          <div>
            <h4>Platform</h4>
            <ul>
              <li><a href="#horizontal">Features</a></li>
              <li><Link to="/about">About</Link></li>
              <li><a href="#pricing">Pricing</a></li>
              <li><a href="https://wa.me/923042773453" target="_blank" rel="noreferrer">Contact</a></li>
            </ul>
          </div>
          <div>
            <h4>Legal</h4>
            <ul>
              <li><Link to="/privacy">Privacy Policy</Link></li>
              <li><Link to="/terms">Terms of Service</Link></li>
              <li><Link to="/terms">Refund Policy</Link></li>
              <li><span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: '#0b7a5c', fontWeight: 700, fontSize: 13.5 }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />All Systems Operational
              </span></li>
            </ul>
          </div>
        </div>
        <div className="wrap" style={{ marginTop: 44, paddingTop: 26, borderTop: '1px solid rgba(15,23,42,.1)', display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' }}>
          <p style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.5 }}>© 2026 Bill Collector. All rights reserved.</p>
          <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5 }}>Built for Pakistani businesses · support@billcollector.online</p>
        </div>
      </footer>

      {/* ── DEMO MODAL ── */}
      {showDemoModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-fade-in"
          style={{ background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(8px)' }}
          onClick={() => setShowDemoModal(false)}>
          <div className="w-full max-w-3xl rounded-3xl overflow-hidden animate-scale-in" style={{ background: '#fff', boxShadow: '0 40px 90px rgba(15,23,42,.35)' }}
            onClick={e => e.stopPropagation()}>
            <div className="p-6 flex items-center justify-between" style={{ borderBottom: '1px solid #eef1f5' }}>
              <div>
                <h3 className="text-lg font-black uppercase tracking-wider" style={{ color: 'var(--navy)' }}>Product Demo</h3>
                <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>See Bill Collector in action</p>
              </div>
              <button onClick={() => setShowDemoModal(false)} className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors" style={{ background: '#f1f4f9', color: 'var(--muted)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6">
              <div className="aspect-video rounded-2xl flex items-center justify-center" style={{ background: '#f1f4f9', border: '1px solid #e5e9f0' }}>
                <div className="text-center">
                  <Play className="w-16 h-16 mx-auto mb-4" style={{ color: '#6366f1' }} />
                  <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>Demo video coming soon</p>
                  <p className="text-xs mt-2" style={{ color: 'var(--muted)' }}>Contact us for a live walkthrough</p>
                </div>
              </div>
              <div className="mt-6 flex justify-center">
                <a href="https://wa.me/923042773453?text=I%20want%20a%20live%20demo%20of%20Bill%20Collector"
                  target="_blank" rel="noreferrer" className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <MessageCircle className="w-4 h-4" /> Request Live Demo
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SPECS MODAL ── */}
      {showSpecs && (
        <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4 sm:p-6 animate-fade-in"
          style={{ background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(8px)' }}
          onClick={() => setShowSpecs(false)}>
          <div className="w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-scale-in" style={{ background: '#fff', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}>
            <div className="p-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #e0e7ff, #eef3fb)' }}>
              <div className="relative z-10 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                    <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">System Online</span>
                  </div>
                  <h2 className="text-2xl font-black uppercase tracking-tight" style={{ color: 'var(--navy)' }}>Bill Collector Platform Features</h2>
                  <p className="text-sm mt-1" style={{ color: '#6366f1' }}>Everything your business needs</p>
                </div>
                <button onClick={() => setShowSpecs(false)} className="text-2xl transition-colors" style={{ color: 'var(--muted)' }}>✕</button>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-2xl p-5" style={{ background: '#f8fafc', border: '1px solid #e5e9f0' }}>
                <h3 className="text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2" style={{ color: '#0b7a5c' }}>
                  <Zap className="w-3 h-3" /> Core Features
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {['Customer Management', 'Digital Receipt Generator', 'Monthly Recovery Ledger', 'Expiry Alerts (3/7/30 days)',
                    'Equipment / Device Tracker', 'Leads Pipeline', 'Receivable Aging Report', 'Area-wise Dashboard',
                    'Service Suspension Log', 'Network Outage Tracker', 'Business Expenses', 'Team / Agent Management',
                    'Smart Notifications', 'Cross-Device Cloud Sync', 'Role-Based Access', 'WhatsApp Reminder Links'].map((f, i) => (
                    <div key={i} className="text-xs font-medium py-1 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                      <Check className="w-3 h-3" style={{ color: '#10b981' }} /> {f}
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={() => { setShowSpecs(false); onGetStarted(); }} className="btn" style={{ width: '100%', border: 'none', cursor: 'pointer' }}>
                Get Started Free <ArrowRight className="w-4 h-4" style={{ display: 'inline', verticalAlign: '-2px', marginLeft: 6 }} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandingPage;

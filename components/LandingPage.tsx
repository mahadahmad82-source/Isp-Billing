import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { logoBase64 } from '../utils/logoBase64';
import { supabase } from '../lib/supabase';
import { ensureWhatsAppBotPlan, type PricingPlan } from '../utils/pricing';
import VideoBackground from './landing/VideoBackground';
import { 
  Zap, Smartphone, Lock, BarChart, Users, Globe, Cpu, Server, 
  Check, ArrowRight, Shield, ChevronDown, CheckCircle, Activity, 
  Database, ShieldCheck, Mail, FileText, BarChart3, Calendar, Map, Radio,
  Play, Star, TrendingUp, Clock, CreditCard, MessageCircle, Eye, LockKeyhole,
  ArrowUpRight, X, Menu, Wifi, Receipt, Bell, Fingerprint, HeadphonesIcon, Download
} from 'lucide-react';

interface LandingPageProps {
  onGetStarted: () => void;
}

// Fallback plans — used until (or unless) admin-edited plans load from Supabase,
// and whenever that fetch fails, so the pricing section never breaks/goes blank.
const DEFAULT_PRICING_PLANS: PricingPlan[] = ensureWhatsAppBotPlan([
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
]);

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeFaq, setActiveFaq] = useState<number | null>(null);
  const [showSpecs, setShowSpecs] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  // Pricing plans — admin-editable via AdminDashboard, stored in Supabase
  // `site_settings.pricing_plans`. Starts with the known-good defaults so the
  // section always renders correctly even before the fetch resolves.
  const [pricingPlans, setPricingPlans] = useState<PricingPlan[]>(DEFAULT_PRICING_PLANS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('site_settings')
          .select('pricing_plans')
          .eq('id', 'default')
          .maybeSingle();
        if (!cancelled && !error && Array.isArray(data?.pricing_plans) && data.pricing_plans.length > 0) {
          setPricingPlans(ensureWhatsAppBotPlan(data.pricing_plans as PricingPlan[]));
        }
      } catch {
        // Silently keep DEFAULT_PRICING_PLANS on any network/parse failure.
      }
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

  // Card Progress State
  const [activeCardIdx, setActiveCardIdx] = useState(0);

  // Scroll Progress
  const [scrollProgress, setScrollProgress] = useState(0);

  // Refs
  const heroRef = useRef<HTMLDivElement>(null);
  const heroContentRef = useRef<HTMLDivElement>(null);
  const heroIconsRef = useRef<HTMLDivElement>(null);
  const horizontalSectionRef = useRef<HTMLDivElement>(null);
  const cardsContainerRef = useRef<HTMLDivElement>(null);
  const countersContainerRef = useRef<HTMLDivElement>(null);
  const revealContainerRef = useRef<HTMLDivElement>(null);
  const wordRevealContainerRef = useRef<HTMLDivElement>(null);
  const orb1Ref = useRef<HTMLDivElement>(null);
  const orb2Ref = useRef<HTMLDivElement>(null);
  const howItWorksRef = useRef<HTMLDivElement>(null);
  const trustSectionRef = useRef<HTMLDivElement>(null);

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



  // General Scroll Event Listener
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? scrollTop / docHeight : 0;
      setScrollProgress(progress);

      // Hero Parallax (scroll animation)
      if (heroRef.current && heroContentRef.current) {
        if (scrollTop < window.innerHeight) {
          const p = scrollTop / window.innerHeight;
          heroContentRef.current.style.transform = `translateY(${scrollTop * 0.25}px) scale(${1 + p * 0.08})`;
          heroContentRef.current.style.opacity = `${Math.max(1 - p * 1.2, 0)}`;
        }
      }

      // Hero floating icons — Mahadnet-style scroll parallax (each icon moves at its own speed)
      if (heroIconsRef.current) {
        const icons = heroIconsRef.current.querySelectorAll<HTMLElement>('.hero-float-icon');
        icons.forEach((el) => {
          const speed = parseFloat(el.getAttribute('data-speed') || '0.2');
          if (scrollTop < window.innerHeight * 1.5) {
            el.style.transform = `translateY(${-scrollTop * speed}px)`;
          } else {
            el.style.transform = '';
          }
        });
      }

      // Horizontal Scroll (High-fidelity smooth card reveal with continuous parallax and center-highlighting)
      if (horizontalSectionRef.current && cardsContainerRef.current) {
        const section = horizontalSectionRef.current;
        const container = cardsContainerRef.current;
        const rect = section.getBoundingClientRect();
        
        // Use offsetTop traversal for a constant, drift-free calculation
        let sectionTop = 0;
        let el: HTMLElement | null = section;
        while (el) {
          sectionTop += el.offsetTop;
          el = el.offsetParent as HTMLElement;
        }
        
        const scrolledDistance = window.scrollY - sectionTop;
        const totalScrollableDistance = section.offsetHeight - window.innerHeight;
        const maxTranslate = container.scrollWidth - window.innerWidth;
        
        if (scrolledDistance >= 0 && totalScrollableDistance > 0 && maxTranslate > 0) {
          const progress = Math.min(1, Math.max(0, scrolledDistance / totalScrollableDistance));
          
          // Allocate 92% of the scroll track for translation, leaving a subtle 8% buffer at the end
          const translationProgress = progress;
          
          const translateX = translationProgress * maxTranslate;
          container.style.transform = `translateX(-${translateX}px)`;

          // Dynamically highlight the card closest to the horizontal center of the viewport
          const cards = container.querySelectorAll('.card');
          const viewportCenter = window.innerWidth / 2;
          let closestIdx = 0;
          let closestDist = Infinity;
          
          cards.forEach((card, idx) => {
            const cardRect = card.getBoundingClientRect();
            const cardCenter = cardRect.left + cardRect.width / 2;
            const dist = Math.abs(viewportCenter - cardCenter);
            if (dist < closestDist) {
              closestDist = dist;
              closestIdx = idx;
            }
          });

          cards.forEach((card, idx) => {
            if (idx === closestIdx) {
              (card as HTMLElement).style.transform = 'translateY(-6px) scale(1.02)';
              (card as HTMLElement).style.borderColor = 'rgba(99, 102, 241, 0.75)';
              (card as HTMLElement).style.boxShadow = '0 8px 20px -6px rgba(99, 102, 241, 0.3)';
            } else {
              (card as HTMLElement).style.transform = 'translateY(0px) scale(1)';
              (card as HTMLElement).style.borderColor = 'rgba(255, 255, 255, 0.08)';
              (card as HTMLElement).style.boxShadow = 'none';
            }
          });

          // Update active card index in state for our visual progress bar
          setActiveCardIdx(prev => {
            if (prev !== closestIdx) {
              return closestIdx;
            }
            return prev;
          });
        } else if (scrolledDistance < 0) {
          container.style.transform = `translateX(0px)`;
          const cards = container.querySelectorAll('.card');
          cards.forEach((card, idx) => {
            if (idx === 0) {
              (card as HTMLElement).style.transform = 'translateY(-6px) scale(1.02)';
              (card as HTMLElement).style.borderColor = 'rgba(99, 102, 241, 0.75)';
              (card as HTMLElement).style.boxShadow = '0 8px 20px -6px rgba(99, 102, 241, 0.3)';
            } else {
              (card as HTMLElement).style.transform = 'translateY(0px) scale(1)';
              (card as HTMLElement).style.borderColor = 'rgba(255, 255, 255, 0.08)';
              (card as HTMLElement).style.boxShadow = 'none';
            }
          });
          setActiveCardIdx(prev => prev !== 0 ? 0 : prev);
        } else if (maxTranslate > 0) {
          container.style.transform = `translateX(-${maxTranslate}px)`;
          const cards = container.querySelectorAll('.card');
          cards.forEach((card, idx) => {
            if (idx === 5) {
              (card as HTMLElement).style.transform = 'translateY(-6px) scale(1.02)';
              (card as HTMLElement).style.borderColor = 'rgba(99, 102, 241, 0.75)';
              (card as HTMLElement).style.boxShadow = '0 8px 20px -6px rgba(99, 102, 241, 0.3)';
            } else {
              (card as HTMLElement).style.transform = 'translateY(0px) scale(1)';
              (card as HTMLElement).style.borderColor = 'rgba(255, 255, 255, 0.08)';
              (card as HTMLElement).style.boxShadow = 'none';
            }
          });
          setActiveCardIdx(prev => prev !== 5 ? 5 : prev);
        }
      }

    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Mouse move for orbs
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (orb1Ref.current && orb2Ref.current) {
        const x = e.clientX / window.innerWidth;
        const y = e.clientY / window.innerHeight;
        orb1Ref.current.style.transform = `translate(${(x - 0.5) * 50}px, ${(y - 0.5) * 50}px)`;
        orb2Ref.current.style.transform = `translate(${(x - 0.5) * -40}px, ${(y - 0.5) * -40}px)`;
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Intersection Observers
  useEffect(() => {
    let countersObserver: IntersectionObserver | null = null;
    if (countersContainerRef.current) {
      const counterElements = countersContainerRef.current.querySelectorAll('.counter-number');
      countersObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            const target = parseFloat(el.getAttribute('data-target') || '0');
            const suffix = el.getAttribute('data-suffix') || '';
            const isDecimal = target % 1 !== 0;
            const duration = 2000;
            const startTime = performance.now();
            const update = (currentTime: number) => {
              const elapsed = currentTime - startTime;
              const progress = Math.min(elapsed / duration, 1);
              const eased = 1 - Math.pow(1 - progress, 3);
              const current = eased * target;
              el.textContent = (isDecimal ? current.toFixed(1) : Math.floor(current)) + suffix;
              if (progress < 1) requestAnimationFrame(update);
            };
            requestAnimationFrame(update);
            countersObserver?.unobserve(el);
          }
        });
      }, { threshold: 0.5 });
      counterElements.forEach(el => countersObserver?.observe(el));
    }

    let revealsObserver: IntersectionObserver | null = null;
    if (revealContainerRef.current) {
      const revealItems = revealContainerRef.current.querySelectorAll('.reveal-card, .fade-in, .scale-in');
      revealsObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            const indexAttr = target.getAttribute('data-index');
            if (indexAttr) {
              setTimeout(() => target.classList.add('visible'), parseInt(indexAttr) * 100);
            } else {
              target.classList.add('visible');
            }
            revealsObserver?.unobserve(target);
          }
        });
      }, { threshold: 0.1, rootMargin: '-20px' });
      revealItems.forEach(item => revealsObserver?.observe(item));
    }

    let wordRevealObserver: IntersectionObserver | null = null;
    if (wordRevealContainerRef.current) {
      wordRevealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.querySelectorAll('.word').forEach(w => w.classList.add('visible'));
            wordRevealObserver?.unobserve(entry.target);
          }
        });
      }, { threshold: 0.2, rootMargin: '-50px' });
      wordRevealObserver.observe(wordRevealContainerRef.current);
    }

    let generalRevealObserver: IntersectionObserver | null = null;
    const revealElements = document.querySelectorAll('.scroll-reveal');
    if (revealElements.length > 0) {
      generalRevealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            generalRevealObserver?.unobserve(entry.target);
          }
        });
      }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
      revealElements.forEach(el => generalRevealObserver?.observe(el));
    }

    // How it works observer
    let howItWorksObserver: IntersectionObserver | null = null;
    if (howItWorksRef.current) {
      const steps = howItWorksRef.current.querySelectorAll('.how-step');
      howItWorksObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const idx = parseInt((entry.target as HTMLElement).getAttribute('data-step') || '0');
            setTimeout(() => entry.target.classList.add('visible'), idx * 200);
            howItWorksObserver?.unobserve(entry.target);
          }
        });
      }, { threshold: 0.2 });
      steps.forEach(s => howItWorksObserver?.observe(s));
    }

    return () => {
      countersObserver?.disconnect();
      revealsObserver?.disconnect();
      wordRevealObserver?.disconnect();
      generalRevealObserver?.disconnect();
      howItWorksObserver?.disconnect();
    };
  }, []);

  // Testimonials Autoplay
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % testimonials.length);
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  // ─── DATA ───
  const missionText = "Bill Collector was built to empower Pakistani ISPs with enterprise-grade billing automation, WhatsApp-powered recovery, and real-time cloud synchronization — all while keeping your data secure with AES-256 encryption and role-based access control.";
  const words = missionText.split(' ');

  const testimonials = [
    {
      name: "Mahad Ahmad",
      role: "Founder, Bill Collector & Owner-Operator, MahadNet",
      location: "Pakistan",
      text: "I built Bill Collector because I was running my own ISP, MahadNet, off scattered spreadsheets and WhatsApp chats. Now every subscriber, receipt, and recovery ledger for MahadNet runs through this same dashboard — and NetBot handles the routine 'when's my bill due' questions on WhatsApp so I don't have to answer them one by one.",
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

  const featuresList = [
    { title: 'Billing & Receipts', desc: 'Manage subscriber plans, record collections, and generate professional digital receipts for sharing with customers.', icon: <Receipt className="w-5 h-5" />, color: '#6366f1' },
    { title: 'WhatsApp Reminders', desc: 'Send personalized Urdu and English payment reminders with bill links directly to a customer’s WhatsApp chat with a single tap.', icon: <Smartphone className="w-5 h-5" />, color: '#8b5cf6' },
    { title: 'Cloud Sync', desc: 'Enjoy lightning-fast operations with encrypted local storage coupled with real-time Supabase cloud sync. Your database is always backed up, secure, and accessible from any device.', icon: <Lock className="w-5 h-5" />, color: '#06b6d4' },
    { title: 'Recovery & Financial Tracking', desc: 'Review area-wise collections, recovery activity, pending balances, and outstanding dues in focused operational dashboards.', icon: <BarChart className="w-5 h-5" />, color: '#10b981' },
    { title: 'Agent Management', desc: 'Authorize collection staff with secure, restricted sub-accounts. Let agents collect outstanding dues, issue instant digital receipts, and record field expenses on the spot.', icon: <Users className="w-5 h-5" />, color: '#f59e0b' },
    { title: 'Network Operations', desc: 'Document fiber cuts, power outages, and maintenance downtime while keeping structured suspension records with reasons and dates.', icon: <Globe className="w-5 h-5" />, color: '#ec4899' },
    { title: 'Subscription Tiers', desc: 'Let ISPs sign up online for the subscription tier that fits their operation and scale access as their needs grow.', icon: <CreditCard className="w-5 h-5" />, color: '#14b8a6' },
    { title: 'Admin Subscription Ledger', desc: 'Maintain a central subscription ledger with account status and receipts for admin-side tracking.', icon: <FileText className="w-5 h-5" />, color: '#f97316' },
    { title: 'NetBot AI Support', desc: 'Connect customers to NetBot for WhatsApp support, with multiple configurable voice-agent personas available on higher tiers.', icon: <MessageCircle className="w-5 h-5" />, color: '#22c55e' },
    { title: 'CNIC-Based Login', desc: 'Provide customers with a secure CNIC-based login option for convenient access to the platform.', icon: <Fingerprint className="w-5 h-5" />, color: '#eab308' },
  ];

  const infraFeatures = [
    { title: 'Customer Management', desc: 'Manage thousands of customer profiles with ease. Track sub-nets, assigned IP addresses, package plans, expiration dates, and physical home coordinates.', icon: <Users className="w-6 h-6" />, borderColor: '#6366f155', bg: 'linear-gradient(145deg, #6366f115, #6366f108 60%, transparent)' },
    { title: 'Digital Receipts', desc: 'Generate beautifully styled, brand-customized digital PDF invoice receipts automatically. Instantly share directly with customers via WhatsApp with zero setup.', icon: <FileText className="w-6 h-6" />, borderColor: '#8b5cf655', bg: 'linear-gradient(145deg, #8b5cf615, #8b5cf608 60%, transparent)' },
    { title: 'Recovery Ledger', desc: "An interactive master grid of your month's finances. Track pending dues, collected cash, outstanding balances, and daily recovery performance in one dashboard.", icon: <BarChart3 className="w-6 h-6" />, borderColor: '#06b6d455', bg: 'linear-gradient(145deg, #06b6d415, #06b6d408 60%, transparent)' },
    { title: 'Equipment Tracker', desc: 'Keep a real-time count of your GPON/EPON ONUs, media converters, and TP-Link routers assigned to customers. Never lose track of expensive hardware inventory.', icon: <Server className="w-6 h-6" />, borderColor: '#10b98155', bg: 'linear-gradient(145deg, #10b98115, #10b98108 60%, transparent)' },
    { title: 'Leads Pipeline', desc: 'Convert prospective customers into subscribers. Track inquiries from initial phone calls to active fiber splicing and connection testing with status stages.', icon: <Zap className="w-6 h-6" />, borderColor: '#f59e0b55', bg: 'linear-gradient(145deg, #f59e0b15, #f59e0b08 60%, transparent)' },
    { title: 'Aging Report', desc: 'Identify chronic non-payers. Automatically categorizes outstanding bills into customizable aging buckets, helping you decide when to suspend lines.', icon: <Calendar className="w-6 h-6" />, borderColor: '#ec489955', bg: 'linear-gradient(145deg, #ec489915, #ec489908 60%, transparent)' },
    { title: 'Area Dashboard', desc: 'Get deep business insight into your active network areas. Identify highly profitable neighborhoods, pending cash-flow zones, and localized user count growth.', icon: <Map className="w-6 h-6" />, borderColor: '#6366f155', bg: 'linear-gradient(145deg, #6366f115, #6366f108 60%, transparent)' },
    { title: 'Suspension Log', desc: 'Maintain a flawless history of inactive users. Log why a customer was suspended (unpaid, moving, support) and automatically track restoration dates.', icon: <Lock className="w-6 h-6" />, borderColor: '#8b5cf655', bg: 'linear-gradient(145deg, #8b5cf615, #8b5cf608 60%, transparent)' },
    { title: 'Outage Tracker', desc: 'Log critical fiber cuts, power failures, or upstream bandwidth drops. Inform affected areas promptly and log down-time duration for upstream rebate claims.', icon: <Radio className="w-6 h-6" />, borderColor: '#06b6d455', bg: 'linear-gradient(145deg, #06b6d415, #06b6d408 60%, transparent)' },
  ];

  const howItWorksSteps = [
    {
      step: 1,
      title: "Import Your Customers",
      desc: "Upload your existing Excel/CSV database in under 2 minutes. Customer names, packages, areas, and outstanding balances auto-map to our system.",
      icon: <Database className="w-6 h-6" />,
      color: "#6366f1"
    },
    {
      step: 2,
      title: "Set Up Auto-Billing",
      desc: "Configure monthly billing cycles, package prices, due dates, and late fees. The system auto-generates invoices at midnight on billing day.",
      icon: <Receipt className="w-6 h-6" />,
      color: "#8b5cf6"
    },
    {
      step: 3,
      title: "Send WhatsApp Reminders",
      desc: "With one tap, send personalized Urdu/English payment reminders via WhatsApp. Include digital receipt links and due date alerts.",
      icon: <MessageCircle className="w-6 h-6" />,
      color: "#06b6d4"
    },
    {
      step: 4,
      title: "Track & Collect Payments",
      desc: "Field agents log cash collections via mobile. Managers view real-time recovery dashboards. Auto-sync keeps everything in sync across all devices.",
      icon: <TrendingUp className="w-6 h-6" />,
      color: "#10b981"
    }
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
      q: "Is Bill Collector suitable for Pakistani ISPs?", 
      a: "Absolutely! Bill Collector is built specifically for local Pakistani ISPs. It handles PKR billing currency, area-wise collection groups, local packages (e.g. 5Mbps, 10Mbps, 20Mbps Fiber), and localized Urdu/English payment alerts tailored to Pakistani subscribers." 
    },
    { 
      q: "How does the WhatsApp reminder feature work? Do I need a costly API key?", 
      a: "No expensive API keys or monthly subscriptions are required! Bill Collector compiles pre-filled, personalized text templates (in English and Urdu) with secure billing links. You just tap the WhatsApp icon, and it instantly opens your subscriber's chat. Send invoices and reminders in literally 1 second." 
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
      a: "The Starter plan supports up to 50 active subscribers for free. To scale further, our Business plan supports unlimited customer accounts, complete device inventory trackers, leads pipeline, and advanced aging reports." 
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

  return (
    <div className="landing-page min-h-screen font-sans relative bg-[#f4f7fc] text-slate-900 overflow-x-clip select-none">

      {/* ── STYLES ── */}
      <style>{`
        .figma-progress-bar {
          position: fixed; top: 0; left: 0;
          height: 3px;
          background: linear-gradient(90deg, #6366f1, #8b5cf6, #06b6d4);
          z-index: 1000;
          transform-origin: left;
          width: 100%;
        }
        .landing-nav-link {
          color: rgba(255, 255, 255, 0.7) !important;
          transition: color 0.3s;
          font-weight: 700;
        }
        .landing-nav-link:hover {
          color: #ffffff !important;
        }
        .landing-nav-link.active {
          color: #818cf8 !important;
        }
        .landing-mobile-link {
          color: rgba(255, 255, 255, 0.7) !important;
          transition: all 0.3s;
        }
        .landing-mobile-link:hover {
          color: #ffffff !important;
          background: rgba(255, 255, 255, 0.05) !important;
        }
        .landing-mobile-link.active {
          color: #818cf8 !important;
          background: rgba(99, 102, 241, 0.1) !important;
        }
        .hero {
          min-height: 100vh;
          padding: 150px 20px 100px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
        }
        .hero .orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(100px);
          opacity: 0.15;
          pointer-events: none;
        }
        .hero .orb-1 { width: 500px; height: 500px; background: #6366f1; top: -100px; left: -100px; }
        .hero .orb-2 { width: 400px; height: 400px; background: #a855f7; bottom: -100px; right: -100px; }
        .hero .orb-3 { width: 300px; height: 300px; background: #22d3ee; top: 30%; left: 60%; }
        .hero .grid-bg {
          position: absolute;
          inset: 0;
          opacity: 0.12;
          background-image: 
            linear-gradient(rgba(99,102,241,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,102,241,0.3) 1px, transparent 1px);
          background-size: 60px 60px;
          transform: perspective(500px) rotateX(60deg) scale(2.5);
          transform-origin: center bottom;
          pointer-events: none;
        }
        .hero-content {
          text-align: center;
          z-index: 10;
          padding: 0 20px;
        }
        .badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 20px;
          border-radius: 50px;
          background: rgba(255, 255, 255, 0.06);
          backdrop-filter: blur(16px) saturate(160%);
          -webkit-backdrop-filter: blur(16px) saturate(160%);
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08);
          margin-bottom: 24px;
        }
        .badge .dot {
          width: 8px; height: 8px;
          background: #22d3ee;
          border-radius: 50%;
          box-shadow: 0 0 0 0 rgba(34,211,238,0.7);
          animation: pulseRing 2s infinite;
        }
        @keyframes pulseRing {
          0% { box-shadow: 0 0 0 0 rgba(34,211,238,0.7); }
          70% { box-shadow: 0 0 0 12px rgba(34,211,238,0); }
          100% { box-shadow: 0 0 0 0 rgba(34,211,238,0); }
        }
        .badge span {
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.25em;
          color: rgba(255,255,255,0.8);
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        .hero h1 {
          font-size: clamp(2.1rem, 5.2vw, 4.75rem);
          font-weight: 900;
          line-height: 1.1;
          margin-bottom: 18px;
        }
        .hero h1 .gradient {
          background: linear-gradient(135deg, #67e8f9 0%, #a5b4fc 40%, #d8b4fe 80%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .hero p {
          color: #94a3b8;
          font-size: 1.1rem;
          max-width: 550px;
          margin: 0 auto;
          font-weight: 500;
        }
        .scroll-indicator {
          position: absolute;
          bottom: 40px;
          left: 50%;
          transform: translateX(-50%);
          text-align: center;
        }
        .scroll-indicator span {
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.3em;
          color: #64748b;
          font-weight: 700;
        }
        .scroll-indicator .arrow {
          margin-top: 8px;
          animation: bounce 2s infinite;
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(8px); }
        }
        @keyframes floatA {
          0%, 100% { transform: translate(0,0) rotate(0deg) scale(1); }
          50% { transform: translate(25px,-35px) rotate(8deg) scale(1.05); }
        }
        @keyframes floatB {
          0%, 100% { transform: translate(0,0) rotate(0deg) scale(1); }
          50% { transform: translate(-35px,25px) rotate(-8deg) scale(0.95); }
        }
        @keyframes floatC {
          0%, 100% { transform: translate(0,0) rotate(0deg) scale(1); }
          50% { transform: translate(20px,25px) rotate(6deg) scale(1.08); }
        }
        @keyframes floatD {
          0%, 100% { transform: translate(0,0) rotate(0deg) scale(1); }
          50% { transform: translate(-25px,-30px) rotate(-10deg) scale(1.03); }
        }
        @keyframes floatE {
          0%, 100% { transform: translate(0,0) rotate(0deg) scale(1); }
          50% { transform: translate(30px,-20px) rotate(12deg) scale(0.97); }
        }
        .hero-float-icon {
          position: absolute;
          border-radius: 1rem;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 0 15px rgba(34,211,238,0.12);
        }
        .glass-section {
          padding: 120px 24px;
          position: relative;
        }
        .glass-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 32px;
          max-width: 1200px;
          margin: 0 auto;
        }
        .glass-card {
          background: linear-gradient(145deg, rgba(34,211,238,0.07) 0%, rgba(99,102,241,0.08) 45%, rgba(168,85,247,0.06) 100%);
          backdrop-filter: blur(16px) saturate(160%);
          -webkit-backdrop-filter: blur(16px) saturate(160%);
          border: 1px solid rgba(148, 163, 184, 0.16);
          border-radius: 32px;
          padding: 40px;
          transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
          opacity: 0;
          transform: translateY(50px);
          position: relative;
          overflow: hidden;
        }
        .glass-card.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .glass-card:hover {
          background: linear-gradient(145deg, rgba(34,211,238,0.14) 0%, rgba(99,102,241,0.16) 45%, rgba(168,85,247,0.12) 100%);
          border-color: rgba(34, 211, 238, 0.4);
          transform: translateY(-10px);
          box-shadow: 0 30px 60px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(34, 211, 238, 0.08);
        }
        .glass-card .icon-box {
          width: 64px;
          height: 64px;
          border-radius: 20px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 32px;
          transition: transform 0.3s, box-shadow 0.3s;
        }
        .glass-card:hover .icon-box {
          transform: scale(1.1) rotate(5deg);
          box-shadow: 0 0 30px rgba(34, 211, 238, 0.18);
        }
        .glass-card h3 {
          color: #ffffff;
          font-size: 1.5rem;
          font-weight: 800;
          margin-bottom: 16px;
          letter-spacing: -0.02em;
        }
        .glass-card p {
          color: #94a3b8;
          font-size: 1rem;
          line-height: 1.7;
          margin: 0;
        }
        .glass-card .glow {
          position: absolute;
          top: 0; left: 0; width: 100%; height: 100%;
          background: radial-gradient(circle at top right, rgba(34,211,238,0.08), transparent 70%);
          pointer-events: none;
        }
        .card-top-row {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 18px;
        }
        .card-icon-badge {
          width: 60px;
          height: 60px;
          border-radius: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .card .num-badge {
          position: static;
          padding: 4px 10px;
          height: 26px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.05em;
        }
        .card h3 {
          font-size: 1.5rem;
          font-weight: 900;
          letter-spacing: 0.04em;
          color: #ffffff;
          margin-bottom: 16px;
          margin-top: 0;
          text-align: left;
          line-height: 1.2;
        }
        .card p {
          color: #cbd5e1;
          font-size: 1.1rem;
          font-weight: 500;
          line-height: 1.6;
          text-align: left;
          white-space: normal;
          word-break: break-word;
          margin: 0;
          flex: 1;
        }
        .card .glow-line {
          position: absolute;
          bottom: 0;
          left: 20px; right: 20px;
          height: 2px;
          border-radius: 9999px;
        }
        .counter-section {
          padding: 160px 24px;
          position: relative;
          overflow: hidden;
        }
        .counter-section .bg-glow {
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          width: 800px; height: 800px;
          border-radius: 50%;
          background: rgba(99,102,241,0.03);
          filter: blur(200px);
          pointer-events: none;
        }
        .counter-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 48px;
          max-width: 1000px;
          margin: 0 auto;
        }
        @media (min-width: 768px) {
          .counter-grid { grid-template-columns: repeat(4, 1fr); }
        }
        .counter-item { text-align: center; }
        .counter-item .number {
          font-size: clamp(2.5rem, 5vw, 4rem);
          font-weight: 900;
          margin-bottom: 8px;
        }
        .counter-item .label {
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.3em;
          color: #94a3b8;
        }
        .reveal-section {
          padding: 160px 24px;
          position: relative;
          overflow: hidden;
        }
        .reveal-grid {
          display: grid;
          grid-template-columns: repeat(1, 1fr);
          gap: 24px;
          max-width: 1100px;
          margin: 0 auto;
        }
        @media (min-width: 640px) { .reveal-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (min-width: 1024px) { .reveal-grid { grid-template-columns: repeat(3, 1fr); } }
        .reveal-card {
          padding: 32px;
          border-radius: 24px;
          border: 1px solid;
          position: relative;
          overflow: hidden;
          transition: transform 0.3s, box-shadow 0.3s;
          opacity: 0;
          transform: translateY(40px);
        }
        .reveal-card.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .reveal-card:hover {
          transform: translateY(-6px) scale(1.02);
        }
        .reveal-card .icon-box {
          width: 64px; height: 64px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          margin-bottom: 24px;
        }
        .reveal-card h3 {
          font-size: 1.25rem;
          font-weight: 900;
          color: white;
          margin-bottom: 8px;
        }
        .reveal-card p {
          color: #cbd5e1;
          font-size: 14px;
          font-weight: 500;
          line-height: 1.6;
        }
        .text-reveal-section {
          padding: 160px 24px;
          position: relative;
          overflow: hidden;
        }
        .text-reveal-section .bg-glow {
          position: absolute;
          top: 0; left: 50%;
          transform: translateX(-50%);
          width: 600px; height: 600px;
          border-radius: 50%;
          background: rgba(99,102,241,0.05);
          filter: blur(150px);
          pointer-events: none;
        }
        .text-content {
          max-width: 900px;
          margin: 0 auto;
        }
        .text-content h2 {
          font-size: clamp(1.5rem, 4vw, 3rem);
          font-weight: 900;
          line-height: 1.2;
          color: white;
        }
        .text-content .word {
          display: inline-block;
          margin-right: 0.3em;
          opacity: 0;
          transform: translateY(40px) rotateX(-40deg);
          transition: all 0.6s cubic-bezier(0.215, 0.61, 0.355, 1);
        }
        .text-content .word.visible {
          opacity: 1;
          transform: translateY(0) rotateX(0);
        }
        .parallax-section {
          height: 120vh;
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .parallax-bg {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(30,27,75,0.4), transparent, rgba(88,28,135,0.4));
        }
        .parallax-grid {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .parallax-grid-inner {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          max-width: 700px;
          width: 100%;
          padding: 0 24px;
        }
        .parallax-grid-inner .box {
          aspect-ratio: 1;
          border-radius: 24px;
          border: 1px solid rgba(99,102,241,0.15);
          background: rgba(99,102,241,0.05);
        }
        .parallax-content {
          position: relative;
          z-index: 10;
          text-align: center;
          padding: 0 24px;
        }
        .parallax-content h2 {
          font-size: clamp(2.5rem, 6vw, 5rem);
          font-weight: 900;
          line-height: 1;
        }
        .parallax-content h2 .gradient {
          background: linear-gradient(135deg, #67e8f9 0%, #a5b4fc 40%, #d8b4fe 80%);
        }
        .parallax-content p {
          color: #94a3b8;
          max-width: 400px;
          margin: 24px auto 0;
          font-weight: 500;
        }
        .marquee-section {
          padding: 128px 0;
          border-top: 1px solid rgba(255,255,255,0.05);
          border-bottom: 1px solid rgba(255,255,255,0.05);
          overflow: hidden;
        }
        .marquee-row {
          overflow: hidden;
          white-space: nowrap;
          padding: 16px 0;
        }
        .marquee-content {
          display: inline-block;
          animation: marquee 35s linear infinite;
        }
        .marquee-row.reverse .marquee-content {
          animation: marquee-reverse 45s linear infinite;
        }
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes marquee-reverse {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        .marquee-text {
          font-size: clamp(1.8rem, 3.5vw, 2.5rem);
          font-weight: 900;
          color: rgba(255,255,255,0.1);
          letter-spacing: -0.02em;
        }
        .interactive-section {
          padding: 160px 24px;
          position: relative;
          overflow: hidden;
        }
        .interactive-orb {
          position: absolute;
          border-radius: 50%;
          filter: blur(150px);
          pointer-events: none;
          transition: transform 0.3s ease-out;
        }
        .interactive-orb-1 {
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(99,102,241,0.15), rgba(139,92,246,0.08), transparent);
          top: -50px; right: -50px;
        }
        .interactive-orb-2 {
          width: 400px; height: 400px;
          background: radial-gradient(circle, rgba(6,182,212,0.1), rgba(16,185,129,0.05), transparent);
          bottom: -50px; left: -50px;
        }
        .section-header {
          text-align: center;
          margin-bottom: 80px;
        }
        .section-header .num {
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.35em;
          color: #818cf8;
        }
        .section-header h2 {
          font-size: clamp(2rem, 5vw, 3.5rem);
          font-weight: 900;
          color: white;
          margin-top: 16px;
          line-height: 1.1;
        }
        .section-header h2 .gradient {
          background: linear-gradient(135deg, #67e8f9 0%, #a5b4fc 40%, #d8b4fe 80%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        .section-header p {
          color: #94a3b8;
          max-width: 500px;
          margin: 16px auto 0;
          font-weight: 500;
        }
        .scroll-reveal {
          opacity: 0;
          transform: translateY(40px);
          transition: opacity 1.2s cubic-bezier(0.16, 1, 0.3, 1), transform 1.2s cubic-bezier(0.16, 1, 0.3, 1);
          will-change: opacity, transform;
        }
        .scroll-reveal.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .fade-in {
          opacity: 0;
          transform: translateY(30px);
          transition: all 0.8s ease-out;
        }
        .fade-in.visible {
          opacity: 1;
          transform: translateY(0);
        }
        .scale-in {
          opacity: 0;
          transform: scale(0.8);
          transition: all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .scale-in.visible {
          opacity: 1;
          transform: scale(1);
        }
        /* How It Works */
        .how-step {
          opacity: 0;
          transform: translateY(30px);
          transition: all 0.8s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .how-step.visible {
          opacity: 1;
          transform: translateY(0);
        }
        /* Comparison Table */
        .comparison-row:nth-child(even) {
          background: rgba(255,255,255,0.02);
        }
        /* Modal */
        @keyframes modalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes modalScaleIn {
          from { transform: scale(0.95) translateY(20px); opacity: 0; }
          to { transform: scale(1) translateY(0); opacity: 1; }
        }
        .animate-fade-in {
          animation: modalFadeIn 0.25s ease-out forwards;
        }
        .animate-scale-in {
          animation: modalScaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        @media (max-width: 640px) {
          .cards-container { padding: 0 20px; gap: 16px; }
          .card {
            width: 260px;
            height: 260px;
            min-width: 260px;
            min-height: 260px;
            padding: 18px;
            border-radius: 16px;
          }
          .card-top-row { margin-bottom: 12px; }
          .card-icon-badge { width: 36px; height: 36px; border-radius: 10px; }
          .card h3 { font-size: 0.95rem; margin-bottom: 8px; }
          .card p { font-size: 0.775rem; line-height: 1.5; }
          .section-label { left: 20px; top: 20px; }
        }
        @media (max-width: 768px) {
          .parallax-section {
            height: auto;
            min-height: 100vh;
          }
          .parallax-section .parallax-grid { display: none; }
        }
        @media (max-width: 640px) {
          .glass-section, .counter-section, .reveal-section,
          .text-reveal-section, .interactive-section, .marquee-section {
            padding-top: 80px;
            padding-bottom: 80px;
          }
          .counter-grid { gap: 24px; }
          .counter-item .number { font-size: clamp(2rem, 8.5vw, 4rem); }
          .section-header { margin-bottom: 48px; }
        }

        /* ── LIGHT MODE (Mahadnet midnight → light glass) ── */
        .landing-nav-link { color: rgba(15,23,42,0.7) !important; }
        .landing-nav-link:hover { color: #111827 !important; }
        .landing-nav-link.active { color: #4f46e5 !important; }
        .landing-mobile-link { color: rgba(15,23,42,0.7) !important; }
        .landing-mobile-link:hover { color: #111827 !important; background: rgba(15,23,42,0.05) !important; }
        .landing-mobile-link.active { color: #4f46e5 !important; background: rgba(79,70,229,0.1) !important; }
        .hero .orb { opacity: 0.2; }
        .hero .grid-bg {
          background-image:
            linear-gradient(rgba(15,23,42,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(15,23,42,0.06) 1px, transparent 1px);
        }
        .badge {
          background: rgba(255,255,255,0.8);
          border-color: rgba(15,23,42,0.08);
          box-shadow: 0 8px 32px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.9);
        }
        .badge span { color: #334155; }
        .hero h1 .gradient,
        .section-header h2 .gradient,
        .parallax-content h2 .gradient {
          background: linear-gradient(135deg, #06b6d4 0%, #6366f1 40%, #a855f7 80%);
        }
        .hero p { color: #475569; }
        .glass-card {
          background: rgba(255,255,255,0.78);
          border-color: rgba(15,23,42,0.08);
          box-shadow: 0 8px 32px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.9);
        }
        .glass-card:hover {
          background: rgba(255,255,255,0.95);
          border-color: rgba(99,102,241,0.4);
          box-shadow: 0 30px 60px -12px rgba(15,23,42,0.18), 0 0 40px rgba(99,102,241,0.08);
        }
        .glass-card h3 { color: #0f172a; }
        .glass-card p { color: #475569; }
        .glass-card .glow { background: radial-gradient(circle at top right, rgba(99,102,241,0.08), transparent 70%); }
        .counter-item .label { color: #64748b; }
        .section-header .num { color: #4f46e5; }
        .section-header h2 { color: #0f172a; }
        .section-header p { color: #475569; }
        .reveal-card h3 { color: #0f172a; }
        .reveal-card p { color: #475569; }
        .text-content h2 { color: #0f172a; }
        .parallax-bg { background: linear-gradient(180deg, rgba(99,102,241,0.12), transparent, rgba(168,85,247,0.12)); }
        .parallax-content h2 { color: #0f172a; }
        .parallax-content p { color: #475569; }
        .marquee-text { color: rgba(15,23,42,0.12); }
        .comparison-row:nth-child(even) { background: rgba(15,23,42,0.02); }
        .counter-section .bg-glow,
        .text-reveal-section .bg-glow { background: rgba(99,102,241,0.06); }
        section[id] { scroll-margin-top: 100px; }
      `}</style>

      {/* Progress Bar */}
      <div className="figma-progress-bar" style={{ transform: `scaleX(${scrollProgress})` }} />

      {/* Global Mahadnet mesh background (fixed, behind all sections) */}
      <VideoBackground variant="light" />

      <div className="relative z-10 flex flex-col min-h-screen">

        {/* ── NAVBAR ── */}
        <div className="fixed top-0 left-0 right-0 z-[100] px-4 md:px-8 pt-4">
          <nav className="glass-strong rounded-2xl px-4 sm:px-7 py-3 flex items-center justify-between max-w-7xl mx-auto shadow-xl shadow-slate-300/50">
            <div className="flex justify-between items-center w-full">
              <Link to="/" className="flex items-center gap-3 pl-1 sm:pl-2">
                {logoBase64 && <img src={logoBase64} alt="Bill Collector" className="w-[95px] sm:w-[130px] h-auto object-contain" />}
              </Link>

              <div className="hidden md:flex items-center gap-6 lg:gap-8 text-[11px] font-bold uppercase tracking-widest">
                {navLinks.map(link =>
                  link.path === '/features' ? (
                    <a key={link.path} href="#features" className="landing-nav-link">{link.label}</a>
                  ) : (
                    <Link key={link.path} to={link.path}
                      className={`landing-nav-link ${location.pathname === link.path ? 'active' : ''}`}>
                      {link.label}
                    </Link>
                  )
                )}
                <a href="#how-it-works" className="landing-nav-link">How It Works</a>
                <a href="#pricing" className="landing-nav-link">Pricing</a>
              </div>

              <div className="flex items-center gap-2 pr-1">
                <a href="/portal"
                  className="hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-xl text-indigo-600 text-[10px] font-black uppercase tracking-widest border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition-all"
                >
                  <Users className="w-3.5 h-3.5 text-indigo-500" /> User Portal
                </a>
                <button onClick={onGetStarted}
                  className="cta-glow px-3.5 sm:px-5 py-2.5 rounded-xl text-white text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2"
                >
                  <LockKeyhole className="w-3.5 h-3.5" /> Manager Login
                </button>
                <button onClick={() => setMenuOpen(o => !o)}
                  className="md:hidden flex flex-col gap-1.5 p-2 rounded-full hover:bg-white/5 ml-1">
                  <span className={`block w-5 h-0.5 bg-slate-900 transition-all ${menuOpen ? 'rotate-45 translate-y-2' : ''}`}/>
                  <span className={`block w-5 h-0.5 bg-slate-900 transition-all ${menuOpen ? 'opacity-0' : ''}`}/>
                  <span className={`block w-5 h-0.5 bg-slate-900 transition-all ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`}/>
                </button>
              </div>
            </div>
          </nav>
        </div>

        {/* Mobile Menu */}
        {menuOpen && (
          <div className="fixed top-[92px] left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-7xl z-[99] bg-[#040814]/98 border border-white/10 rounded-[24px] shadow-2xl flex flex-col md:hidden overflow-hidden">
            {navLinks.map(link =>
              link.path === '/features' ? (
                <a key={link.path} href="#features" onClick={() => setMenuOpen(false)}
                  className="px-6 py-4 text-xs font-bold uppercase tracking-widest border-b border-white/5 landing-mobile-link">
                  {link.label}
                </a>
              ) : (
                <Link key={link.path} to={link.path} onClick={() => setMenuOpen(false)}
                  className={`px-6 py-4 text-xs font-bold uppercase tracking-widest border-b border-white/5 landing-mobile-link ${location.pathname === link.path ? 'active' : ''}`}>
                  {link.label}
                </Link>
              )
            )}
            <a href="#how-it-works" onClick={() => setMenuOpen(false)} className="px-6 py-4 text-xs font-bold uppercase tracking-widest border-b border-white/5 landing-mobile-link">How It Works</a>
            <a href="#pricing" onClick={() => setMenuOpen(false)} className="px-6 py-4 text-xs font-bold uppercase tracking-widest border-b border-white/5 landing-mobile-link">Pricing</a>
            <a href="/portal" onClick={() => setMenuOpen(false)} className="px-6 py-4 text-xs font-bold text-indigo-400 flex items-center gap-2">
              <Users className="w-4 h-4" /> User Portal
            </a>
          </div>
        )}

        {/* ── SECTION 1: HERO ── */}
        <section className="hero" id="hero" ref={heroRef}>
          <div className="orb orb-1"></div>
          <div className="orb orb-2"></div>
          <div className="orb orb-3"></div>
          <div className="grid-bg"></div>

          {/* Floating glass icon cards — Mahadnet hero signature */}
          <div ref={heroIconsRef} className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
            <div className="hero-float-icon glass w-14 h-14 md:w-20 md:h-20 top-[24%] left-[3%] md:top-[10%] md:left-[8%]" data-speed="0.35">
              <Wifi className="w-6 h-6 md:w-8 md:h-8 text-cyan-300" />
            </div>
            <div className="hero-float-icon glass w-12 h-12 md:w-16 md:h-16 top-[16%] right-[4%] md:right-[10%] hidden sm:flex" data-speed="0.2">
              <Cpu className="w-5 h-5 md:w-7 md:h-7 text-purple-300" />
            </div>
            <div className="hero-float-icon glass w-12 h-12 md:w-16 md:h-16 bottom-[12%] left-[6%] md:left-[12%] hidden sm:flex" data-speed="-0.3">
              <Zap className="w-5 h-5 md:w-7 md:h-7 text-yellow-300" />
            </div>
            <div className="hero-float-icon glass w-14 h-14 md:w-18 md:h-18 bottom-[16%] right-[6%] md:right-[14%] hidden sm:flex" data-speed="0.28">
              <Activity className="w-6 h-6 md:w-8 md:h-8 text-indigo-300" />
            </div>
            <div className="hero-float-icon glass w-16 h-16 top-[28%] right-[24%] hidden lg:flex" data-speed="-0.18">
              <Database className="w-6 h-6 text-teal-300" />
            </div>
            <div className="hero-float-icon glass w-16 h-16 bottom-[26%] left-[26%] hidden lg:flex" data-speed="0.24">
              <Globe className="w-6 h-6 text-emerald-300" />
            </div>
            <div className="hero-float-icon glass w-16 h-16 top-[40%] left-[14%] hidden md:flex" data-speed="-0.35">
              <Server className="w-6 h-6 text-pink-300" />
            </div>
            <div className="hero-float-icon glass w-16 h-16 bottom-[24%] right-[4%] md:bottom-[34%] md:right-[20%]" data-speed="0.4">
              <Receipt className="w-6 h-6 text-blue-300" />
            </div>
            <div className="hero-float-icon glass w-14 h-14 md:w-16 md:h-16 top-[56%] left-[2%] md:left-[4%] hidden sm:flex" data-speed="-0.22">
              <MessageCircle className="w-6 h-6 md:w-7 md:h-7 text-green-300" />
            </div>
          </div>

          <div className="hero-content" ref={heroContentRef}>
            <div className="badge scroll-reveal">
              <div className="dot"></div>
              <span>Trusted by 150+ Pakistani ISPs</span>
            </div>
            <h1 className="scroll-reveal">
              THE FUTURE OF<br/>
              <span className="gradient">ISP BILLING</span><br/>
              IN PAKISTAN
            </h1>
            <p className="mt-3 text-slate-300 text-sm sm:text-base leading-relaxed scroll-reveal max-w-2xl mx-auto">
              Automate invoices, send WhatsApp payment reminders, track equipment, and manage your entire subscriber network — all from one secure, cloud-synced dashboard built exclusively for Pakistani Internet Service Providers.
            </p>

            {/* Trust Badges Row */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3 scroll-reveal">
              {trustBadges.slice(0, 4).map((badge, i) => {
                const c = ['#0891b2', '#4f46e5', '#9333ea', '#059669'][i];
                return (
                  <div key={i} className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-[10px] font-bold text-slate-800"
                    style={{ background: `${c}14`, border: `1px solid ${c}40` }}>
                    <span style={{ color: c }}>{badge.icon}</span>
                    {badge.label}
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4 scroll-reveal">
              <button onClick={onGetStarted}
                className="cta-glow w-full sm:w-auto h-14 px-8 rounded-2xl font-black text-xs uppercase tracking-[0.25em] flex items-center justify-center gap-3 text-white"
              >
                Start Free Trial <ArrowRight className="w-4 h-4" />
              </button>
              <button onClick={() => setShowDemoModal(true)}
                className="glass w-full sm:w-auto h-14 px-8 rounded-2xl font-black text-xs uppercase tracking-[0.25em] flex items-center justify-center gap-3 text-slate-900 hover:bg-white/60 transition-all active:scale-95"
              >
                <Play className="w-4 h-4 text-cyan-300" /> Watch Demo
              </button>
            </div>

            <p className="mt-3 text-[10px] text-slate-500 font-bold uppercase tracking-widest scroll-reveal">
              No credit card required · Free for 50 customers · Setup in 2 minutes
            </p>
          </div>

          <div className="scroll-indicator">
            <span>Scroll to explore</span>
            <div className="arrow">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mx-auto text-slate-400">
                <path d="M7 13l5 5 5-5M7 6l5 5 5-5"/>
              </svg>
            </div>
          </div>
        </section>

        {/* ── SECTION 1.5: TRUST STRIP ── */}
        <section className="py-6 px-6 border-y border-white/5" ref={trustSectionRef}>
          <div className="relative overflow-hidden">
            <div className="marquee-row py-2">
              <div className="marquee-content whitespace-nowrap flex items-center">
                {[0, 1].map(dup => (
                  <div key={dup} className="inline-flex items-center">
                    {trustBadges.map((badge, i) => (
                      <span key={i} className="inline-flex items-center gap-2.5 mx-8 text-slate-500 text-xs font-bold uppercase tracking-[0.2em]">
                        <span className="text-indigo-400">{badge.icon}</span>
                        {badge.label}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── SECTION 2: GLASSMORPHISM CAPABILITIES ── */}
        <section className="glass-section" id="features">
          <div className="max-w-4xl mx-auto text-center mb-20 scroll-reveal">
            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-400">02 / Core Modules</span>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 mt-4">
              Premium <span className="bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">Capabilities</span>
            </h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto mt-6">
              Everything you need to automate your ISP billing, recovery, and network management in one powerful platform.
            </p>
          </div>

          <div className="glass-grid px-6">
            {featuresList.map((feat, i) => (
              <div key={i} className="glass-card scroll-reveal" data-index={i}>
                <div className="glow"></div>
                <div className="icon-box" style={{ color: feat.color, background: `${feat.color}14`, border: `1px solid ${feat.color}40` }}>
                  {feat.icon}
                </div>
                <h3>{feat.title}</h3>
                <p>{feat.desc}</p>
                <div className="mt-8 flex items-center justify-between">
                  <span className="text-[10px] font-black text-white/20 tracking-widest uppercase">0{i+1}</span>
                  <div className="h-px flex-1 mx-4 bg-white/5"></div>
                  <div className="w-2 h-2 rounded-full" style={{ background: feat.color }}></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── SECTION 3: LIVE COUNTERS ── */}
        <section className="counter-section scroll-reveal" id="counters">
          <div className="bg-glow"></div>
          <div className="section-header max-w-4xl mx-auto" ref={revealContainerRef}>
            <div className="num fade-in">03 / Live Metrics</div>
            <h2 className="fade-in">Trusted at <span className="gradient">Scale</span></h2>
            <p className="fade-in">Real numbers from real Pakistani ISPs using Bill Collector every day.</p>
          </div>
          <div className="counter-grid" ref={countersContainerRef}>
            <div className="counter-item">
              <div className="number counter-number grad-text" data-target="150" data-suffix="+">0</div>
              <div className="label">Active ISPs</div>
            </div>
            <div className="counter-item">
              <div className="number counter-number grad-text" data-target="99.9" data-suffix="%">0</div>
              <div className="label">Uptime SLA</div>
            </div>
            <div className="counter-item">
              <div className="number counter-number grad-text" data-target="50000" data-suffix="+">0</div>
              <div className="label">Subscribers Managed</div>
            </div>
            <div className="counter-item">
              <div className="number counter-number grad-text" data-target="95" data-suffix="%">0</div>
              <div className="label">Recovery Rate</div>
            </div>
          </div>
        </section>

        {/* ── SECTION 3.5: HOW IT WORKS ── */}
        <section className="py-24 px-6 border-t border-white/5 scroll-reveal" id="how-it-works" ref={howItWorksRef}>
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-400">03.5 / Getting Started</span>
              <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 mt-4">
                How It <span className="bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">Works</span>
              </h2>
              <p className="text-slate-400 text-sm max-w-lg mx-auto mt-4">
                From spreadsheet to fully automated billing in 4 simple steps. No technical expertise required.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {howItWorksSteps.map((step) => (
                <div key={step.step} data-step={step.step - 1} className="how-step relative p-6 rounded-3xl glass hover:bg-white/10 transition-all group">
                  <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full flex items-center justify-center text-xs font-black text-white"
                    style={{ background: step.color }}>
                    {step.step}
                  </div>
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: `${step.color}15`, color: step.color }}>
                    {step.icon}
                  </div>
                  <h3 className="text-lg font-black text-slate-900 mb-2">{step.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">{step.desc}</p>
                </div>
              ))}
            </div>

            <div className="mt-12 text-center">
              <button onClick={onGetStarted}
                className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-indigo-600/20">
                Get Started Now <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>

        {/* ── SECTION 4: STAGGER REVEALS ── */}
        <section className="reveal-section scroll-reveal" id="reveals">
          <div className="section-header max-w-4xl mx-auto">
            <div className="num">04 / Platform</div>
            <h2>Core <span className="gradient">Infrastructure</span></h2>
            <p>Everything you need to run a professional ISP billing operation.</p>
          </div>
          <div className="reveal-grid max-w-7xl mx-auto px-6" ref={revealContainerRef}>
            {infraFeatures.map((infra, idx) => (
              <div key={idx} className="reveal-card" data-index={idx}
                style={{ borderColor: infra.borderColor, background: infra.bg }}>
                <div className="icon-box" style={{ background: `${infra.borderColor.slice(0, -2)}15`, border: `1px solid ${infra.borderColor}`, color: infra.borderColor.slice(0, -2) }}>
                  {infra.icon}
                </div>
                <h3>{infra.title}</h3>
                <p>{infra.desc}</p>
                <div style={{ position: 'absolute', bottom: 0, left: 24, right: 24, height: '1px', background: `linear-gradient(90deg, ${infra.borderColor.slice(0, -2)}40, transparent)` }}></div>
              </div>
            ))}
          </div>
        </section>

        {/* ── SECTION 4.5: COMPETITIVE COMPARISON ── */}
        <section className="py-24 px-6 border-t border-white/5 scroll-reveal">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-16">
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-400">04.5 / Comparison</span>
              <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-slate-900 mt-4">
                Why Choose <span className="bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">Bill Collector?</span>
              </h2>
              <p className="text-slate-400 text-sm max-w-lg mx-auto mt-4">
                See how we stack up against other ISP billing platforms in Pakistan.
              </p>
            </div>

            <div className="mb-8 rounded-3xl border border-cyan-500/20 bg-cyan-500/5 p-6 sm:p-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-500 mb-2">NetBot / WhatsApp Customer Care</p>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900">Purpose-built support for your subscribers</h3>
                  <p className="text-sm leading-relaxed text-slate-600 mt-3 max-w-3xl">
                    NetBot is Bill Collector’s AI WhatsApp customer-care service — designed for billing questions, technical support, complaints, and everyday subscriber assistance. Choose natural-sounding female voices and configure different support tones and voice-agent personas for the way your ISP communicates with customers.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 sm:max-w-xs sm:justify-end">
                  <span className="rounded-full border border-cyan-500/20 bg-white/60 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-cyan-700">WhatsApp Care</span>
                  <span className="rounded-full border border-cyan-500/20 bg-white/60 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-cyan-700">Female Voices</span>
                  <span className="rounded-full border border-cyan-500/20 bg-white/60 px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-cyan-700">Custom Tones</span>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md overflow-x-auto">
              <div className="grid grid-cols-4 gap-4 p-6 border-b border-white/10 bg-white/5 min-w-[520px]">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Feature</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-indigo-400 text-center">Bill Collector</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Others</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Others</div>
              </div>
              {comparisonData.map((row, i) => (
                <div key={i} className="comparison-row grid grid-cols-4 gap-4 p-4 border-b border-white/5 items-center min-w-[520px]">
                  <div className="text-sm font-bold text-slate-900">{row.feature}</div>
                  <div className="flex justify-center">
                    {row.billcollector ? (
                      <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <Check className="w-4 h-4 text-emerald-400" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                        <X className="w-4 h-4 text-red-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex justify-center">
                    {row.competitor1 ? (
                      <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <Check className="w-4 h-4 text-emerald-400" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                        <X className="w-4 h-4 text-red-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex justify-center">
                    {row.competitor2 ? (
                      <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <Check className="w-4 h-4 text-emerald-400" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                        <X className="w-4 h-4 text-red-400" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── SECTION 5: WORD-BY-WORD TEXT REVEAL ── */}
        <section className="text-reveal-section" id="textReveal">
          <div className="bg-glow"></div>
          <div className="text-content text-center px-6">
            <div className="num" style={{ fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.35em', color: '#818cf8', marginBottom: '24px' }}>
              05 / Our Mission
            </div>
            <div ref={wordRevealContainerRef} className="max-w-4xl mx-auto text-left leading-relaxed">
              <h2 className="text-xl sm:text-4xl font-black text-slate-900 leading-tight flex flex-wrap justify-center">
                {words.map((word, i) => (
                  <span key={i} className="word inline-block mr-2" style={{ transitionDelay: `${i * 35}ms` }}>
                    {word}
                  </span>
                ))}
              </h2>
            </div>
            <div style={{ marginTop: '48px', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.3), transparent)' }}></div>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-slate-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> AES-256 Encryption
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-slate-300">
                <LockKeyhole className="w-4 h-4 text-emerald-400" /> Role-Based Access
              </div>
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-slate-300">
                <Database className="w-4 h-4 text-emerald-400" /> Automated Backups
              </div>
            </div>
          </div>
        </section>

        {/* ── SECTION 7: MARQUEE ── */}
        <section className="marquee-section" id="marquee">
          <div className="section-header mb-12">
            <div className="num">07 / Platform Highlights</div>
            <h2 className="text-2xl sm:text-4xl font-black">Endless Automation</h2>
          </div>
          <div className="marquee-row">
            <div className="marquee-content whitespace-nowrap">
              <span className="marquee-text">✦ BILLING & RECEIPTS · WHATSAPP REMINDERS · SUBSCRIPTION TIERS · NETBOT AI SUPPORT · AREA DASHBOARD · EQUIPMENT TRACKER · SUSPENSION LOG · LEADS PIPELINE ✦ </span>
              <span className="marquee-text">✦ BILLING & RECEIPTS · WHATSAPP REMINDERS · SUBSCRIPTION TIERS · NETBOT AI SUPPORT · AREA DASHBOARD · EQUIPMENT TRACKER · SUSPENSION LOG · LEADS PIPELINE ✦ </span>
            </div>
          </div>
          <div className="marquee-row reverse">
            <div className="marquee-content whitespace-nowrap">
              <span className="marquee-text" style={{ fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', color: 'rgba(255,255,255,0.05)' }}>
                ✦ billing & receipts · WhatsApp reminders · subscription tiers · NetBot AI support · area dashboard · equipment tracker · suspension log · leads pipeline ✦ 
              </span>
              <span className="marquee-text" style={{ fontSize: 'clamp(1.5rem, 3vw, 2.5rem)', color: 'rgba(255,255,255,0.05)' }}>
                ✦ billing & receipts · WhatsApp reminders · subscription tiers · NetBot AI support · area dashboard · equipment tracker · suspension log · leads pipeline ✦ 
              </span>
            </div>
          </div>
        </section>

        {/* ── SECTION 8: INTERACTIVE FAQ ── */}
        <section className="interactive-section scroll-reveal" id="interactive">
          <div className="interactive-orb interactive-orb-1" ref={orb1Ref}></div>
          <div className="interactive-orb interactive-orb-2" ref={orb2Ref}></div>
          <div className="section-header max-w-4xl mx-auto px-6">
            <div className="num">08 / FAQ</div>
            <h2>Frequently Asked <span className="gradient">Questions</span></h2>
            <p>Everything you need to know before getting started.</p>
          </div>
          <div className="max-w-4xl mx-auto px-6 space-y-4 relative z-10">
            {faqs.map((faq, idx) => (
              <div key={idx} className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden shadow-sm hover:border-indigo-500/30 transition-all">
                <button className="w-full p-6 text-left flex justify-between items-center group"
                  onClick={() => setActiveFaq(activeFaq === idx ? null : idx)}>
                  <span className="text-sm sm:text-base font-black uppercase tracking-wider group-hover:text-indigo-600 transition-colors text-slate-900 pr-4">
                    {faq.q}
                  </span>
                  <div className={`w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0 transition-all ${activeFaq === idx ? 'rotate-180 bg-indigo-600 text-white' : 'text-slate-500'}`}>
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </button>
                {activeFaq === idx && (
                  <div className="px-6 pb-6 text-slate-300 text-xs sm:text-sm leading-relaxed font-medium">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── SECTION 8.5: TESTIMONIAL SLIDER ── */}
        <section className="relative py-24 px-6 border-t border-white/5 overflow-hidden" id="testimonials">
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <div className="absolute top-1/2 left-1/4 w-[400px] h-[400px] bg-indigo-500 rounded-full blur-[120px]" />
            <div className="absolute bottom-1/2 right-1/4 w-[400px] h-[400px] bg-purple-500 rounded-full blur-[120px]" />
          </div>
          <div className="max-w-4xl mx-auto relative z-10 scroll-reveal">
            <div className="text-center mb-16">
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-indigo-400">08.5 / Customer Stories</span>
              <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-slate-900 mt-4">
                TRUSTED BY <br className="sm:hidden" />
                <span className="bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#06b6d4] bg-clip-text text-transparent">
                  PAKISTANI ISPs
                </span>
              </h2>
              <p className="text-slate-400 text-sm max-w-lg mx-auto mt-4">
                See how local network owners, operators, and IT managers are transforming their payment recovery with our automated platform.
              </p>
            </div>

            <div className="relative min-h-[300px] md:min-h-[260px] bg-white/5 backdrop-blur-md rounded-3xl border border-white/10 p-8 sm:p-12 shadow-2xl flex flex-col justify-between transition-all duration-300 hover:border-indigo-500/30">
              <div className="absolute top-0 right-12 -translate-y-1/2 px-4 py-1.5 bg-indigo-500/10 border border-indigo-500/30 rounded-full text-[9px] font-mono uppercase text-indigo-400 tracking-wider">
                verified operator
              </div>
              <div>
                <div className="flex gap-1 mb-6 text-amber-400">
                  {Array.from({ length: testimonials[currentSlide].rating }).map((_, i) => (
                    <svg key={i} className="w-5 h-5 fill-current" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-slate-800 text-base sm:text-lg md:text-xl font-medium leading-relaxed italic mb-8">
                  "{testimonials[currentSlide].text}"
                </p>
              </div>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 border-t border-white/5 pt-6 mt-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-white text-base shadow-inner uppercase font-mono"
                    style={{ background: testimonials[currentSlide].avatarBg }}>
                    {testimonials[currentSlide].name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider">{testimonials[currentSlide].name}</h4>
                    <p className="text-[11px] font-mono text-slate-400 mt-0.5">{testimonials[currentSlide].role}</p>
                  </div>
                </div>
                <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-[10px] font-mono font-bold text-slate-300 uppercase tracking-widest flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                  {testimonials[currentSlide].location}
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center mt-8 px-2">
              <div className="flex gap-2">
                {testimonials.map((_, i) => (
                  <button key={i} onClick={() => setCurrentSlide(i)}
                    className={`h-2 rounded-full transition-all duration-300 ${currentSlide === i ? 'w-8 bg-indigo-500' : 'w-2 bg-white/20 hover:bg-white/40'}`}
                  />
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setCurrentSlide((prev) => (prev - 1 + testimonials.length) % testimonials.length)}
                  className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-white/60 transition-colors active:scale-95">
                  <ArrowRight className="w-4 h-4 rotate-180" />
                </button>
                <button onClick={() => setCurrentSlide((prev) => (prev + 1) % testimonials.length)}
                  className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-white/60 transition-colors active:scale-95">
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ── SECTION 9: PRICING PLANS ── */}
        <section className="relative py-24 px-6 border-t border-white/5 scroll-reveal" id="pricing">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-16">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-cyan-400 mb-4">Simple Pricing</p>
              <h2 className="text-3xl sm:text-5xl font-black uppercase tracking-tight text-slate-900 mb-4">
                Choose Your<br />
                <span className="bg-gradient-to-r from-cyan-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">Plan</span>
              </h2>
              <p className="text-slate-400 text-sm max-w-xl mx-auto">Flexible billing subscription plans for Pakistani ISPs of every size. No hidden charges.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start pt-5">
              {pricingPlans.map((plan, i) => (
                <div key={i}
                  className={`relative rounded-3xl border p-8 transition-all ${
                    plan.highlight 
                      ? 'border-indigo-500/50 bg-indigo-500/10 shadow-xl shadow-indigo-500/5 md:-mt-4 md:py-10' 
                      : 'border-white/10 bg-white/5 backdrop-blur-md'
                  }`}>
                  {plan.highlight && (
                    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500 to-transparent"/>
                  )}
                  {plan.highlight && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <span className="px-4 py-1 bg-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest text-white">Most Popular</span>
                    </div>
                  )}
                  <p className="text-xs font-black uppercase tracking-widest mb-4" style={{ color: plan.color }}>{plan.name}</p>
                  <div className="mb-6">
                    <span className="text-4xl font-black text-slate-900">{plan.price}</span>
                    {plan.period && <span className="text-slate-400 text-sm ml-2">/{plan.period}</span>}
                  </div>
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((f, fi) => (
                      <li key={fi} className="flex items-center gap-2 text-xs sm:text-sm text-slate-300">
                        <Check className="w-4 h-4 flex-shrink-0" style={{ color: plan.color }} />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button onClick={plan.name === 'Free' ? onGetStarted : () => window.open('https://wa.me/923042773453?text=I want to discuss the Bill Collector ' + plan.name + ' plan', '_blank')}
                    className={`w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 ${
                      plan.highlight 
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/35' 
                        : 'bg-white/70 hover:bg-white text-slate-900 border border-slate-200'
                    }`}>
                    {plan.cta}
                  </button>
                </div>
              ))}
            </div>

            <p className="text-center text-slate-500 text-xs mt-12 font-medium flex items-center justify-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
              Built natively for Pakistan's growing ISP networks.
            </p>
          </div>
        </section>

        {/* ── SECTION 9.5: DOWNLOAD APPS ── */}
        {(latestReleases.billcollector || latestReleases.wabot) && (
          <section className="py-24 px-6 border-t border-white/5 scroll-reveal" id="download-apps">
            <div className="max-w-4xl mx-auto text-center">
              <div className="badge mb-6 mx-auto">
                <div className="dot"></div>
                <span>Android Apps</span>
              </div>
              <h2 className="text-3xl sm:text-5xl font-black leading-none mb-6">
                MANAGE ON THE GO —<br />
                <span className="gradient">DOWNLOAD THE APP</span>
              </h2>
              <p className="max-w-lg mx-auto mb-12 text-slate-400 text-sm sm:text-base font-medium">
                Native Android apps for your billing dashboard and NetBot inbox — no browser needed.
              </p>
              <div className="grid sm:grid-cols-2 gap-6 max-w-2xl mx-auto">
                {latestReleases.billcollector && (
                  <a href={latestReleases.billcollector.apk_url} download
                    className="group flex flex-col items-center gap-4 p-8 rounded-3xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all active:scale-95">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 flex items-center justify-center">
                      <Smartphone className="w-8 h-8 text-indigo-400" />
                    </div>
                    <div>
                      <p className="font-black text-sm">Bill Collector Manager</p>
                      <p className="text-xs text-slate-500 mt-1">
                        v{latestReleases.billcollector.version}{latestReleases.billcollector.file_size_mb ? ` • ${latestReleases.billcollector.file_size_mb} MB` : ''}
                      </p>
                    </div>
                    <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-indigo-400 group-hover:text-indigo-300">
                      <Download className="w-4 h-4" /> Download APK
                    </span>
                  </a>
                )}
                {latestReleases.wabot && (
                  <a href={latestReleases.wabot.apk_url} download
                    className="group flex flex-col items-center gap-4 p-8 rounded-3xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all active:scale-95">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
                      <MessageCircle className="w-8 h-8 text-emerald-400" />
                    </div>
                    <div>
                      <p className="font-black text-sm">NetBot</p>
                      <p className="text-xs text-slate-500 mt-1">
                        v{latestReleases.wabot.version}{latestReleases.wabot.file_size_mb ? ` • ${latestReleases.wabot.file_size_mb} MB` : ''}
                      </p>
                    </div>
                    <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-emerald-400 group-hover:text-emerald-300">
                      <Download className="w-4 h-4" /> Download APK
                    </span>
                  </a>
                )}
              </div>
              <p className="text-[10px] text-slate-500 mt-8">Direct APK download — enable "Install from unknown sources" if prompted.</p>
            </div>
          </section>
        )}

        {/* ── SECTION 10: CTA SECTION ── */}
        <section className="cta-section" id="cta">
          <div className="bg-glow" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '600px', height: '600px', borderRadius: '50%', background: 'rgba(99,102,241,0.05)', filter: 'blur(150px)', pointerEvents: 'none' }}></div>
          <div className="max-w-4xl mx-auto px-6 relative z-10">
            <div className="badge mb-8">
              <div className="dot"></div>
              <span>Ready to Scale?</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-black leading-none mb-6">
              START YOUR<br />
              <span className="gradient">FREE TRIAL</span>
            </h2>
            <p className="max-w-lg mx-auto mb-10 text-slate-400 text-sm sm:text-base font-medium">
              Join 150+ Pakistani ISPs already automating their billing. No credit card required. Setup takes less than 2 minutes.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button onClick={onGetStarted}
                className="cta-glow w-full sm:w-auto h-14 px-10 rounded-2xl font-black text-xs uppercase tracking-[0.25em] flex items-center justify-center gap-3 text-white">
                Get Started Free <ArrowRight className="w-4 h-4" />
              </button>
              <a href="https://wa.me/923042773453?text=I%20want%20more%20information%20about%20Bill%20Collector"
                target="_blank" rel="noreferrer"
                className="w-full sm:w-auto h-14 px-10 rounded-2xl font-black text-xs uppercase tracking-[0.25em] backdrop-blur-md border border-white/10 bg-white/5 flex items-center justify-center gap-3 text-slate-900 hover:text-emerald-600 hover:border-emerald-500/30 transition-all active:scale-95">
                <MessageCircle className="w-4 h-4 text-emerald-400" /> WhatsApp Us
              </a>
            </div>
            <div className="flex flex-wrap justify-center gap-3 mt-8">
              {['Fast Sync', '99.9% Uptime', 'AES-256', 'WhatsApp Ready', 'PKR Billing', 'Offline Mode'].map((tag, i) => (
                <span key={i} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer className="pt-20 pb-10 px-6 border-t border-white/10 bg-[#040814]/40 backdrop-blur-md">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
              <div className="col-span-2">
                {logoBase64 && <img src={logoBase64} alt="Bill Collector" className="w-[85px] h-[85px] object-contain mb-6" />}
                <p className="text-slate-300 max-w-sm font-medium text-base leading-relaxed mb-6">
                  Pakistan's leading ISP billing and management platform. From small neighborhood operators to enterprise fiber networks — built for every ISP.
                </p>
                <div className="flex flex-col gap-2 max-w-xs">
                  <a href="https://wa.me/923042773453?text=I%20want%20more%20information%20about%20Bill%20Collector"
                    target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-600/20 border border-green-500/30 text-green-400 rounded-xl text-xs font-bold hover:bg-green-600/30 transition-all">
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>WhatsApp: 0304-2773453</span>
                  </a>
                  <a href="mailto:support@billcollector.online"
                    className="glass inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold hover:bg-white/10 transition-all text-cyan-300">
                    <Mail className="w-3.5 h-3.5" />
                    <span>support@billcollector.online</span>
                  </a>
                </div>
              </div>

              <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">Platform</h4>
                <ul className="space-y-4 text-sm font-bold text-slate-300">
                  <li><a href="#features" className="hover:text-indigo-400 transition-colors">Features</a></li>
                  <li><Link to="/about" className="hover:text-indigo-400 transition-colors">About</Link></li>
                  <li><a href="#pricing" className="hover:text-indigo-400 transition-colors">Pricing</a></li>
                  <li><a href="https://wa.me/923042773453" target="_blank" rel="noreferrer" className="hover:text-indigo-400 transition-colors">Contact</a></li>
                </ul>
              </div>

              <div>
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">Legal</h4>
                <ul className="space-y-4 text-sm font-bold text-slate-300">
                  <li><Link to="/privacy" className="hover:text-indigo-400 transition-colors">Privacy Policy</Link></li>
                  <li><Link to="/terms" className="hover:text-indigo-400 transition-colors">Terms of Service</Link></li>
                  <li><Link to="/terms" className="hover:text-indigo-400 transition-colors">Refund Policy</Link></li>
                  <li>
                    <span className="inline-flex items-center gap-1.5 text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
                      All Systems Operational
                    </span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="pt-8 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">© 2026 Bill Collector. All rights reserved.</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Built for Pakistani ISPs · support@billcollector.online</p>
            </div>
          </div>
        </footer>

        {/* ── DEMO MODAL ── */}
        {showDemoModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-[#040814]/80 backdrop-blur-md animate-fade-in"
            onClick={() => setShowDemoModal(false)}>
            <div className="w-full max-w-3xl rounded-3xl border border-white/20 bg-[#0a1228] overflow-hidden animate-scale-in"
              onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-slate-900 uppercase tracking-wider">Product Demo</h3>
                  <p className="text-slate-400 text-xs mt-1">See Bill Collector in action</p>
                </div>
                <button onClick={() => setShowDemoModal(false)} className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-500 hover:text-slate-900 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-6">
                <div className="aspect-video rounded-2xl bg-slate-200 flex items-center justify-center border border-white/10">
                  <div className="text-center">
                    <Play className="w-16 h-16 text-indigo-400 mx-auto mb-4" />
                    <p className="text-slate-400 text-sm font-medium">Demo video coming soon</p>
                    <p className="text-slate-500 text-xs mt-2">Contact us for a live walkthrough</p>
                  </div>
                </div>
                <div className="mt-6 flex justify-center">
                  <a href="https://wa.me/923042773453?text=I%20want%20a%20live%20demo%20of%20Bill%20Collector"
                    target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-widest transition-all">
                    <MessageCircle className="w-4 h-4" /> Request Live Demo
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SPECS MODAL ── */}
        {showSpecs && (
          <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4 sm:p-6 bg-[#040814]/80 backdrop-blur-md animate-fade-in"
            onClick={() => setShowSpecs(false)}>
            <div className="w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden border border-white/20 bg-[#0a1228] max-h-[90vh] overflow-y-auto animate-scale-in"
              onClick={e => e.stopPropagation()}>
              <div className="p-6 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #e0e7ff, #eef3fb)' }}>
                <div className="absolute inset-0 opacity-20">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full blur-3xl -mr-32 -mt-32" />
                </div>
                <div className="relative z-10 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                      <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">System Online</span>
                    </div>
                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Bill Collector Platform Features</h2>
                    <p className="text-indigo-300 text-sm mt-1">Everything your ISP needs</p>
                  </div>
                  <button onClick={() => setShowSpecs(false)} className="text-slate-500 hover:text-slate-900 text-2xl transition-colors">✕</button>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div className="rounded-2xl p-5 bg-white/5 border border-white/10">
                  <h3 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Zap className="w-3 h-3" /> Core Features
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {['Customer Management', 'Digital Receipt Generator', 'Monthly Recovery Ledger', 'Expiry Alerts (3/7/30 days)',
                      'Equipment / Device Tracker', 'Leads Pipeline', 'Receivable Aging Report', 'Area-wise Dashboard',
                      'Service Suspension Log', 'Network Outage Tracker', 'Business Expenses', 'Team / Agent Management',
                      'Smart Notifications', 'Cross-Device Cloud Sync', 'Role-Based Access', 'WhatsApp Reminder Links'].map((f, i) => (
                      <div key={i} className="text-xs font-medium py-1 text-slate-300 flex items-center gap-2">
                        <Check className="w-3 h-3 text-emerald-400" /> {f}
                      </div>
                    ))}
                  </div>
                </div>
                <button onClick={() => { setShowSpecs(false); onGetStarted(); }}
                  className="cta-glow w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest text-white flex items-center justify-center gap-2 active:scale-95">
                  Get Started Free <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LandingPage;

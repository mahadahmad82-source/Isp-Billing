import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { logoBase64 } from '../utils/logoBase64';
import VideoBackground from './landing/VideoBackground';
import { ArrowLeft, Shield, FileText, CreditCard, Users, Lock, AlertTriangle, Globe, Mail } from 'lucide-react';

interface Section {
  id: string;
  icon: React.ReactNode;
  title: string;
  content: { heading?: string; text: string }[];
}

const SECTIONS: Section[] = [
  {
    id: 'acceptance',
    icon: <FileText className="w-4 h-4" />,
    title: 'Terms of Service',
    content: [
      { heading: 'Agreement', text: 'By registering for or using Bill Collector (the "Platform"), you (the "Manager/Operator") agree to these Terms. If you do not agree, do not use the Platform.' },
      { heading: 'Service Description', text: 'Bill Collector is a cloud-based ISP billing and management platform for Internet Service Providers. Depending on the plan and enabled features, it supports customer records, billing and recovery workflows, receipts, reports, team and sub-manager access, complaints, expenses, analytics, and related ISP operations.' },
      { heading: 'Account Registration', text: 'You must provide accurate information when creating an account and keep your login credentials confidential. Each account is intended for one ISP operator, business, or organization unless otherwise agreed in writing.' },
      { heading: 'Permitted Use', text: 'You may use the Platform for your own ISP business operations. You are responsible for the customer information, receipts, messages, and other content that you or your authorized users add to the Platform.' },
      { heading: 'Changes to These Terms', text: 'Bill Collector may update these Terms from time to time. The updated version will be posted on this page. Your continued use of the Platform after an update means that you accept the updated Terms.' },
    ],
  },
  {
    id: 'subscriptions',
    icon: <CreditCard className="w-4 h-4" />,
    title: 'Subscription & Payments',
    content: [
      { heading: 'Plans and Limits', text: 'The Platform currently offers Free, Starter, Growth, Business, Enterprise, and Custom tiers. The signup screen currently describes these tiers as: Free up to 75 customers; Starter up to 256 customers and one sub-manager; Growth up to 512 customers with NetBot Text; Business up to 750 customers with NetBot Basic; Enterprise up to 1,056 customers with NetBot Pro; and Custom with limits and NetBot access agreed with the customer. The plan details shown at signup or confirmed by Bill Collector are controlling.' },
      { heading: 'Free Access or Trial', text: 'The Free tier is available according to the limits and features shown at signup. Free access does not guarantee access to every paid feature, higher limits, or NetBot capabilities included in paid tiers.' },
      { heading: 'Payment Methods and Manual Verification', text: 'Subscription fees are charged in Pakistani Rupees (PKR). Paid-plan payments may be made through the payment methods communicated by Bill Collector, including bank transfer, EasyPaisa, or JazzCash. Paid-plan activation is not completed through an automated card gateway: payment proof is submitted through the available signup flow and reviewed manually. Access, renewal, or an upgrade may remain pending until verification is complete.' },
      { heading: 'Refunds and Credits', text: 'Refunds, credits, cancellations, and adjustments are considered case by case after reviewing the account and payment status. Do not assume that a payment is refundable or transferable unless Bill Collector confirms it in writing.' },
      { heading: 'Suspension for Non-Payment or Other Reasons', text: 'An administrator may suspend an account, including for non-payment, suspected misuse, security concerns, or other account-related reasons. Suspension can restrict access to the Platform while account data may remain retained for service, security, backup, or legal purposes. Reactivation may occur after the relevant issue is resolved.' },
    ],
  },
  {
    id: 'data',
    icon: <Shield className="w-4 h-4" />,
    title: 'Data & Privacy',
    content: [
      { heading: 'Manager Data', text: 'You retain responsibility for the customer lists, receipts, balances, contact details, CNIC information, and other business data that you enter into the Platform. Data is scoped to the relevant manager account and is not intentionally shared with other managers through the Platform.' },
      { heading: 'How Data Is Used', text: 'Bill Collector uses manager data to provide the billing, customer-management, receipt, reporting, account, team, support, and related features that you request. Bill Collector does not sell or rent your business data. You are responsible for ensuring that you have the right to collect and use your customers\' information.' },
      { heading: 'Local and Cloud Storage', text: 'The Platform uses browser localStorage as a local cache and synchronizes account data with its cloud database. Clearing browser data can remove the local cache; it does not by itself delete the corresponding cloud data. Cloud data may be retained for service operation, backup, security, support, and legal or operational requirements.' },
      { heading: 'Customer Data Responsibility', text: 'You are responsible for the accuracy and lawful collection of personal information that you enter, including names, phone numbers, addresses, CNIC details, balances, and service records. You should provide your customers with any notices or obtain any permissions required for your use of their information.' },
      { heading: 'NetBot and WhatsApp Processing', text: 'NetBot is an optional WhatsApp customer-support bot add-on. If you enable it, WhatsApp messages from your own customers may be stored in the Platform inbox and processed by AI to classify requests, transcribe voice messages, and generate replies or other support responses. NetBot is intended to support your own customer communications; WhatsApp use is also subject to Meta/WhatsApp terms, availability, and policies.' },
    ],
  },
  {
    id: 'agents',
    icon: <Users className="w-4 h-4" />,
    title: 'Agents & Sub-Managers',
    content: [
      { heading: 'Sub-Manager Accounts', text: 'You may create sub-manager or field-agent accounts up to the limit of your selected plan. The available plans may have different limits and permissions. The primary Manager can configure the access rights available to each authorized team member.' },
      { heading: 'Responsibility', text: 'The primary Manager is responsible for actions taken by sub-managers, field agents, and other authorized users under the account, including changes to customer records, receipts, collections, complaints, and activity records.' },
      { heading: 'Access to Manager Data', text: 'Sub-managers receive only the access configured for them. Manager data remains associated with the primary Manager account and is not shared with other managers merely because sub-managers or teams use the Platform.' },
      { heading: 'Optional NetBot Add-On', text: 'If the Manager enables NetBot, the add-on supports WhatsApp customer service for that Manager\'s own customers. AI-generated replies may be used as part of this support workflow. NetBot does not authorize access to another Manager\'s customers or business data.' },
    ],
  },
  {
    id: 'security',
    icon: <Lock className="w-4 h-4" />,
    title: 'Security & Account',
    content: [
      { heading: 'Account Security', text: 'You are responsible for keeping your login credentials secure, using a strong password, and limiting access to authorized users. Do not share passwords or access links unnecessarily.' },
      { heading: 'Unauthorized Access', text: 'Notify Bill Collector promptly if you suspect unauthorized access, compromised credentials, or misuse of your account. Bill Collector may suspend an account or restrict access when reasonably necessary to protect the Platform or its users.' },
      { heading: 'Password Recovery', text: 'Password recovery may be handled through the available account-recovery flow or manually through support. Contact support at +92-304-2773453 or support@billcollector.online if you need assistance.' },
      { heading: 'Third-Party Services', text: 'Some Platform functions depend on third-party services, including Supabase cloud services, Vercel hosting, Meta/WhatsApp services, and AI providers. Those providers may process data as needed to deliver the relevant function and may have their own terms and policies.' },
    ],
  },
  {
    id: 'prohibited',
    icon: <AlertTriangle className="w-4 h-4" />,
    title: 'Prohibited Activities',
    content: [
      { text: 'Using Bill Collector for any unlawful purpose or in violation of applicable Pakistani law, including PECA 2016.' },
      { text: 'Attempting to reverse-engineer, decompile, or extract source code from the Platform.' },
      { text: 'Uploading malicious code, viruses, or content that could harm the Platform or another user.' },
      { text: 'Creating fake customer records, falsifying receipts, or using the Platform for fraudulent billing.' },
      { text: 'Using automated scripts or bots to access Platform APIs beyond normal usage without written permission.' },
      { text: 'Attempting to access another Manager\'s data, customer lists, receipts, WhatsApp conversations, or account, or attempting to bypass access controls.' },
    ],
  },
  {
    id: 'liability',
    icon: <Globe className="w-4 h-4" />,
    title: 'Liability & Disclaimers',
    content: [
      { heading: 'Service Availability', text: 'The Platform may be unavailable because of maintenance, connectivity problems, account suspension, or failures or changes affecting third-party services. Bill Collector does not guarantee uninterrupted or error-free operation unless a separate written agreement says otherwise.' },
      { heading: 'Billing and Operational Decisions', text: 'Receipts, balances, reminders, customer statuses, and NetBot replies are tools to assist your operations. You remain responsible for checking information and making decisions about service activation, suspension, renewal, collection, and customer communications.' },
      { heading: 'Limitation of Liability', text: 'To the extent permitted by applicable law, Bill Collector\'s total liability for any claim shall not exceed the amount paid by you for the service in the three months preceding the event giving rise to the claim. Bill Collector is not liable for indirect, incidental, special, or consequential damages to the extent permitted by law.' },
      { heading: 'Governing Law', text: 'These Terms are governed by the applicable laws of Pakistan. Disputes will be handled under the applicable jurisdiction and dispute-resolution rules in Pakistan.' },
    ],
  },
];

interface Props {
  onBack?: () => void;
}

const TermsAndPolicy: React.FC<Props> = ({ onBack }) => {
  const [activeSection, setActiveSection] = useState('acceptance');

  const current = SECTIONS.find(s => s.id === activeSection) || SECTIONS[0];

  return (
    <div className="min-h-screen overflow-x-hidden text-slate-900">
      <VideoBackground variant="light" />

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Landing-style glass navigation */}
        <header className="fixed top-0 left-0 right-0 z-50 px-4 pt-4 md:px-8">
          <nav className="mx-auto flex max-w-7xl items-center justify-between rounded-2xl border border-slate-900/10 bg-white/75 px-4 py-3 shadow-xl shadow-slate-300/50 backdrop-blur-xl sm:px-7">
            <div className="flex w-full items-center justify-between gap-4">
              <Link to="/" className="flex items-center gap-3 pl-1 sm:pl-2">
                {logoBase64 && <img src={logoBase64} alt="Bill Collector" className="h-auto w-[95px] object-contain sm:w-[130px]" />}
              </Link>

              <div className="hidden items-center gap-6 text-[11px] font-bold uppercase tracking-widest md:flex lg:gap-8">
                <Link to="/" className="text-slate-600 transition-colors hover:text-indigo-600">Home</Link>
                <Link to="/features" className="text-slate-600 transition-colors hover:text-indigo-600">Features</Link>
                <Link to="/about" className="text-slate-600 transition-colors hover:text-indigo-600">About</Link>
                <Link to="/privacy" className="text-slate-600 transition-colors hover:text-indigo-600">Privacy</Link>
                <span className="text-indigo-600">Terms</span>
              </div>

              <div className="flex items-center gap-2">
                <a href="/portal" className="hidden items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-indigo-600 transition-all hover:bg-indigo-100 sm:flex">
                  <Users className="h-3.5 w-3.5 text-indigo-500" /> User Portal
                </a>
                {onBack && (
                  <button onClick={onBack} className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 px-3.5 py-2.5 text-[10px] font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-500/20 transition-all hover:-translate-y-0.5 active:scale-95 sm:px-5">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back
                  </button>
                )}
              </div>
            </div>
          </nav>
        </header>

        <main className="flex-1 px-4 pb-16 pt-32 sm:px-6">
          <div className="mx-auto max-w-7xl">
            {/* Landing-style page hero */}
            <div className="mx-auto mb-12 max-w-3xl text-center">
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-slate-900/10 bg-white/80 px-4 py-2 shadow-sm backdrop-blur-md">
                <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
                <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600">Legal & Trust Center</span>
              </div>
              <h1 className="text-4xl font-black leading-none tracking-tight text-slate-900 sm:text-6xl">
                Terms <span className="bg-gradient-to-r from-cyan-500 via-indigo-600 to-purple-600 bg-clip-text text-transparent">& Policies</span>
              </h1>
              <p className="mx-auto mt-5 max-w-2xl text-sm font-medium leading-relaxed text-slate-600 sm:text-base">
                Clear policies for a reliable ISP billing and management experience. Review the terms that govern your use of the Bill Collector platform.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <span className="rounded-lg border border-slate-900/10 bg-white/70 px-3 py-1.5">Bill Collector Platform</span>
                <span className="rounded-lg border border-slate-900/10 bg-white/70 px-3 py-1.5">Effective August 18, 2026</span>
                <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-600">Version 2.1</span>
              </div>
            </div>

            <div className="grid items-start gap-6 md:grid-cols-[240px_minmax(0,1fr)]">
              {/* Sidebar navigation */}
              <aside className="md:sticky md:top-28">
                <div className="rounded-3xl border border-slate-900/10 bg-white/75 p-3 shadow-xl shadow-slate-300/30 backdrop-blur-xl">
                  <p className="px-3 pb-3 pt-2 text-[10px] font-black uppercase tracking-[0.25em] text-slate-500">On this page</p>
                  <div className="space-y-1">
                    {SECTIONS.map(section => (
                      <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id)}
                        className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left text-[11px] font-bold uppercase tracking-wider transition-all ${
                          activeSection === section.id
                            ? 'border-indigo-200 bg-indigo-50 text-indigo-600 shadow-sm'
                            : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-800'
                        }`}
                      >
                        <span className={activeSection === section.id ? 'text-indigo-600' : 'text-slate-400'}>{section.icon}</span>
                        <span className="leading-tight">{section.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </aside>

              {/* Content panel */}
              <section className="min-w-0 rounded-[28px] border border-slate-900/10 bg-white/80 p-5 shadow-2xl shadow-slate-300/35 backdrop-blur-xl sm:p-8">
                <div className="mb-8 flex items-center gap-4 border-b border-slate-200/80 pb-6">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-50 via-indigo-50 to-purple-100 text-indigo-600 shadow-inner shadow-indigo-200/40">
                    {current.icon}
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-black uppercase tracking-[0.25em] text-indigo-600">Bill Collector Legal</p>
                    <h2 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl">{current.title}</h2>
                  </div>
                </div>

                <div className="space-y-4">
                  {current.id === 'prohibited' ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 sm:p-6">
                      <p className="mb-4 flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" /> The following activities are strictly prohibited on Bill Collector:
                      </p>
                      <ul className="space-y-3">
                        {current.content.map((item, i) => (
                          <li key={i} className="flex items-start gap-3">
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-[9px] font-black text-rose-600">{i + 1}</span>
                            <p className="text-[13px] font-medium leading-relaxed text-slate-600">{item.text}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    current.content.map((item, i) => (
                      <article key={i} className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-5 transition-all hover:border-indigo-200 hover:bg-white hover:shadow-lg hover:shadow-indigo-100/40 sm:p-6">
                        {item.heading && (
                          <h3 className="mb-2 text-[11px] font-black uppercase tracking-widest text-indigo-600">{item.heading}</h3>
                        )}
                        <p className="text-[13px] font-medium leading-relaxed text-slate-600">{item.text}</p>
                      </article>
                    ))
                  )}
                </div>

                {/* Section navigation */}
                <div className="mt-10 flex items-center justify-between gap-4 border-t border-slate-200/80 pt-6">
                  {(() => {
                    const idx = SECTIONS.findIndex(s => s.id === activeSection);
                    const prev = SECTIONS[idx - 1];
                    const next = SECTIONS[idx + 1];
                    return (
                      <>
                        {prev ? (
                          <button onClick={() => setActiveSection(prev.id)} className="inline-flex max-w-[45%] items-center gap-2 text-left text-[10px] font-black uppercase tracking-widest text-slate-500 transition-colors hover:text-indigo-600 sm:text-[11px]">
                            <ArrowLeft className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{prev.title}</span>
                          </button>
                        ) : <div />}
                        {next && (
                          <button onClick={() => setActiveSection(next.id)} className="inline-flex max-w-[45%] items-center gap-2 text-right text-[10px] font-black uppercase tracking-widest text-slate-500 transition-colors hover:text-indigo-600 sm:text-[11px]">
                            <span className="truncate">{next.title}</span> <ArrowLeft className="h-3.5 w-3.5 shrink-0 rotate-180" />
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>
              </section>
            </div>
          </div>
        </main>

        {/* Landing-style legal footer */}
        <footer className="border-t border-slate-900/10 bg-white/60 px-6 pb-10 pt-14 backdrop-blur-md">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
              <div className="flex items-center gap-4">
                {logoBase64 && <img src={logoBase64} alt="Bill Collector" className="h-14 w-14 object-contain" />}
                <div>
                  <p className="text-sm font-black text-slate-900">Bill Collector</p>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">Built for Pakistani ISPs</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <Link to="/privacy" className="transition-colors hover:text-indigo-600">Privacy Policy</Link>
                <Link to="/refund" className="transition-colors hover:text-indigo-600">Refund Policy</Link>
                <a href="mailto:support@billcollector.online" className="inline-flex items-center gap-2 transition-colors hover:text-cyan-600">
                  <Mail className="h-3.5 w-3.5" /> Support
                </a>
              </div>
            </div>
            <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-slate-900/10 pt-6 text-center sm:flex-row sm:text-left">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">© 2026 Bill Collector. All rights reserved.</p>
              <a href="https://wa.me/923042773453" target="_blank" rel="noopener noreferrer" className="text-[10px] font-black uppercase tracking-widest text-emerald-600 transition-colors hover:text-emerald-700">Contact support on WhatsApp</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default TermsAndPolicy;
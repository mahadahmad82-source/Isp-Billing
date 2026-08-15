import React, { useState } from 'react';
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
      { heading: 'Agreement', text: 'By registering for or using myISP (the "Platform"), you (the "Manager/Operator") agree to these Terms. If you do not agree, do not use the Platform.' },
      { heading: 'Service Description', text: 'myISP is a cloud-based ISP billing and management platform for Internet Service Providers. Depending on the plan and enabled features, it supports customer records, billing and recovery workflows, receipts, reports, team or sub-manager access, and related ISP operations.' },
      { heading: 'Account Registration', text: 'You must provide accurate information when creating an account and keep your login credentials confidential. Each account is intended for one ISP operator, business, or organization unless otherwise agreed in writing.' },
      { heading: 'Permitted Use', text: 'You may use the Platform for your own ISP business operations. You are responsible for the customer information, receipts, messages, and other content that you or your authorized users add to the Platform.' },
      { heading: 'Changes to These Terms', text: 'myISP may update these Terms from time to time. The updated version will be posted on this page. Your continued use of the Platform after an update means that you accept the updated Terms.' },
    ],
  },
  {
    id: 'subscriptions',
    icon: <CreditCard className="w-4 h-4" />,
    title: 'Subscription & Payments',
    content: [
      { heading: 'Plans and Limits', text: 'The Platform offers Free, Starter, Growth, Business, Enterprise, and Custom subscription tiers. Each plan has its own customer and sub-manager limits and may include different features or NetBot access. Limits apply per manager account, and you may request or purchase an upgrade when you need higher limits or additional features. The currently applicable plan details are shown on the pricing page or confirmed by the myISP team.' },
      { heading: 'Free Access or Trial', text: 'The availability, duration, and features of any free access or trial are determined by the offer shown at signup or confirmed by the myISP team. Unless expressly stated otherwise, a free plan or trial does not guarantee access to every paid feature.' },
      { heading: 'Payment Methods and Manual Verification', text: 'Subscription fees are charged in Pakistani Rupees (PKR). Payment is made by bank transfer, EasyPaisa, or JazzCash. Payment is not processed through an automated card gateway: after you submit payment details or proof of payment, the payment is reviewed and verified manually, typically within [TURNAROUND TIME]. Access, renewal, or an upgrade may remain pending until verification is complete.' },
      { heading: 'Refunds and Credits', text: 'Refunds, credits, cancellations, and adjustments are handled according to [REFUND AND CANCELLATION POLICY]. Do not assume that a payment is refundable unless the myISP team confirms it in writing.' },
      { heading: 'Suspension for Non-Payment or Other Reasons', text: 'An administrator may suspend an account, including for non-payment, suspected misuse, security concerns, or other account-related reasons. Suspension can restrict access to the Platform while keeping the account data intact. An administrator may reactivate the account after the relevant issue is resolved. Any applicable data-retention period after suspension is [DATA RETENTION PERIOD].' },
    ],
  },
  {
    id: 'data',
    icon: <Shield className="w-4 h-4" />,
    title: 'Data & Privacy',
    content: [
      { heading: 'Manager Data', text: 'You retain responsibility for the customer lists, receipts, balances, contact details, and other business data that you enter into the Platform. Data is stored per manager account: one manager\'s customer lists, receipts, and related business data are not shared with other managers through the Platform.' },
      { heading: 'How Data Is Used', text: 'myISP uses manager data to provide the billing, customer-management, receipt, reporting, account, and support features that you request. We do not sell or rent your business data. You are responsible for ensuring that you have the right to collect and use your customers\' information.' },
      { heading: 'Local and Cloud Storage', text: 'The Platform may use browser localStorage as a local cache and may synchronize account data to its cloud database. Clearing browser data can remove the local cache; it does not by itself delete the corresponding cloud data. Specific backup, deletion, and retention practices are [BACKUP, DELETION, AND RETENTION PRACTICES].' },
      { heading: 'Customer Data Responsibility', text: 'You are responsible for the accuracy and lawful collection of personal information that you enter, including names, phone numbers, addresses, CNIC details, balances, and service records. You should provide your customers with any notices or obtain any permissions required for your use of their information.' },
      { heading: 'NetBot and WhatsApp Processing', text: 'NetBot is an optional WhatsApp customer-support bot add-on. If you enable it, WhatsApp messages from your own customers may be processed by AI to classify requests and generate replies or other support responses. This processing is for supporting your own customers through your configured myISP service and is not intended for unrelated people, businesses, or purposes. WhatsApp use is also subject to Meta/WhatsApp terms and service availability.' },
    ],
  },
  {
    id: 'agents',
    icon: <Users className="w-4 h-4" />,
    title: 'Agents & Sub-Managers',
    content: [
      { heading: 'Sub-Manager Accounts', text: 'You may create sub-manager accounts up to the limit of your selected plan. The Free, Starter, Growth, Business, Enterprise, and Custom tiers may have different sub-manager limits. A plan upgrade may increase the available limit. The primary Manager can configure the access or permissions available to sub-managers.' },
      { heading: 'Responsibility', text: 'The primary Manager is responsible for actions taken by sub-managers and other authorized users under the account, including changes to customer records, receipts, collections, and activity records.' },
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
      { heading: 'Unauthorized Access', text: 'Notify myISP promptly if you suspect unauthorized access, compromised credentials, or misuse of your account. myISP may suspend an account or restrict access when reasonably necessary to protect the Platform or its users.' },
      { heading: 'Password Recovery', text: 'Password recovery may be handled through the available account-recovery flow or manually through support. Contact support at +92-304-2773453 if you need assistance.' },
      { heading: 'Third-Party Services', text: 'Some Platform functions depend on third-party services, including cloud hosting, database, and WhatsApp/Meta services. Those providers may process data as needed to deliver the relevant function and may have their own terms and policies.' },
    ],
  },
  {
    id: 'prohibited',
    icon: <AlertTriangle className="w-4 h-4" />,
    title: 'Prohibited Activities',
    content: [
      { text: 'Using myISP for any unlawful purpose or in violation of applicable Pakistani law, including PECA 2016.' },
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
      { heading: 'Service Availability', text: 'The Platform may be unavailable because of maintenance, connectivity problems, account suspension, or failures or changes affecting third-party services. myISP does not guarantee uninterrupted or error-free operation unless a separate written agreement says otherwise.' },
      { heading: 'Billing and Operational Decisions', text: 'Receipts, balances, reminders, customer statuses, and NetBot replies are tools to assist your operations. You remain responsible for checking information and making decisions about service activation, suspension, renewal, collection, and customer communications.' },
      { heading: 'Limitation of Liability', text: 'To the extent permitted by applicable law, myISP\'s total liability for any claim shall not exceed the amount paid by you for the service in the past 3 months. myISP is not liable for indirect damages.' },
      { heading: 'Governing Law', text: 'These Terms are governed by the laws of Pakistan. Any disputes shall be subject to the exclusive jurisdiction of courts in Karachi, Pakistan.' },
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
    <div className="min-h-screen" style={{ background: '#020617' }}>
      {/* Header */}
      <div className="sticky top-0 z-50 border-b border-white/5" style={{ background: 'rgba(2,6,23,0.92)', backdropFilter: 'blur(20px)' }}>
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-4">
          {onBack && (
            <button onClick={onBack} className="p-2 rounded-xl border border-white/8 text-slate-400 hover:text-white hover:border-white/20 transition-all active:scale-95">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div>
            <h1 className="text-sm font-black uppercase tracking-[0.2em] text-white">Terms & Policies</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">myISP Platform — Effective [EFFECTIVE DATE]</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest hidden sm:block">v2.0</span>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col md:flex-row gap-6">
        {/* Sidebar Nav */}
        <div className="md:w-56 shrink-0">
          <div className="sticky top-24 space-y-1">
            {SECTIONS.map(section => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-all font-bold text-[11px] uppercase tracking-wider border ${
                  activeSection === section.id
                    ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300'
                    : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/4'
                }`}
              >
                <span className={activeSection === section.id ? 'text-indigo-400' : 'text-slate-600'}>{section.icon}</span>
                {section.title}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Section Header */}
          <div className="flex items-center gap-3 mb-8 pb-6 border-b border-white/5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              {current.icon}
            </div>
            <div>
              <h2 className="text-lg font-black uppercase tracking-tight text-white">{current.title}</h2>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">myISP Platform Agreement</p>
            </div>
          </div>

          {/* Content Blocks */}
          <div className="space-y-5">
            {current.id === 'prohibited' ? (
              <div className="rounded-2xl border border-amber-500/15 bg-amber-500/5 p-6">
                <p className="text-[11px] font-black uppercase tracking-widest text-amber-400 mb-4 flex items-center gap-2">
                  <AlertTriangle className="w-3.5 h-3.5" /> The following activities are strictly prohibited on myISP:
                </p>
                <ul className="space-y-3">
                  {current.content.map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="mt-1 w-5 h-5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-400 flex items-center justify-center shrink-0 text-[9px] font-black">{i + 1}</span>
                      <p className="text-[12px] text-slate-400 font-medium leading-relaxed">{item.text}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              current.content.map((item, i) => (
                <div key={i} className="rounded-2xl border border-white/5 bg-white/2 p-5 hover:border-white/10 transition-colors">
                  {item.heading && (
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-indigo-400 mb-2">{item.heading}</h3>
                  )}
                  <p className="text-[12px] text-slate-400 font-medium leading-relaxed">{item.text}</p>
                </div>
              ))
            )}
          </div>

          {/* Section Nav Arrows */}
          <div className="flex items-center justify-between mt-10 pt-6 border-t border-white/5">
            {(() => {
              const idx = SECTIONS.findIndex(s => s.id === activeSection);
              const prev = SECTIONS[idx - 1];
              const next = SECTIONS[idx + 1];
              return (
                <>
                  {prev ? (
                    <button 
                      onClick={() => setActiveSection(prev.id)} 
                      className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" /> {prev.title}
                    </button>
                  ) : <div />}
                  {next && (
                    <button 
                      onClick={() => setActiveSection(next.id)} 
                      className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {next.title} <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
                    </button>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-white/5 mt-8">
        <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest text-center">
            © [YEAR] myISP — All rights reserved. Operated in Pakistan.
          </p>
          <a href="https://wa.me/923042773453" target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-emerald-400 transition-colors">
            <Mail className="w-3.5 h-3.5" /> Contact Support
          </a>
        </div>
      </div>
    </div>
  );
};

export default TermsAndPolicy;
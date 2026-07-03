// utils/messageTemplates.ts — Centralized manual-send message templates
// Used by: Customer Directory (UserManagement), Recovery Ledger (RecoverySummary),
// Receipt Generator, Expiries (via geminiService), Bulk Reminder tool.
// Admin can view/edit/add/delete these from the "Message Templates" tab.

import { AppSettings, MessageTemplate } from '../types';

export const DEFAULT_MESSAGE_TEMPLATES: Record<string, MessageTemplate> = {
  billing_reminder: {
    category: 'reminder',
    label: 'Billing Reminder — Customer Directory (WhatsApp button)',
    text:
      '*{businessName} BILLING*\n\n' +
      'Dear *{name}* (@{username}),\n' +
      'This is a reminder regarding your *{plan}* subscription.\n\n' +
      '• Monthly Fee: Rs. {monthlyFee}\n' +
      '• Prev. Arrears: Rs. {balance}\n' +
      '--------------------------\n' +
      '*TOTAL PAYABLE: Rs. {totalDue}*\n' +
      '--------------------------\n' +
      'Valid Until: {expiryDate}\n\n' +
      'Please clear your dues today to ensure uninterrupted service. If already paid, kindly ignore.\n\n' +
      'Thank you for choosing {businessName}!'
  },
  recovery_reminder: {
    category: 'recovery',
    label: 'Recovery Reminder — Recovery Ledger (WhatsApp button)',
    text: '{businessName} Recovery: Dear {name}, your payment for {period} (Dues: Rs. {balance}) is pending. Please clear it today. Thank you!'
  },
  receipt_share: {
    category: 'receipt',
    label: 'Receipt Share — Receipt Generator',
    text:
      '*{businessName} RECEIPT*\n' +
      '--------------------------\n' +
      '*Ref:* {transactionRef}\n' +
      '*Date:* {date}\n' +
      '*Customer:* {name}\n' +
      '*Method:* {method}\n' +
      '*Period:* {period}\n\n' +
      '*Amount Paid:* Rs. {paidAmount}\n' +
      '*Remaining Balance Amount:* Rs. {balance}\n' +
      '--------------------------\n' +
      'Thank you for your payment!'
  },
  receipt_share_recovery: {
    category: 'receipt',
    label: 'Receipt Share — Recovery Ledger (receipt shortcut)',
    text:
      '*{businessName} RECEIPT*\n' +
      '--------------------------\n' +
      '*Ref:* {transactionRef}\n' +
      '*Date:* {date}\n' +
      '*Customer:* {name}\n' +
      '*Period:* {period}\n' +
      '*Amount Paid:* Rs. {paidAmount}\n' +
      '*Next Due:* Rs. {nextDue}\n' +
      '--------------------------\n' +
      'Thank you!'
  },
  expiry_reminder: {
    category: 'expiry',
    label: 'Expiry Reminder — Expiries tab (AI-assisted fallback)',
    text: '{businessName} Reminder: Dear {userName}, your subscription (Rs. {amount}) expires on {expiryDate}. Please renew today.'
  },
  receipt_ai: {
    category: 'expiry',
    label: 'Receipt Confirmation — AI-assisted (Expiries service, currently unused)',
    text: '{businessName}: Payment received from {userName}. Amount: Rs. {amount}. Valid until: {expiryDate}. Thank you!'
  },
  bulk_reminder: {
    category: 'bulk',
    label: 'Bulk Reminder — Bulk Reminder tool',
    text:
      'Assalam o Alaikum {name} bhai,\n\n' +
      'Aap ka internet package {status}. Meherbani karke jald payment karwayein.\n\n' +
      'Balance: Rs. {amount}\n' +
      'Expiry: {expiry}\n\n' +
      '{businessName}\n' +
      '{phone}'
  }
};

export const TEMPLATE_CATEGORY_LABELS: Record<string, string> = {
  reminder: 'Billing Reminders',
  recovery: 'Recovery Ledger',
  receipt: 'Receipt Share',
  expiry: 'Expiry Reminders',
  bulk: 'Bulk Reminder',
  other: 'Other'
};

// Replaces {key} tokens in a template string with provided values.
export const renderTemplate = (template: string, vars: Record<string, string | number | undefined>): string => {
  let result = template;
  Object.entries(vars).forEach(([key, value]) => {
    const val = typeof value === 'number' ? value.toLocaleString() : (value ?? '');
    result = result.split(`{${key}}`).join(String(val));
  });
  return result;
};

// Gets the effective template (admin's custom edit if present, else built-in default).
export const getMessageTemplate = (settings: AppSettings | undefined, id: string): MessageTemplate => {
  return (settings?.messageTemplates && settings.messageTemplates[id]) || DEFAULT_MESSAGE_TEMPLATES[id];
};

// Convenience: get + render in one call.
export const renderMessageTemplate = (
  settings: AppSettings | undefined,
  id: string,
  vars: Record<string, string | number | undefined>
): string => {
  const tmpl = getMessageTemplate(settings, id);
  return renderTemplate(tmpl.text, vars);
};

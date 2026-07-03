import React, { useState, useMemo } from 'react';
import { MessageTemplate } from '../types';
import { DEFAULT_MESSAGE_TEMPLATES, TEMPLATE_CATEGORY_LABELS } from '../utils/messageTemplates';

interface MessageTemplatesTabProps {
  messageTemplates: Record<string, MessageTemplate> | undefined;
  onUpdateMessageTemplates: (templates: Record<string, MessageTemplate>) => void;
}

const PLACEHOLDER_HINTS: Record<string, string[]> = {
  billing_reminder: ['businessName', 'name', 'username', 'plan', 'monthlyFee', 'balance', 'totalDue', 'expiryDate'],
  recovery_reminder: ['businessName', 'name', 'period', 'balance'],
  receipt_share: ['businessName', 'transactionRef', 'date', 'name', 'method', 'period', 'paidAmount', 'balance'],
  receipt_share_recovery: ['businessName', 'transactionRef', 'date', 'name', 'period', 'paidAmount', 'nextDue'],
  expiry_reminder: ['businessName', 'userName', 'amount', 'expiryDate'],
  receipt_ai: ['businessName', 'userName', 'amount', 'expiryDate'],
  bulk_reminder: ['name', 'status', 'amount', 'expiry', 'businessName', 'phone']
};

const CATEGORY_ORDER = ['reminder', 'recovery', 'receipt', 'expiry', 'bulk', 'other'];

const MessageTemplatesTab: React.FC<MessageTemplatesTabProps> = ({
  messageTemplates,
  onUpdateMessageTemplates
}) => {
  const effectiveTemplates: Record<string, MessageTemplate> = useMemo(() => {
    return { ...DEFAULT_MESSAGE_TEMPLATES, ...(messageTemplates || {}) };
  }, [messageTemplates]);

  const [openCategory, setOpenCategory] = useState<string>('reminder');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ key: '', label: '', category: 'other', text: '' });

  const grouped = useMemo(() => {
    const map: Record<string, { key: string; template: MessageTemplate }[]> = {};
    Object.entries(effectiveTemplates).forEach(([key, template]) => {
      const cat = template.category || 'other';
      if (!map[cat]) map[cat] = [];
      map[cat].push({ key, template });
    });
    return map;
  }, [effectiveTemplates]);

  const isCustom = (key: string) => !DEFAULT_MESSAGE_TEMPLATES[key];
  const isEdited = (key: string) => !!(messageTemplates && messageTemplates[key]);

  const startEdit = (key: string, template: MessageTemplate) => {
    setEditingKey(key);
    setEditText(template.text);
  };

  const saveEdit = (key: string) => {
    const existing = effectiveTemplates[key];
    const updated = {
      ...(messageTemplates || {}),
      [key]: { ...existing, text: editText }
    };
    onUpdateMessageTemplates(updated);
    setEditingKey(null);
  };

  const resetToDefault = (key: string) => {
    if (!messageTemplates || !messageTemplates[key]) return;
    if (!confirm('Reset this template to its default wording?')) return;
    const updated = { ...messageTemplates };
    delete updated[key];
    onUpdateMessageTemplates(updated);
  };

  const deleteCustomTemplate = (key: string) => {
    if (!confirm('Delete this custom template permanently?')) return;
    const updated = { ...(messageTemplates || {}) };
    delete updated[key];
    onUpdateMessageTemplates(updated);
  };

  const handleAddNew = () => {
    if (!newTemplate.key.trim() || !newTemplate.label.trim() || !newTemplate.text.trim()) {
      alert('Key, label aur text sab required hain');
      return;
    }
    const safeKey = newTemplate.key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (effectiveTemplates[safeKey]) {
      alert('Ye key already exist karti hai, dusra naam try karein');
      return;
    }
    const updated = {
      ...(messageTemplates || {}),
      [safeKey]: {
        category: newTemplate.category,
        label: newTemplate.label,
        text: newTemplate.text
      }
    };
    onUpdateMessageTemplates(updated);
    setNewTemplate({ key: '', label: '', category: 'other', text: '' });
    setShowAddModal(false);
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-900 dark:bg-slate-900">
      {/* Header */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-white">Message Templates</h1>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-semibold text-sm transition-all"
          >
            + New Template
          </button>
        </div>
        <p className="text-slate-400 text-sm">
          Customer Directory, Recovery Ledger, Receipt Share, Expiry Reminder aur Bulk Reminder — sab jagah bhejay jaane wale WhatsApp/SMS messages yahan se edit karein.
        </p>
      </div>

      {/* Category List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {CATEGORY_ORDER.filter(cat => grouped[cat]?.length).map(cat => (
          <div key={cat} className="bg-slate-800/60 rounded-xl border border-white/10 overflow-hidden">
            <button
              onClick={() => setOpenCategory(openCategory === cat ? '' : cat)}
              className="w-full flex items-center justify-between p-4 text-left"
            >
              <span className="text-white font-semibold text-sm">
                {TEMPLATE_CATEGORY_LABELS[cat] || cat} <span className="text-slate-500 font-normal">({grouped[cat].length})</span>
              </span>
              <svg
                className={`w-5 h-5 text-slate-400 transition-transform ${openCategory === cat ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {openCategory === cat && (
              <div className="border-t border-white/10 divide-y divide-white/5">
                {grouped[cat].map(({ key, template }) => (
                  <div key={key} className="p-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="text-white text-sm font-medium">{template.label}</div>
                        <div className="text-slate-500 text-xs font-mono mt-0.5">{key}</div>
                      </div>
                      {isEdited(key) && (
                        <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-lg flex-shrink-0">
                          Edited
                        </span>
                      )}
                    </div>

                    {editingKey === key ? (
                      <div className="space-y-2">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={6}
                          className="w-full bg-slate-700/50 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono placeholder-slate-400 focus:outline-none focus:border-indigo-500/50 resize-none"
                        />
                        {PLACEHOLDER_HINTS[key] && (
                          <div className="flex flex-wrap gap-1.5">
                            {PLACEHOLDER_HINTS[key].map(ph => (
                              <span key={ph} className="text-xs bg-slate-700/50 text-slate-400 px-2 py-0.5 rounded font-mono">
                                {`{${ph}}`}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => setEditingKey(null)}
                            className="px-3 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-white text-xs font-medium"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => saveEdit(key)}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <pre className="text-slate-300 text-xs bg-slate-900/50 rounded-lg p-3 whitespace-pre-wrap font-mono mb-2">
                          {template.text}
                        </pre>
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => startEdit(key, template)}
                            className="px-3 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                          >
                            Edit
                          </button>
                          {isEdited(key) && !isCustom(key) && (
                            <button
                              onClick={() => resetToDefault(key)}
                              className="px-3 py-1.5 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-xs font-medium"
                            >
                              Reset to Default
                            </button>
                          )}
                          {isCustom(key) && (
                            <button
                              onClick={() => deleteCustomTemplate(key)}
                              className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium border border-rose-500/20"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add New Template Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-800 rounded-2xl border border-white/10 w-full max-w-md p-6 shadow-2xl max-h-screen overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-4">New Template</h2>
            <div className="space-y-4">
              <div>
                <label className="text-white text-sm font-medium block mb-2">Key (unique, no spaces)</label>
                <input
                  type="text"
                  value={newTemplate.key}
                  onChange={(e) => setNewTemplate({ ...newTemplate, key: e.target.value })}
                  placeholder="e.g., installation_followup"
                  className="w-full bg-slate-700/50 border border-white/10 rounded-xl px-4 py-2 text-white text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500/50"
                />
              </div>
              <div>
                <label className="text-white text-sm font-medium block mb-2">Label</label>
                <input
                  type="text"
                  value={newTemplate.label}
                  onChange={(e) => setNewTemplate({ ...newTemplate, label: e.target.value })}
                  placeholder="e.g., Installation Follow-up"
                  className="w-full bg-slate-700/50 border border-white/10 rounded-xl px-4 py-2 text-white text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500/50"
                />
              </div>
              <div>
                <label className="text-white text-sm font-medium block mb-2">Category</label>
                <select
                  value={newTemplate.category}
                  onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
                  className="w-full bg-slate-700/50 border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500/50"
                >
                  {CATEGORY_ORDER.map(cat => (
                    <option key={cat} value={cat}>{TEMPLATE_CATEGORY_LABELS[cat]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-white text-sm font-medium block mb-2">Message Text</label>
                <textarea
                  value={newTemplate.text}
                  onChange={(e) => setNewTemplate({ ...newTemplate, text: e.target.value })}
                  rows={6}
                  placeholder="Type your message... use {name}, {businessName} etc. as placeholders"
                  className="w-full bg-slate-700/50 border border-white/10 rounded-xl px-3 py-2 text-white text-xs font-mono placeholder-slate-400 focus:outline-none focus:border-indigo-500/50 resize-none"
                />
                <p className="text-slate-500 text-xs mt-1">
                  Note: yeh naya template abhi kisi automatic WhatsApp button se linked nahi hoga — sirf reference/manual copy ke liye hoga, jab tak developer ise kisi button se wire na kare.
                </p>
              </div>
              <div className="flex gap-3 pt-2 border-t border-white/10">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-4 py-2 rounded-xl bg-slate-700/50 hover:bg-slate-700 text-white font-semibold text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddNew}
                  className="flex-1 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessageTemplatesTab;

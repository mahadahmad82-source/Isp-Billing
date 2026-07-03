import React, { useState, useMemo } from 'react';
import { ReminderRecord, UserRecord } from '../types';

interface RemindersTabProps {
  reminders: ReminderRecord[];
  onAddReminder: (reminder: Omit<ReminderRecord, 'id' | 'createdAt'>) => void;
  onEditReminder: (id: string, updates: Partial<ReminderRecord>) => void;
  onDeleteReminder: (id: string) => void;
  onToggleReminder: (id: string) => void;
  users: UserRecord[];
}

interface NewReminderForm {
  title: string;
  description: string;
  dueDate: string;
  dueTime: string;
  priority: 'low' | 'medium' | 'high';
  category: 'billing' | 'customer' | 'equipment' | 'maintenance' | 'followup' | 'other';
  linkedUserId: string;
}

const RemindersTab: React.FC<RemindersTabProps> = ({
  reminders,
  onAddReminder,
  onEditReminder,
  onDeleteReminder,
  onToggleReminder,
  users
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending');
  const [sortBy, setSortBy] = useState<'dueDate' | 'priority' | 'created'>('dueDate');
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState<NewReminderForm>({
    title: '',
    description: '',
    dueDate: new Date().toISOString().split('T')[0],
    dueTime: '09:00',
    priority: 'medium',
    category: 'followup',
    linkedUserId: ''
  });

  const filteredReminders = useMemo(() => {
    let result = reminders || [];

    // Filter by completion status
    if (filter === 'pending') {
      result = result.filter(r => !r.completed);
    } else if (filter === 'completed') {
      result = result.filter(r => r.completed);
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(r =>
        r.title.toLowerCase().includes(query) ||
        r.description?.toLowerCase().includes(query) ||
        r.linkedUserName?.toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'dueDate') {
        const dateA = new Date(a.dueDate).getTime();
        const dateB = new Date(b.dueDate).getTime();
        return dateA - dateB;
      } else if (sortBy === 'priority') {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      } else {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    return result;
  }, [reminders, filter, sortBy, searchQuery]);

  const handleSubmit = () => {
    if (!formData.title.trim()) {
      alert('Title is required');
      return;
    }

    if (editingId) {
      const edited = reminders.find(r => r.id === editingId);
      if (edited) {
        onEditReminder(editingId, {
          ...formData,
          linkedUserName: formData.linkedUserId
            ? users.find(u => u.id === formData.linkedUserId)?.name
            : undefined
        });
      }
    } else {
      onAddReminder({
        ...formData,
        completed: false,
        linkedUserName: formData.linkedUserId
          ? users.find(u => u.id === formData.linkedUserId)?.name
          : undefined
      });
    }

    resetForm();
    setShowAddModal(false);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      dueDate: new Date().toISOString().split('T')[0],
      dueTime: '09:00',
      priority: 'medium',
      category: 'followup',
      linkedUserId: ''
    });
    setEditingId(null);
  };

  const startEdit = (reminder: ReminderRecord) => {
    setFormData({
      title: reminder.title,
      description: reminder.description || '',
      dueDate: reminder.dueDate,
      dueTime: reminder.dueTime || '09:00',
      priority: reminder.priority,
      category: reminder.category || 'followup',
      linkedUserId: reminder.linkedUserId || ''
    });
    setEditingId(reminder.id);
    setShowAddModal(true);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'medium':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'low':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const getCategoryIcon = (category?: string) => {
    switch (category) {
      case 'billing':
        return '💳';
      case 'customer':
        return '👤';
      case 'equipment':
        return '📦';
      case 'maintenance':
        return '🔧';
      case 'followup':
        return '📞';
      default:
        return '📌';
    }
  };

  const isOverdue = (dueDate: string) => {
    const due = new Date(dueDate);
    due.setHours(23, 59, 59);
    return due < new Date() && !reminders.find(r => r.dueDate === dueDate)?.completed;
  };

  const stats = {
    total: (reminders || []).length,
    pending: (reminders || []).filter(r => !r.completed).length,
    completed: (reminders || []).filter(r => r.completed).length,
    overdue: (reminders || []).filter(r => !r.completed && isOverdue(r.dueDate)).length
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-900 dark:bg-slate-900">
      {/* Header */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-white">Reminders</h1>
          <button
            onClick={() => {
              resetForm();
              setShowAddModal(true);
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-semibold text-sm transition-all"
          >
            + New Reminder
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          <div className="bg-slate-800/60 rounded-lg p-3 border border-white/10">
            <div className="text-slate-400 text-xs font-medium">Total</div>
            <div className="text-white text-xl font-bold">{stats.total}</div>
          </div>
          <div className="bg-slate-800/60 rounded-lg p-3 border border-white/10">
            <div className="text-slate-400 text-xs font-medium">Pending</div>
            <div className="text-white text-xl font-bold">{stats.pending}</div>
          </div>
          <div className="bg-slate-800/60 rounded-lg p-3 border border-white/10">
            <div className="text-slate-400 text-xs font-medium">Completed</div>
            <div className="text-white text-xl font-bold">{stats.completed}</div>
          </div>
          {stats.overdue > 0 && (
            <div className="bg-rose-500/10 rounded-lg p-3 border border-rose-500/20">
              <div className="text-rose-400 text-xs font-medium">Overdue</div>
              <div className="text-rose-400 text-xl font-bold">{stats.overdue}</div>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="p-4 border-b border-white/10 flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Search reminders..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-64 bg-slate-700/50 border border-white/10 rounded-xl px-4 py-2 text-white text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500/50"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          className="bg-slate-700/50 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500/50"
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as any)}
          className="bg-slate-700/50 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500/50"
        >
          <option value="dueDate">Due Date</option>
          <option value="priority">Priority</option>
          <option value="created">Newest</option>
        </select>
      </div>

      {/* Reminders List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredReminders.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-400">
            <div className="text-center">
              <div className="text-4xl mb-2">📋</div>
              <p>{filter === 'completed' ? 'No completed reminders' : 'No pending reminders'}</p>
            </div>
          </div>
        ) : (
          filteredReminders.map(reminder => (
            <div
              key={reminder.id}
              className={`bg-slate-800/60 rounded-xl border p-4 transition-all hover:border-indigo-500/50 ${
                reminder.completed
                  ? 'border-white/5 opacity-60'
                  : isOverdue(reminder.dueDate)
                  ? 'border-rose-500/30'
                  : 'border-white/10'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Checkbox */}
                <button
                  onClick={() => onToggleReminder(reminder.id)}
                  className={`flex-shrink-0 w-6 h-6 rounded-lg border-2 flex items-center justify-center mt-1 transition-all ${
                    reminder.completed
                      ? 'bg-emerald-500/20 border-emerald-500/50'
                      : 'border-white/20 hover:border-indigo-500/50'
                  }`}
                >
                  {reminder.completed && <span className="text-emerald-400 text-sm">✓</span>}
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{getCategoryIcon(reminder.category)}</span>
                    <h3
                      className={`font-semibold text-sm ${
                        reminder.completed
                          ? 'line-through text-slate-500'
                          : 'text-white'
                      }`}
                    >
                      {reminder.title}
                    </h3>
                    <span className={`text-xs font-medium border rounded px-2 py-1 ${getPriorityColor(reminder.priority)}`}>
                      {reminder.priority}
                    </span>
                  </div>

                  {reminder.description && (
                    <p className="text-slate-400 text-xs mb-2">{reminder.description}</p>
                  )}

                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span>📅 {new Date(reminder.dueDate).toLocaleDateString()}</span>
                    {reminder.dueTime && <span>⏰ {reminder.dueTime}</span>}
                    {reminder.linkedUserName && <span>👤 {reminder.linkedUserName}</span>}
                    {reminder.completedAt && (
                      <span className="text-emerald-400">✓ Completed {new Date(reminder.completedAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => startEdit(reminder)}
                    className="px-3 py-1 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Delete this reminder?')) {
                        onDeleteReminder(reminder.id);
                      }
                    }}
                    className="px-3 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium transition-all border border-rose-500/20"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-800 rounded-2xl border border-white/10 w-full max-w-md p-6 shadow-2xl max-h-screen overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingId ? 'Edit Reminder' : 'New Reminder'}
            </h2>

            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="text-white text-sm font-medium block mb-2">Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Call customer about plan upgrade"
                  className="w-full bg-slate-700/50 border border-white/10 rounded-xl px-4 py-2 text-white text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500/50"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-white text-sm font-medium block mb-2">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Add details..."
                  rows={3}
                  className="w-full bg-slate-700/50 border border-white/10 rounded-xl px-4 py-2 text-white text-sm placeholder-slate-400 focus:outline-none focus:border-indigo-500/50 resize-none"
                />
              </div>

              {/* Due Date */}
              <div>
                <label className="text-white text-sm font-medium block mb-2">Due Date *</label>
                <input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                  className="w-full bg-slate-700/50 border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500/50"
                />
              </div>

              {/* Due Time */}
              <div>
                <label className="text-white text-sm font-medium block mb-2">Time</label>
                <input
                  type="time"
                  value={formData.dueTime}
                  onChange={(e) => setFormData({ ...formData, dueTime: e.target.value })}
                  className="w-full bg-slate-700/50 border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500/50"
                />
              </div>

              {/* Priority */}
              <div>
                <label className="text-white text-sm font-medium block mb-2">Priority</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                  className="w-full bg-slate-700/50 border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500/50"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>

              {/* Category */}
              <div>
                <label className="text-white text-sm font-medium block mb-2">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                  className="w-full bg-slate-700/50 border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500/50"
                >
                  <option value="followup">Follow-up</option>
                  <option value="billing">Billing</option>
                  <option value="customer">Customer</option>
                  <option value="equipment">Equipment</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="other">Other</option>
                </select>
              </div>

              {/* Link Customer */}
              <div>
                <label className="text-white text-sm font-medium block mb-2">Link Customer (Optional)</label>
                <select
                  value={formData.linkedUserId}
                  onChange={(e) => setFormData({ ...formData, linkedUserId: e.target.value })}
                  className="w-full bg-slate-700/50 border border-white/10 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-indigo-500/50"
                >
                  <option value="">None</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4 border-t border-white/10">
                <button
                  onClick={() => {
                    resetForm();
                    setShowAddModal(false);
                  }}
                  className="flex-1 px-4 py-2 rounded-xl bg-slate-700/50 hover:bg-slate-700 text-white font-semibold text-sm transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  className="flex-1 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm transition-all"
                >
                  {editingId ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RemindersTab;

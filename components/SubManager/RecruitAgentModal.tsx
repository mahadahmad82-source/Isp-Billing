
import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';

interface RecruitAgentModalProps {
  isOpen: boolean;
  onClose: () => void;
  managerId: string;
  onSuccess: (agent: any) => void;
}

const RecruitAgentModal: React.FC<RecruitAgentModalProps> = ({ isOpen, onClose, managerId, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    phone: '',
    email: '',
    password: '',
    area: 'Zone A',
    salary: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Mock asynchronous API call for UI preview
    setTimeout(() => {
      // 1. Instantly trigger a standard browser alert or custom UI text div
      alert(`Success: Agent ${formData.name} has been recruited! Routing to portal creation...`);

      // We also show the sleek success UI 
      setSuccess(true);
      
      setTimeout(() => {
        onSuccess(formData); 
        
        // 2. Clear out all the field states to reset the form inputs
        setFormData({ name: '', username: '', phone: '', email: '', password: '', area: 'Zone A', salary: '' });
        setSuccess(false);

        // 3. Close the modal container reactively
        onClose();
        setIsLoading(false);
      }, 500);
    }, 600);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-[#12162a] rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/5 overflow-hidden animate-in zoom-in-95 duration-300">
        
        {success ? (
          <div className="p-12 text-center space-y-4">
            <div className="w-20 h-20 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mx-auto animate-bounce">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Agent Recruited!</h3>
            <p className="text-slate-500 dark:text-slate-400 font-medium">Field agent has been added to your profile table.</p>
          </div>
        ) : (
          <>
            <div className="px-8 pt-8 pb-6 border-b border-slate-100 dark:border-white/5">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Recruit New Field Agent</h3>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Field Operation expansion</p>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-5">
              <div className="grid grid-cols-2 gap-5">
                <div className="col-span-2 space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                  <input 
                    required
                    type="text" 
                    placeholder="Enter agent name"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Username</label>
                  <input 
                    required
                    type="text" 
                    placeholder="agent123"
                    value={formData.username || ''}
                    onChange={e => setFormData({...formData, username: e.target.value.toLowerCase().trim()})}
                    className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Phone Number</label>
                  <input 
                    required
                    type="tel" 
                    placeholder="03xx-xxxxxxx"
                    value={formData.phone}
                    onChange={e => setFormData({...formData, phone: e.target.value})}
                    className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                  <input 
                    required
                    type="email" 
                    placeholder="agent@myisp.com"
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Portal Password</label>
                  <input 
                    required
                    type="password" 
                    placeholder="Min 6 chars"
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>

                <div className="col-span-2 space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Monthly Salary / Commission %</label>
                  <div className="relative">
                    <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">Rs.</span>
                    <input 
                      required
                      type="number" 
                      placeholder="0.00"
                      value={formData.salary}
                      onChange={e => setFormData({...formData, salary: e.target.value})}
                      className="w-full pl-12 pr-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-4 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/10 transition-all font-sans"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={isLoading}
                  className="flex-[2] py-4 rounded-2xl bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-600/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isLoading ? (
                    <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>
                      Recruit Agent
                    </>
                  )}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default RecruitAgentModal;

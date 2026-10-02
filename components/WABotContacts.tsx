import React, { useEffect, useMemo, useState } from 'react';

interface ContactCustomer {
  id: string;
  name: string;
  username?: string;
  phone: string;
}

interface WABotContactsProps {
  customers: ContactCustomer[];
  // phones that already have a chat thread (marked with a badge)
  chatPhones: string[];
  onOpenChat: (phone: string) => void;
}

const normalizePhone = (raw: any): string => {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('92') && digits.length === 12) return digits.slice(2);
  if (digits.startsWith('0') && digits.length === 11) return digits.slice(1);
  return digits.length === 10 ? digits : '';
};

const initials = (name: string) => (name || '?').trim().slice(0, 1).toUpperCase();

// Customer directory, mirroring Android's Contacts screen: search the full
// customer list (not just numbers that already texted the bot) and open a
// chat directly. Optionally merges the browser's Contact Picker results.
const WABotContacts: React.FC<WABotContactsProps> = ({ customers, chatPhones, onOpenChat }) => {
  const [query, setQuery] = useState('');
  const [deviceEntries, setDeviceEntries] = useState<{ name: string; phone: string }[]>([]);
  const [deviceError, setDeviceError] = useState('');

  const chatSet = useMemo(() => new Set((chatPhones || []).map(normalizePhone)), [chatPhones]);

  const entries = useMemo(() => {
    const seen = new Set<string>();
    const list: { id: string; name: string; phone: string; isCustomer: boolean }[] = [];
    const push = (id: string, name: string, phone: string, isCustomer: boolean) => {
      const norm = normalizePhone(phone);
      if (!norm || seen.has(norm)) return;
      seen.add(norm);
      list.push({ id, name: name || 'Unknown', phone: norm, isCustomer });
    };
    (customers || []).forEach(c => push(`c-${c.id}`, c.name || c.username || 'Unknown', c.phone, true));
    deviceEntries.forEach((d, i) => push(`d-${i}`, d.name, d.phone, false));
    list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [customers, deviceEntries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    const qDigits = q.replace(/\D/g, '');
    return entries.filter(e => e.name.toLowerCase().includes(q) || (qDigits && e.phone.includes(qDigits)));
  }, [entries, query]);

  const contactsApiAvailable =
    typeof navigator !== 'undefined' && !!(navigator as any).contacts?.select;

  const importDeviceContacts = async () => {
    setDeviceError('');
    try {
      const picked: any[] = await (navigator as any).contacts.select(['name', 'tel'], { multiple: true });
      const mapped = (picked || [])
        .map(p => ({
          name: String(p?.name?.[0] || 'Unknown'),
          phone: normalizePhone(p?.tel?.[0]),
        }))
        .filter((d: any) => d.phone);
      setDeviceEntries(mapped);
      if (mapped.length === 0) setDeviceError('No usable phone numbers in the selected contacts.');
    } catch (e: any) {
      if (e?.name !== 'AbortError') setDeviceError('Could not read device contacts.');
    }
  };

  // Clear a stale device-contact merge when the customer list reloads.
  useEffect(() => { setDeviceEntries([]); }, [customers.length]);

  return (
    <div className="flex-1 min-h-0 bg-white dark:bg-[#111B21] rounded-2xl border border-[#E9EDEF] dark:border-[#222D34] overflow-hidden flex flex-col">
      <div className="p-3 sm:p-4 border-b border-[#E9EDEF] dark:border-[#222D34] space-y-2.5">
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#F0F2F5] dark:bg-[#202C33]">
          <svg className="w-4 h-4 flex-shrink-0 text-[#667781] dark:text-[#8696A0]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name or number"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm font-semibold text-[#111B21] dark:text-[#E9EDEF] placeholder-[#667781] dark:placeholder-[#8696A0]"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-[#667781] dark:text-[#8696A0] hover:text-[#00A884] flex-shrink-0" title="Clear">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
        {contactsApiAvailable && (
          <button
            onClick={importDeviceContacts}
            className="w-full text-[11px] font-black uppercase tracking-widest text-[#00A884] hover:underline py-1"
          >
            Import from device contacts
          </button>
        )}
        {deviceError && <p className="text-[11px] font-bold text-rose-500">{deviceError}</p>}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
        {filtered.length === 0 ? (
          <p className="text-center text-sm font-bold text-[#667781] dark:text-[#8696A0] py-16">
            {entries.length === 0 ? 'No customers found.' : 'No matches.'}
          </p>
        ) : (
          filtered.map(e => (
            <button
              key={e.id}
              type="button"
              onClick={() => onOpenChat(e.phone)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[#F0F2F5] dark:hover:bg-[#202C33]/60 transition-colors text-left"
            >
              <span className="w-11 h-11 rounded-full bg-[#00A884] text-white flex items-center justify-center text-base font-black flex-shrink-0">
                {initials(e.name)}
              </span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="text-sm font-black text-[#111B21] dark:text-[#E9EDEF] truncate">{e.name}</span>
                  {e.isCustomer && (
                    <svg className="w-3.5 h-3.5 flex-shrink-0 text-[#00A884]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1.2 14.2l-4-4 1.4-1.4 2.6 2.6 5.6-5.6 1.4 1.4-7 7z" /></svg>
                  )}
                </span>
                <span className="block text-[11px] font-bold text-[#667781] dark:text-[#8696A0]">+92{e.phone}{chatSet.has(e.phone) ? ' · has chat' : ''}</span>
              </span>
              <svg className="w-5 h-5 flex-shrink-0 text-[#00A884]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default WABotContacts;

# Category B Conversion — Remaining Work Tracker

**Goal:** Convert admin/manager dashboard files to clean English + replace all emoji with inline SVG icons (using the shared icon set at `components/icons/UiIcons.tsx`).

**How to resume:** Start a new chat and say "MYISP: continue Category B conversion — do `<filename>`" (or just "do the next file"). This doc has everything needed — exact line numbers, current text, and what's already built.

**Already built and reusable:**
- `components/icons/UiIcons.tsx` — shared SVG icon library (Bolt, Close, Clipboard, CheckCircle, Warning, MapPin, Package, etc.) — check this file first before creating a new icon, most needs are already covered.
- `utils/i18n.ts` + `components/LanguageToggle.tsx` — EN/UR toggle system, already wired into Login + Header. Not required for this task, just don't conflict with it.

**Rule reminders:**
- Customer-facing WhatsApp message text (e.g. `wa.me/...?text=...` strings sent TO customers) should STAY in Roman Urdu — only convert admin-facing UI chrome (labels, buttons, toasts, headers).
- No emoji anywhere in JSX — use/add an SVG icon from `UiIcons.tsx` instead.
- Emoji inside plain-string toasts/alerts (not JSX) — just strip the emoji, can't embed SVG in a plain string.
- After each file: sanity-check brace/paren balance with a quick node script, then `git add -A && git commit && git push`.

---

## `components/Settings.tsx`

- [ ] Not started

### Roman Urdu lines to convert:
```
56:    if (!biometricConfirmPassword) { setBiometricError('Password enter karein'); return; }
74:      if (!verified) { setBiometricError('Password ghalat hai'); return; }
92:      if (!registered) { setBiometricError('Device ne fingerprint register nahi kiya. Dobara try karein.'); return; }
167:      setLinkError('Valid email enter karein');
876:              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">Apni marzi se serial number set karo — receipts yahan se start hongi</p>
936:            <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">Yeh starting number save hone ke baad <strong>naye receipts</strong> pe apply hoga. Receipt generate karte waqt aap manually bhi number change kar sakte hain.</p>
948:              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">WhatsApp support bot ka naam customize karo</p>
1068:                  {pushEnabled ? '✅ Is device pe notifications ON hain' : pushSupported ? '❌ Notifications OFF hain' : '⚠️ Aapka browser support nahi karta'}
1105:                💡 Toggle ON karo — browser permission maangega. "Allow" karo aur phir notifications shuru ho jayengi!
1122:                    {biometricEnabled ? '✅ Is device pe fingerprint login ON hai' : '❌ Fingerprint login OFF hai'}
1138:                  Security ke liye pehle apna current password confirm karein — is k baad device fingerprint mangega.
```

### Emoji characters present (need SVG icon replacement):
Line 123: ['🔔'] -> await sendPushNotification(activeManager, '🔔 MYISP Notifications Active!', 'Aapko ab expiry aur paym
Line 234: ['✓'] -> setSaveStatus('Settings Saved! ✓');
Line 935: ['⚠', '️'] -> <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb
Line 1068: ['✅', '❌', '⚠', '️'] -> {pushEnabled ? '✅ Is device pe notifications ON hain' : pushSupported ? '❌ Notifications OFF hain' :
Line 1089: ['🔴'] -> { icon: '🔴', text: '3 din mein expire hone wale customers' },
Line 1090: ['🧾'] -> { icon: '🧾', text: 'Receipt generate ho' },
Line 1091: ['👤'] -> { icon: '👤', text: 'Naya customer add ho' },
Line 1105: ['💡'] -> 💡 Toggle ON karo — browser permission maangega. "Allow" karo aur phir notifications shuru ho jayengi
Line 1122: ['✅', '❌'] -> {biometricEnabled ? '✅ Is device pe fingerprint login ON hai' : '❌ Fingerprint login OFF hai'}
Line 1169: ['💡'] -> 💡 Ab login page par fingerprint icon dikhega, aur app khulte hi fingerprint mangega.
Line 1255: ['🎓'] -> <div className="w-10 h-10 bg-indigo-500/20 rounded-2xl flex items-center justify-center text-xl">🎓</
Line 1280: ['🔧'] -> <div className="w-10 h-10 bg-orange-500/20 rounded-2xl flex items-center justify-center text-xl">🔧</
Line 1321: ['✅', '❌', '🔌'] -> {mikrotikStatus === 'testing' ? '...' : mikrotikStatus === 'ok' ? '✅ Connected' : mikrotikStatus ===
Line 1334: ['🔄'] -> {mikrotikSyncing ? '⏳ Syncing...' : '🔄 Sync Users'}
Line 1337: ['⚠', '️'] -> <p className="text-[10px] dark:text-white/30 text-slate-400">⚠️ Router same network pe hona chahiye.

---

## `components/UserManagement.tsx`

- [ ] Not started

### Roman Urdu lines to convert:
```
283:        message: `${selectedMonth} mein koi customer nahi mila export karne ke liye.`,
520:    setAlertConfig({ title: 'Plan Updated', message: `${updatedUsers.length} users ka plan "${bulkNewPlan}" ho gaya — Rs. ${price}/mo.`, type: 'success' });
535:    setAlertConfig({ title: 'Area Updated', message: `${updatedUsers.length} users ka area "${bulkNewArea.trim()}" set ho gaya.`, type: 'success' });
713:                  onClick={() => { if(selectedIds.length===0){setAlertConfig({title:'No Selection',message:'Pehle users select karein.',type:'info'});return;} setBulkNewPlan(availablePlans[0]||'');setShowBulkChangePlan(true); }}
770:                  onClick={() => { if(selectedIds.length===0){setAlertConfig({title:'No Selection',message:'Pehle users select karein.',type:'info'});return;} setBulkNewArea(''); setShowBulkSetArea(true); }}
1039:                                      if (window.confirm(`${user.name} ko active list se hatayen? Directory mein rahega, sirf is mahine ki activation hatengi.`)) {
1136:                    <input list="um-area-options" className="w-full p-6 rounded-3xl bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/5 font-bold outline-none text-slate-900 dark:text-white text-lg focus:border-indigo-500 transition-all" placeholder="Area select ya naya likhein..." value={formData.area || ''} onChange={e => setFormData({...formData, area: e.target.value})} />
1335:                  setAlertConfig({ title: 'Activated!', message: `${u.name} ko ${currentMonth} ke liye activate kar diya gaya.`, type: 'success' });
1441:                  placeholder="Area select ya naya likhein..."
1479:                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Username aur expiry date paste karein — system automatically active kar dega</p>
1496:                      <div className="text-[11px] font-black text-slate-800 dark:text-white uppercase tracking-widest">Status bhi Active karo</div>
1497:                      <div className="text-[10px] text-slate-400 dark:text-slate-500">{bulkExpiryActivate ? 'ON — expiry + status: active' : 'OFF — sirf expiry update hogi'}</div>
```

### Emoji characters present (need SVG icon replacement):
Line 660: ['✕'] -> <button onClick={onClearCustomerStatusFilter} className="ml-1 hover:text-white/60 transition-colors"
Line 680: ['🔍'] -> <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl text-slate-400 group-focus-within
Line 980: ['✓'] -> {hasReceipt ? '✓ Paid' : '⏳ Pending'}
Line 983: ['🟢', '🔴'] -> {!isExpired ? '🟢 Active' : '🔴 Expired'}
Line 1081: ['👤'] -> <div className="w-14 h-14 bg-[#5a4ff0] rounded-3xl flex items-center justify-center text-white text-
Line 1167: ['📜'] -> <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text
Line 1173: ['✕'] -> <button onClick={() => setViewingLedgerUser(null)} className="p-3 bg-white dark:bg-slate-800 rounded
Line 1416: ['✅'] -> ✅ Apply
Line 1462: ['✅'] -> ✅ Apply
Line 1477: ['📅'] -> <div className="w-16 h-16 bg-violet-100 dark:bg-violet-500/10 rounded-2xl flex items-center justify-
Line 1516: ['✅'] -> >✅ Apply</button>
Line 1523: ['✅'] -> <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-500/10 rounded-2xl flex items-center justif
Line 1529: ['✅'] -> <div className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-wid
Line 1535: ['❌'] -> <div className="text-[10px] font-black text-rose-700 dark:text-rose-400 uppercase tracking-widest mb

---

## `components/RecoverySummary.tsx`

- [ ] Not started

### Roman Urdu lines to convert:
```
914:              <p className="text-sm text-slate-400 dark:text-slate-500 font-bold text-center py-6">Koi pending credit recovery nahi hai.</p>
925:                        <p className="text-xs text-slate-500 dark:text-slate-400 font-bold">{u.phone} • {days} din se pending • {reminderCount}/6 reminders{capped ? ' — manual follow-up zaroori' : ''}</p>
1245:                          if (window.confirm(item.name + " ko is mahine ki list se hatayen? Directory mein rahega.")) {
1477:                  <p className="text-center text-sm text-slate-400 py-6 font-bold">Sab users already is period mein hain ✅</p>
```

### Emoji characters present (need SVG icon replacement):
Line 671: ['📞'] -> <p>📞 {settings.businessPhone}</p>
Line 672: ['✉', '️'] -> <p>✉️ {settings.businessEmail}</p>
Line 901: ['🟡'] -> 🟡 Credit / Advance Recovery
Line 1009: ['✕'] -> <button onClick={closeSheet} className="p-4 bg-white dark:bg-slate-800 rounded-2xl text-slate-400 da
Line 1014: ['🔍'] -> <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
Line 1365: ['✕'] -> <button onClick={() => setViewingReceipt(null)} className="w-10 h-10 bg-black/10 dark:bg-white/10 ho
Line 1429: ['✕'] -> <button onClick={() => setShowAddUserModal(false)} className="w-9 h-9 rounded-2xl bg-slate-100 dark:
Line 1477: ['✅'] -> <p className="text-center text-sm text-slate-400 py-6 font-bold">Sab users already is period mein ha
Line 1494: ['✕'] -> <button onClick={() => setEditingUser(null)} className="p-2 text-slate-400 hover:text-rose-500 trans
Line 1604: ['✕'] -> <button onClick={() => { setQuickReceiptUser(null); setQuickReceiptPreSelectConsumed(false); }} clas
Line 1644: ['✕'] -> <button onClick={() => setViewingLedgerUser(null)} className="p-3 bg-white dark:bg-slate-800 rounded

---

## `components/ReceiptGenerator.tsx`

- [ ] Not started

### Roman Urdu lines to convert:
```
1396:                                <button onClick={() => { if(window.confirm('Yeh receipt delete karna chahte hain?')) onDeleteReceipt(r.id); }} className="px-3 py-2 text-rose-600 font-black text-[10px] uppercase bg-rose-50 dark:bg-rose-500/10 rounded-xl transition-all hover:bg-rose-600 hover:text-white flex items-center gap-1.5">
```

### Emoji characters present (need SVG icon replacement):
Line 417: ['✅'] -> const caption = `*${settings.businessName} RECEIPT*\nRef: ${receipt.transactionRef}\n${advanceLine}A
Line 794: ['📞'] -> <p className="flex items-center gap-3"><span className="text-lg">📞</span> {settings.businessPhone}</
Line 795: ['✉', '️'] -> <p className="flex items-center gap-3"><span className="text-lg">✉️</span> {settings.businessEmail}<
Line 796: ['📍'] -> <p className="flex items-center gap-3 col-span-2"><span className="text-lg">📍</span> {settings.busin
Line 914: ['📢'] -> <span className="text-2xl">📢</span>
Line 1590: ['✓'] -> ✓ Receipt Downloaded Successfully
Line 1595: ['⚡'] -> ⚡ Preparing Download...
Line 1600: ['📤', '✓', '⚠'] -> {autoSendStatus === 'sending' ? '📤 Sending Receipt to Customer via WhatsApp...' : autoSendStatus ===

---

## `components/AdminDashboard.tsx`

- [ ] Not started

### Roman Urdu lines to convert:
```
410:          <span className="text-slate-400 font-bold text-sm">Supabase se live data load ho raha hai...</span>
505:              {managers.length === 0 && <div className="text-center py-10 text-slate-600 text-sm">Koi manager nahi</div>}
579:                      <p className="px-5 py-8 text-center text-slate-600 text-xs">Koi customer nahi</p>
606:            {sortedManagers.length === 0 && <div className="text-center py-16 flex flex-col items-center text-slate-600"><Inbox className="w-12 h-12 mb-3" /><p className="font-bold text-sm">Koi manager nahi mila</p></div>}
633:            <div className="flex items-center justify-center py-24 gap-3"><div className="w-6 h-6 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" /><span className="text-slate-400 font-bold text-sm">Load ho rahe hain...</span></div>
649:                      <tr><td colSpan={8} className="px-5 py-12 text-center text-slate-600">{allCustomers.length === 0 ? 'Click "Load Customers"' : 'Koi result nahi'}</td></tr>
701:            <div className="flex items-center justify-center py-24 gap-3"><div className="w-6 h-6 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" /><span className="text-slate-400 font-bold text-sm">Load ho rahe hain...</span></div>
710:                  <div className="text-center py-16 text-slate-600 flex flex-col items-center gap-3"><Activity className="w-12 h-12" /><p className="font-bold text-sm">{activityLogs.length === 0 ? 'Click "Load Logs"' : 'Koi activity nahi'}</p></div>
786:                          {storageComputed.usedPct >= 90 ? 'Storage critical! Supabase Pro plan upgrade karein.' : 'Storage 70% se zyada. Monitor karte rahein.'}
794:              <div className="text-center py-4 text-slate-500 text-sm">Storage info load nahi ho saka.</div>
882:            <p className="text-[11px] text-slate-500">Har manager ka plan, status aur access control karein</p>
916:            <div className="flex items-center justify-center py-20 gap-3"><div className="w-5 h-5 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" /><span className="text-slate-400 font-bold text-sm">Load ho raha hai...</span></div>
918:            <div className="text-center py-20 text-slate-600 flex flex-col items-center gap-3"><Shield className="w-12 h-12" /><p className="font-bold text-sm">Koi record nahi. Upar se add karein.</p></div>
980:                    <input type="text" placeholder="Notes — Enter se save hoga" defaultValue={sub.notes||''}
1021:            <p className="text-xs text-slate-500 mb-4">Yeh action <span className="font-black text-rose-400">permanent</span> hai.</p>
```

### Emoji characters present (need SVG icon replacement):
Line 167: ['🔴', '🟡', '🟢'] -> const statusLabel = usedPct >= 90 ? '🔴 Critical' : usedPct >= 70 ? '🟡 Warning' : '🟢 Healthy';
Line 194: ['✅'] -> if (!error) { await loadSubscriptions(); showSubToast('✅ Updated: ' + managerId); }
Line 195: ['❌'] -> else showSubToast('❌ Error: ' + error.message);
Line 768: ['💾'] -> { label: 'Used', value: `${storageComputed.usedMB} MB`, color: 'text-indigo-300', icon: '💾' },
Line 769: ['✅'] -> { label: 'Remaining', value: `${storageComputed.remainingMB} MB`, color: 'text-emerald-400', icon: '
Line 771: ['👥'] -> { label: 'Managers (rows)', value: storageInfo!.row_count.toString(), color: 'text-blue-300', icon: 
Line 772: ['📊'] -> { label: 'Table Size', value: storageInfo!.table_size_pretty, color: 'text-purple-300', icon: '📊' },
Line 773: ['📦'] -> { label: 'Avg Row Size', value: `${Math.round(storageInfo!.avg_row_size_bytes / 1024)} KB`, color: '
Line 825: ['✅'] -> alert('✅ Restored!'); window.location.reload();

---

## `components/EquipmentTracker.tsx`

- [ ] Not started

### Roman Urdu lines to convert:
```
102:      showToast('Serial number, brand aur model zaroori hain!'); return;
115:    if (!assignItem || !assignUserId) { showToast('Customer select karo!'); return; }
124:    showToast(`${assignItem.brand} ${assignItem.model} — ${user?.name} ko assign ho gaya!`);
141:    if (!sellItem || !sellUserId) { showToast('Customer select karo!'); return; }
174:      showToast('Receipt download nahi ho saki.');
192:    else showToast('Customer ka phone number nahi mila.');
327:        <p style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', marginTop: 18 }}>Shukriya! Yeh receipt aapke record ke liye hai.</p>
605:          <p className="font-bold text-lg">Koi equipment nahi</p>
606:          <p className="text-sm mt-1">Pehla device add karo</p>
656:            <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-sm mb-6`}>Yeh action undo nahi ho sakti.</p>
```

### Emoji characters present (need SVG icon replacement):
Line 17: ['📡'] -> router: '📡 Router',
Line 18: ['🔌'] -> onu_ont: '🔌 ONU / ONT',
Line 19: ['🔄'] -> media_converter: '🔄 Media Converter',
Line 20: ['🔀'] -> switch: '🔀 Switch',
Line 21: ['🪢'] -> cable: '🪢 Cable',
Line 22: ['⚡'] -> power_adapter: '⚡ Power Adapter',
Line 23: ['📦'] -> other: '📦 Other',
Line 231: ['✅'] -> ✅ Assign Karo
Line 277: ['💰'] -> 💰 Bech Kar Receipt Banao
Line 333: ['⬇', '️'] -> ⬇️ Download
Line 337: ['📲'] -> 📲 WhatsApp Bhejo
Line 416: ['💾', '➕'] -> {editingId ? '💾 Save Changes' : '➕ Add Equipment'}
Line 478: ['️'] -> ↩️ Return / Wapas Lo
Line 497: ['🧾'] -> 🧾 Receipt Dekho / Dobara Bhejo
Line 507: ['📲'] -> 📲 Assign Karo
Line 511: ['💰'] -> 💰 Becho
Line 520: ['✏', '️'] -> ✏️ Edit
Line 524: ['🗑', '️'] -> 🗑️ Delete
Line 604: ['📦'] -> <div className="text-5xl mb-4">📦</div>
Line 625: ['👤'] -> 👤 {item.assignedToUserName}
Line 630: ['💰'] -> 💰 {item.soldToUserName}

---

## `components/BusinessAnalytics.tsx`

- [ ] Not started

### Roman Urdu lines to convert:
```
420:                        Koi active customer par discount set nahi hai. Customer edit karke "Monthly Discount" field mein amount daalein.
480:              <p className="text-sm text-slate-400 dark:text-slate-500 font-bold text-center py-6">Is din koi collection nahi hui.</p>
```

### Emoji characters present (need SVG icon replacement):

---

## `components/LeadsPipeline.tsx`

- [ ] Not started

### Roman Urdu lines to convert:
```
82:    if (!form.name?.trim() || !form.phone?.trim()) { showToast('Naam aur phone zaroori hain!'); return; }
89:      showToast('Lead add ho gaya!');
105:    showToast('Lead lost mark ho gaya.');
285:          <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-xs mt-0.5`}>New connection inquiries track karo</p>
337:          <p className="font-bold text-lg">Koi lead nahi</p>
338:          <p className="text-sm mt-1">Pehla inquiry add karo</p>
382:                showToast(`${confirmConvert.name} customer mein convert ho gaya!`);
395:            <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-sm mb-6`}>Yeh action undo nahi ho sakti.</p>
```

### Emoji characters present (need SVG icon replacement):
Line 18: ['📞'] -> contacted:       { label: 'Contacted',        emoji: '📞', color: 'text-blue-400',    bg: 'bg-blue-50
Line 19: ['📍'] -> survey_done:     { label: 'Survey Done',      emoji: '📍', color: 'text-yellow-400',  bg: 'bg-yellow-
Line 20: ['🔧'] -> install_pending: { label: 'Install Pending',  emoji: '🔧', color: 'text-orange-400',  bg: 'bg-orange-
Line 21: ['✅', '🎉'] -> converted:       { label: 'Converted ✅',     emoji: '🎉', color: 'text-emerald-400', bg: 'bg-emerald-
Line 22: ['❌'] -> lost:            { label: 'Lost / No Deal',   emoji: '❌', color: 'text-red-400',     bg: 'bg-red-500
Line 196: ['💾', '➕'] -> {editId ? '💾 Save Changes' : '➕ Add Lead'}
Line 264: ['❌'] -> ❌ Mark as Lost
Line 270: ['✏', '️'] -> className={`flex-1 py-3 ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 
Line 272: ['🗑', '️'] -> className="flex-1 py-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl font-bold tex
Line 315: ['✅'] -> <p className={`text-[9px] font-bold ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase trackin
Line 336: ['🎯'] -> <div className="text-5xl mb-4">🎯</div>
Line 355: ['📍'] -> {lead.area && <p className={`${isDark ? 'text-white/30' : 'text-slate-400'} text-xs mt-1`}>📍 {lead.a
Line 356: ['📦'] -> {lead.interestedPlan && <p className="text-indigo-400 text-xs mt-1">📦 {lead.interestedPlan}</p>}
Line 359: ['✅'] -> {cfg.emoji} {cfg.label.replace(' ✅','')}
Line 373: ['🎉'] -> <p className="text-4xl mb-3">🎉</p>
Line 383: ['✅'] -> }} className="flex-1 py-3 bg-emerald-600 rounded-2xl font-bold text-sm">Convert ✅</button>

---

## `components/AreaDashboard.tsx`

- [ ] Not started

### Roman Urdu lines to convert:
```
41:      showToast('Yeh area pehle se maujood hai!');
46:    showToast(`"${name}" area add ho gaya!`);
51:    showToast(`"${name}" area list se hata diya (customers ka data safe hai).`);
171:        <p className={`text-[10px] ${isDark ? 'text-white/30' : 'text-slate-400'}`}>Area badalne ke liye dropdown use karein</p>
246:            <p className={`text-xs ${isDark ? 'text-white/30' : 'text-slate-400'}`}>Abhi koi area define nahi. Upar naam likh kar "Add" dabayein — phir Customer Directory ke form mein yeh area select ho sakega.</p>
298:          <p className="font-bold">Koi area nahi mila</p>
299:          <p className="text-sm mt-1">Customers mein area set karo</p>
```

### Emoji characters present (need SVG icon replacement):
Line 133: ['📍'] -> <h2 className="text-2xl font-black mb-1">📍 {selectedArea}</h2>
Line 251: ['📍'] -> 📍 {a}
Line 297: ['📍'] -> <div className="text-5xl mb-4">📍</div>
Line 310: ['📍'] -> <p className="font-black text-base">📍 {area.area}</p>
Line 332: ['✅'] -> <span className="text-emerald-400 font-bold">✅ {area.active}</span>
Line 333: ['❌'] -> <span className="text-red-400 font-bold">❌ {area.expired}</span>

---

## `components/EmployeePanel.tsx`

- [ ] Not started

### Roman Urdu lines to convert:
```
267:              <input type="text" placeholder="Auto generate hoga agar khali ho" value={receiptRef} onChange={e => setReceiptRef(e.target.value)}
284:              Receipt manager ke account mein save hogi
299:            <p className={`text-sm mb-5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Kya aap logout karna chahte hain?</p>
```

### Emoji characters present (need SVG icon replacement):
Line 106: ['✅'] -> setReceiptSuccess(`✅ Receipt generated: ${ref}`);
Line 136: ['📊'] -> { id: 'recovery', label: '📊 Recovery Ledger' },
Line 137: ['🧾'] -> { id: 'receipt', label: '🧾 Generate Receipt' },
Line 218: ['✓'] -> {item.hasPaid ? '✓ Paid' : '⏳ Pending'}
Line 280: ['🧾'] -> 🧾 Receipt Generate Karo

---

## `components/OutageTracker.tsx`

- [ ] Not started

### Roman Urdu lines to convert:
```
45:    if (!form.title.trim()) { showToast('Title zaroori hai!'); return; }
319:          <p className="font-bold text-lg">Koi outage nahi</p>
320:          <p className="text-sm mt-1">Alhamdulillah sab theek hai!</p>
```

### Emoji characters present (need SVG icon replacement):
Line 15: ['🟡'] -> degraded: { label: 'Degraded',     emoji: '🟡', color: 'text-yellow-400', bg: 'bg-yellow-500/15 borde
Line 16: ['🟠'] -> partial:  { label: 'Partial Down', emoji: '🟠', color: 'text-orange-400', bg: 'bg-orange-500/15 borde
Line 17: ['🔴'] -> full:     { label: 'Full Outage',  emoji: '🔴', color: 'text-red-400',    bg: 'bg-red-500/15 border-r
Line 66: ['✅'] -> showToast('Outage resolved! ✅');
Line 126: ['🔴'] -> 🔴 Log Outage
Line 207: ['✅'] -> ✅ Mark Resolved
Line 214: ['🗑', '️'] -> 🗑️ Delete Log
Line 281: ['👥'] -> {o.affectedCount && <span>👥 {o.affectedCount} users</span>}
Line 282: ['📍'] -> {o.areasAffected.length > 0 && <span>📍 {o.areasAffected.slice(0,2).join(', ')}{o.areasAffected.lengt
Line 305: ['✅'] -> <span>✅ {duration(o.startTime, o.endTime)}</span>
Line 318: ['🌐'] -> <div className="text-5xl mb-4">🌐</div>

---


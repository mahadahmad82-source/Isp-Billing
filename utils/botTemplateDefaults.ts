import { BotTemplate } from '../types';

// Mirrors DEFAULT_TEMPLATES in api/webhook.ts (that file is the real source of truth for what
// text the bot actually sends). This copy exists purely to seed the WABot "Templates" tab UI —
// previously that tab started completely empty (nothing seeded client-side), so it just showed
// "Templates load ho rahe hain" forever and had no way to edit or add anything.
//
// IMPORTANT: editing an EXISTING key here through the UI does change the live bot reply, because
// webhook.ts merges settings.botTemplates (Supabase) over its own DEFAULT_TEMPLATES at request
// time. Adding a brand-new key does NOT automatically wire into any bot reply on its own — a
// developer still needs to call tmpl('your_new_key') somewhere in webhook.ts for it to be used.
export const DEFAULT_BOT_TEMPLATES: Record<string, BotTemplate> = {
  "greeting_welcome_menu": {
    "category": "Greetings & Identity",
    "label": "Greeting Welcome Menu",
    "text": "{greeting}\n\nMain *{bot_name}* hoon, aap ki dedicated support executive.\n\nAap kis cheez mein madad chahte hain? Neeche se option chunein:\n\n1️⃣  Internet Complaint / Masla\n2️⃣  Bill aur Balance Check\n3️⃣  Payment Methods & Details\n4️⃣  Package Expiry Date\n5️⃣  New Connection\n6️⃣  Packages, Pricing & Routers\n7️⃣  Fiber to Home Service Activation\n8️⃣  Mahad Bhai se Baat Karein\n\nBas number likh kar bhej dein ya seedha apna masla bataein! 🙏"
  },
  "greeting_named": {
    "category": "Greetings & Identity",
    "label": "Greeting Named",
    "text": "{salutation}, *{name}*! 😊"
  },
  "greeting_unnamed": {
    "category": "Greetings & Identity",
    "label": "Greeting Unnamed",
    "text": "{salutation}! 😊 {business_name} Support mein khushamdeed!"
  },
  "bot_identity_reply_en": {
    "category": "Greetings & Identity",
    "label": "Bot Identity Reply (English)",
    "text": "I'm {bot_name}, your dedicated support executive here at MahadNet! 😊 I help with billing, complaints, packages, and connections. How can I assist you?"
  },
  "bot_identity_reply_ur": {
    "category": "Greetings & Identity",
    "label": "Bot Identity Reply (Urdu)",
    "text": "Main {bot_name} hoon, MahadNet ki dedicated support executive! 😊 Billing, complaint, packages aur connection mein madad ke liye hamesha hazir hoon. Bataiye, kis cheez mein madad karoon?"
  },
  "employment_question_reply_en": {
    "category": "Greetings & Identity",
    "label": "Employment Question Reply (English)",
    "text": "Ji yes! 😊 I'm {bot_name} — {owner_name} bhai has brought me on to handle MahadNet's customer support, so you can get quick help anytime, day or night. Now tell me, how can I help you today?"
  },
  "employment_question_reply_ur": {
    "category": "Greetings & Identity",
    "label": "Employment Question Reply (Urdu)",
    "text": "Ji bilkul! 😊 Main {bot_name} hoon — {owner_name} bhai ne mujhe khaas customer support ke liye rakha hai, taake aap ko har waqt jaldi aur achi tarah madad mil sake. Ab batayen, kis cheez mein aap ki madad kar sakti hoon? 🙏"
  },
  "greeting_personal_chat_reply_en": {
    "category": "Greetings & Identity",
    "label": "Greeting Personal Chat Reply (English)",
    "text": "Hello! I'm doing well, thank you for asking 😊 Just to let you know, {owner_name} bhai isn't personally available right now — but you can share your message with me and I'll make sure he gets it. How can I help you today?"
  },
  "greeting_personal_chat_reply_ur": {
    "category": "Greetings & Identity",
    "label": "Greeting Personal Chat Reply (Urdu)",
    "text": "Walaikum Assalam! Main theek hoon, shukriya 😊 {owner_name} bhai is waqt personally available nahi hain — aap apna paigham mujhe bata dein, main unhe zaroor pohncha dungi. Aap kis cheez mein madad chahte hain?"
  },
  "personal_reply_named": {
    "category": "Greetings & Identity",
    "label": "Personal Reply Named",
    "text": "Assalam o Alaikum {name}! 😊\n\nYeh number MahadNet ka official customer support hai.\n{owner_name} bhai is waqt available nahi hain — aap ka message unhe pahuncha diya jayega.\n\nInternet ya kisi service ke masle mein madad chahiye to zaroor batain! 🙏"
  },
  "personal_reply_unnamed": {
    "category": "Greetings & Identity",
    "label": "Personal Reply Unnamed",
    "text": "Assalam o Alaikum! 😊\n\nYeh MahadNet Support ka WhatsApp hai.\n{owner_name} bhai abhi available nahi hain.\n\nAgar internet, bill ya kisi service ka masla ho to batain — main haazir hoon!\nYa call karein: *{support_number}* 📞"
  },
  "unknown_customer_reply": {
    "category": "Greetings & Identity",
    "label": "Unknown Customer Reply",
    "text": "Assalam o Alaikum! 😊\n\nAap ka number hamare system mein registered nahi mila.\n\nThori detail bhej dein taake continue kar sakein:\n👉 *Naam*\n👉 *Address / Area*\n👉 *Username ya Customer ID* (agar pehle se customer hain)\n\nNaya connection chahiye? *\"5\"* likh kar bhejein!\nKoi sawaal? Call karein: *{support_number}* 🙏"
  },
  "account_matched_new_number": {
    "category": "Greetings & Identity",
    "label": "Account Matched New Number",
    "text": "Ji {name}! Mil gaya aap ka account 😊 Lagta hai aap ne naya number use kiya hai — Mahad bhai ko record update karne ke liye inform kar diya hai.\n\nAb batayen, kis cheez mein madad chahiye? Bill, complaint ya kuch aur? 🙏"
  },
  "receipt_share_caption": {
    "category": "Billing & Payments",
    "label": "Receipt Share Caption",
    "text": "📄 *{business_name} Receipt*\nRef: {ref}\nAmount Paid: PKR {amount}\nDate: {date}\n\nShukriya! ✅"
  },
  "receipt_not_available": {
    "category": "Billing & Payments",
    "label": "Receipt Not Available",
    "text": "Assalam o Alaikum {name}! 😊\n\nAap ki last receipt mili hai lekin image abhi ready nahi hai — Mahad bhai ko bata diya hai, thodi der mein bhej denge. 🙏"
  },
  "receipt_none_found": {
    "category": "Billing & Payments",
    "label": "Receipt None Found",
    "text": "Assalam o Alaikum {name}! 😊\n\nAap ke naam se koi payment receipt abhi tak record nahi hui. Agar aap ne recently payment ki hai to thoda intezar karein ya Mahad bhai se confirm kar lein. 🙏"
  },
  "talk_to_owner_prompt": {
    "category": "General",
    "label": "Talk to Owner Prompt",
    "text": "Zaroor! 😊 Apna message likh dein — main {owner_name} bhai tak foran pohcha dungi."
  },
  "message_forwarded_to_owner": {
    "category": "General",
    "label": "Message Forwarded to Owner",
    "text": "Aap ka message note ho gaya hai ✅ {owner_name} bhai available hote hi aap ko reply karenge. Shukriya! 🙏"
  },
  "thanks_replies_en": {
    "category": "Thanks & Closing",
    "label": "Thanks Replies (English)",
    "text": "You're welcome! 😊\nNo problem at all!\nAnytime! 🙏\nGlad I could help!\nSure thing — message anytime you need something. 😊"
  },
  "thanks_replies_ur": {
    "category": "Thanks & Closing",
    "label": "Thanks Replies (Urdu)",
    "text": "Koi baat nahi! 😊\nKhush rahein!\nBilkul, koi masla nahi. 🙏\nTheek hai ji!\nWelcome! Kabhi bhi zarurat ho message kar dein. 😊"
  },
  "closing_ack_replies_en": {
    "category": "Thanks & Closing",
    "label": "Closing Ack Replies (English)",
    "text": "Alright! 😊\nSounds good!\nGot it!\nOkay, take care. 🙏\nSure, let us know if anything comes up."
  },
  "closing_ack_replies_ur": {
    "category": "Thanks & Closing",
    "label": "Closing Ack Replies (Urdu)",
    "text": "Theek hai! 😊\nAcha ji!\nBilkul!\nTheek hai, khayal rakhein. 🙏\nChaliye theek hai, aur kuch ho to bata dein."
  },
  "complaint_resolved_ack": {
    "category": "Thanks & Closing",
    "label": "Complaint Resolved Ack",
    "text": "Bohot khushi hui ke masla hal ho gaya! 😊"
  },
  "marketing_optout_confirm_en": {
    "category": "Thanks & Closing",
    "label": "Marketing Optout Confirm (English)",
    "text": "Done — you won't receive promotional messages from us anymore. You can still message us anytime for support. 🙏"
  },
  "marketing_optout_confirm_ur": {
    "category": "Thanks & Closing",
    "label": "Marketing Optout Confirm (Urdu)",
    "text": "Theek hai — ab aap ko promotional messages nahi aayenge. Support ke liye aap kabhi bhi message kar sakte hain. 🙏"
  },
  "bank_accounts": {
    "category": "Billing & Payments",
    "label": "Bank Accounts",
    "text": "💳 *Payment Options:*\n\n🏦 *Askari Bank*\n   Title: MAHAD AHMAD KHAN LODHI\n   Account: 0032060001238\n   IBAN: PK32ASCM000032060001238\n\n🏦 *Meezan Bank*\n   Title: MAHAD AHMAD KHAN LODHI\n   Account: 00300112164874\n   IBAN: PK82MEZN0000300112164874\n\n💚 *NayaPay*\n   IBAN: PK42NAYA1234503282200943\n\n📱 *EasyPaisa / JazzCash:* 03042773453\n\n✅ Payment ke baad screenshot is number pe zaroor bhejein!"
  },
  "bill_reply": {
    "category": "Billing & Payments",
    "label": "Bill Reply",
    "text": "Ji {name}! Main ne abhi check kiya 😊\n\n📋 *Aap ka Account:*\n━━━━━━━━━━━━━━━\n👤 Username: {username}\n📦 Package: *{plan}*\n💰 Monthly: Rs. {monthly_fee}{discount_line}\n{balance_line}\n📅 Expiry: {expiry_date}\n{last_payment_line}\n━━━━━━━━━━━━━━━\nKoi sawaal ho to zaroor poochein! 🙏"
  },
  "bill_discount_line": {
    "category": "Billing & Payments",
    "label": "Bill Discount Line",
    "text": "\n🎁 Special Discount: Rs. {discount}/month (is amount mein already shamil hai)"
  },
  "bill_balance_pending": {
    "category": "Billing & Payments",
    "label": "Bill Balance Pending",
    "text": "🔴 *Pending: Rs. {amount}*\n   ⚠️ Jaldi payment karein taake service active rahe!"
  },
  "bill_balance_advance": {
    "category": "Billing & Payments",
    "label": "Bill Balance Advance",
    "text": "🟢 *Advance: Rs. {amount}*\n   ✨ Aap credit mein hain — koi fikar nahi!"
  },
  "bill_balance_clear": {
    "category": "Billing & Payments",
    "label": "Bill Balance Clear",
    "text": "✅ *Balance Clear* — kuch nahi baqa!"
  },
  "bill_last_payment_line": {
    "category": "Billing & Payments",
    "label": "Bill Last Payment Line",
    "text": "\n🧾 Akhri payment: Rs. {amount} — {period}"
  },
  "payment_history_empty": {
    "category": "Billing & Payments",
    "label": "Payment History Empty",
    "text": "{name}, hamare records mein abhi koi payment nahi dikh rahi.\n\nAgar payment ki hai to {owner_name} bhai se confirm karein: *{support_number}* 🙏"
  },
  "payment_history_item": {
    "category": "Billing & Payments",
    "label": "Payment History Item",
    "text": "{index}. *{period}* — Rs. {amount}\n   📆 {date}"
  },
  "payment_history_reply": {
    "category": "Billing & Payments",
    "label": "Payment History Reply",
    "text": "Ji {name}! Yeh rahi aap ki payment history 📋\n\n{list}\n\n_Total {count} payment(s) record mein hain._\nKoi aur cheez? 😊"
  },
  "payment_history_context_note": {
    "category": "Billing & Payments",
    "label": "Payment History Context Note",
    "text": "Confusion na ho is liye aap ki pichli payments ki detail bhi bhej rahi hoon, taake confirm ho jaye kis month ki payment baqi hai 👇"
  },
  "expiry_no_date": {
    "category": "Billing & Payments",
    "label": "Expiry No Date",
    "text": "{name}, expiry date abhi system mein update nahi hai.\n\nBrahay mehr {support_number} pe call karein — {owner_name} bhai directly help karenge! 🙏"
  },
  "expiry_days_safe": {
    "category": "Billing & Payments",
    "label": "Expiry Days Safe",
    "text": "✅ Abhi *{days} din* baqi hain — no worries!"
  },
  "expiry_days_warning": {
    "category": "Billing & Payments",
    "label": "Expiry Days Warning",
    "text": "⚠️ Sirf *{days} din* baqi — jaldi renew karein!"
  },
  "expiry_days_expired": {
    "category": "Billing & Payments",
    "label": "Expiry Days Expired",
    "text": "🔴 Package *expire ho gaya* — foran renew karein!"
  },
  "expiry_reply": {
    "category": "Billing & Payments",
    "label": "Expiry Reply",
    "text": "Ji {name}! Package ki details yeh rahi:\n\n📦 *{plan}* Package\n📅 Expiry: *{expiry_date}*\n{days_line}\n\nRenewal ke liye payment karein aur screenshot bhejein!\nBank details chahiye? *\"3\"* likh kar bhejein 😊"
  },
  "account_billing_blocked_reply": {
    "category": "Billing & Payments",
    "label": "Account Billing Blocked Reply",
    "text": "Ji {name}! Maine check kiya — internet band hone ki wajah lagta hai *billing* hai, router ka masla nahi 🔍\n{pending_line}{expired_line}\n\nPayment clear hote hi service automatically restore ho jati hai ✅\nBank details chahiye? *\"3\"* likh kar bhejein 😊\n\nAgar payment pehle se clear hai aur phir bhi internet nahi chal raha, please dobara batayen — main foran complaint register kar dungi."
  },
  "billing_blocked_pending_line": {
    "category": "Billing & Payments",
    "label": "Billing Blocked Pending Line",
    "text": "\n🔴 Pending balance: *Rs. {amount}*"
  },
  "billing_blocked_expired_line": {
    "category": "Billing & Payments",
    "label": "Billing Blocked Expired Line",
    "text": "\n📅 Package expire ho gaya: *{expiry_date}*"
  },
  "recharge_reply": {
    "category": "Billing & Payments",
    "label": "Recharge Reply",
    "text": "Ji zaroor! 😊 Package activate/renew karne ke liye yeh steps follow karein:\n\n{bank_accounts}{plan_line}\n\n✅ Payment karne ke baad yeh *teen* cheezein zaroor bhejein:\n1️⃣ Payment ka *screenshot*\n2️⃣ Apna *username*\n3️⃣ Apna *address*\n\nYeh milte hi foran activate/renew kar diya jayega! 🙏"
  },
  "recharge_reply_plan_line": {
    "category": "Billing & Payments",
    "label": "Recharge Reply Plan Line",
    "text": "\n📦 Aap ka package: *{plan}* — Rs. {amount}/month"
  },
  "recharge_discount_note": {
    "category": "Billing & Payments",
    "label": "Recharge Discount Note",
    "text": "\n🎁 Aap ka special discount already is amount mein adjust hai."
  },
  "payment_screenshot_received_named": {
    "category": "Billing & Payments",
    "label": "Payment Screenshot Received Named",
    "text": "Shukriya {name}! 😊 Aap ka payment screenshot mil gaya hai — verify ho rha hai, jald hi activate/renew kar diya jayega. ✅"
  },
  "payment_screenshot_received_unnamed": {
    "category": "Billing & Payments",
    "label": "Payment Screenshot Received Unnamed",
    "text": "Shukriya! 😊 Screenshot mil gaya hai. Verify karne ke liye apna *username* aur *address* bhi bhej dein taake jaldi activate kar sakein. ✅"
  },
  "complaint_screenshot_received_named": {
    "category": "Troubleshooting & Complaints",
    "label": "Complaint Screenshot Received Named",
    "text": "Ji {name}, tasveer mil gayi hai 📩 Lagta hai yeh kisi fault/issue ki hai — maine turant Mahad bhai ki team tak bhej di hai, jald hi dekh kar aap se rabta karenge. 🙏"
  },
  "complaint_screenshot_received_unnamed": {
    "category": "Troubleshooting & Complaints",
    "label": "Complaint Screenshot Received Unnamed",
    "text": "Tasveer mil gayi hai 📩 Lagta hai yeh kisi fault/issue ki hai — team ko bhej di hai, jald hi check kar liya jayega. Apna *username* ya *address* bhi bhej dein taake jald identify ho sakein. 🙏"
  },
  "new_conn_reply": {
    "category": "New Connection & Coverage",
    "label": "New Conn Reply",
    "text": "MahadNet mein khushamdeed! 🎉\n\nNaya connection ke liye bas yeh batain:\n\n1️⃣ *Aap ka naam*\n2️⃣ *Area / Mohalla / Gali*\n3️⃣ *Package preference*\n4️⃣ *Router/ONU aur fiber cable already available hai ya nahi?*\n{package_block}\n\nAgar router/fiber available nahi hai, koi masla nahi — hum se purchase kar sakte hain (fiber Rs. {fiber_price_per_meter}/meter, 2-core, length site visit pe measure hogi) — ya aap khud bhi kahin se la sakte hain.\n\n✅ *Installation hamesha FREE hai* — sirf package ki monthly payment honi hoti hai!\n\nYeh details milte hi team 1-2 ghante mein coverage check kar ke rabta karegi! 📡"
  },
  "new_conn_package_block": {
    "category": "New Connection & Coverage",
    "label": "New Conn Package Block",
    "text": "\n📡 *Available Packages:*\n{package_list}\n\nPata nahi konsa lena hai? Bas bata dein kitne log/devices use karenge ya kis kaam ke liye chahiye (streaming, gaming, work-from-home) — best package suggest kar dungi! Aakhir mein faisla aap ka hi hoga. 😊"
  },
  "coverage_reply": {
    "category": "New Connection & Coverage",
    "label": "Coverage Reply",
    "text": "Zaroor pata karti hoon! 😊 Bas yeh batain:\n\n1️⃣ *Aap ka naam*\n2️⃣ *Pura address / area*\n3️⃣ *Konsa package chahiye*\n\nYeh milte hi coverage check kar ke 1-2 ghante mein confirm kar dengi! 📍"
  },
  "connection_type_question": {
    "category": "New Connection & Coverage",
    "label": "Connection Type Question",
    "text": "Theek hai, pehle yeh batayein — aap ka connection kis tarah ka hai? 🔌\n\n1️⃣ *Fiber Optic*\n2️⃣ *Local Area (UTP/Ethernet wire)*\n\nNumber ya naam likh kar bhej dein!"
  },
  "connection_type_not_understood": {
    "category": "New Connection & Coverage",
    "label": "Connection Type Not Understood",
    "text": "Maazrat, samajh nahi payi 🙏 Sirf *\"Fiber\"* ya *\"Local\"* likh dein."
  },
  "address_noted_coverage": {
    "category": "New Connection & Coverage",
    "label": "Address Noted Coverage",
    "text": "Shukriya! 😊 Aap ka address note ho gaya hai:\n📍 {address}\n\nHamari team aapke area mein coverage/delivery check kar ke 1-2 ghante mein rabta karegi. 🙏"
  },
  "packages_empty": {
    "category": "New Connection & Coverage",
    "label": "Packages Empty",
    "text": "📦 Hamare packages ki updated list {owner_name} bhai se confirm karein: *{support_number}*"
  },
  "packages_item": {
    "category": "New Connection & Coverage",
    "label": "Packages Item",
    "text": "📦 *{name}* — Rs. {price}/month"
  },
  "packages_reply": {
    "category": "New Connection & Coverage",
    "label": "Packages Reply",
    "text": "MahadNet ke *Internet Packages* 🌐\n\n{package_list}\n\nRouter ya Fiber installation ki pricing janni hai? Likhein *\"router\"* ya *\"fiber\"* — detail bhej deti hoon! 📡"
  },
  "router_choice_prompt": {
    "category": "Router & Fiber",
    "label": "Router Choice Prompt",
    "text": "Router ke 2 types available hain MahadNet pe 📡\n\n1️⃣  *2.4G* — Single band, budget-friendly, chhoti space ke liye\n2️⃣  *5G* — Dual band, fast speed, bara coverage\n\nLikhein *\"2.4G\"* ya *\"5G\"* — main detail bhej deti hoon! 😊"
  },
  "router_recommend_24g_en": {
    "category": "Router & Fiber",
    "label": "Router Recommend 24g (English)",
    "text": "For a {mbps_label} package, our *2.4G single-band router* is the perfect fit — budget-friendly and great for smaller spaces. Sending you the specs now! 📡"
  },
  "router_recommend_24g_ur": {
    "category": "Router & Fiber",
    "label": "Router Recommend 24g (Urdu)",
    "text": "{mbps_label} package ke liye hamara *2.4G single band router* perfect rahega — budget-friendly aur chhoti space ke liye behtareen. Specs bhej rahi hoon! 📡"
  },
  "router_recommend_5g_en": {
    "category": "Router & Fiber",
    "label": "Router Recommend 5g (English)",
    "text": "For a {mbps_label} package, I'd recommend our *5G Dual Band Huawei Q2* router — it handles higher speed smoothly with wider coverage. Sending specs now! 📡"
  },
  "router_recommend_5g_ur": {
    "category": "Router & Fiber",
    "label": "Router Recommend 5g (Urdu)",
    "text": "{mbps_label} package ke liye main *5G Dual Band Huawei Q2* router recommend karungi — high speed achi tarah handle karta hai aur coverage bhi behtar deta hai. Specs bhej rahi hoon! 📡"
  },
  "panel_issue_reply": {
    "category": "Router & Fiber",
    "label": "Panel Issue Reply",
    "text": "Samajh gayi! 😊 Aksar yeh issue tab hota hai jab device WiFi se connect na ho ya browser purana page yaad rakh leta hai.\n\n1️⃣ Mobile/laptop ka mobile data band kar dein, sirf router ke WiFi se connect rahein\n2️⃣ Browser band karke dobara kholein aur *192.168.1.1* try karein\n3️⃣ Kabhi kabhi address *192.168.100.1* hota hai — yeh bhi try kar lein\n4️⃣ Router ko 30 second ke liye power se nikal kar dobara laga dein, phir try karein\n\nPhir bhi panel na khule to call karein: *{support_number}* — main guide karti hoon! 📞"
  },
  "router_password_guide": {
    "category": "Router & Fiber",
    "label": "Router Password Guide",
    "text": "Theek hai! *{model}* ka WiFi password change karna bohot asaan hai, yeh steps follow karein 🔧\n\n1️⃣ Apna mobile ya laptop *router ke WiFi* se connect karein (jo bhi naam abhi WiFi list mein dikh raha ho)\n2️⃣ Phone/laptop ka *browser* (Chrome ya koi bhi) khol kar address bar mein yeh likhein: *{ip}*\n   _(yeh kisi website ka link nahi — yeh router ka khud ka control panel hai)_\n3️⃣ Login screen aayegi — {note}\n   _(agar yeh login chal na ho to device ke sticker pe likha username/password try karein)_\n4️⃣ Andar *Wireless* ya *WLAN Settings* (kabhi *WiFi Settings* bhi likha hota hai) wala option dhoondein\n5️⃣ Wahan *Password / WiFi Key* ka box milega — naya password likhein (kam az kam 8 letters, mix of numbers achi rahegi)\n6️⃣ Sab se neeche *Save* ya *Apply* button dabayen\n7️⃣ Router ko ek baar *power se nikal kar 10 second baad dobara laga dein* — naya password apply ho jayega\n\n📱 Phir apne sabhi devices mein WiFi se dobara connect hote waqt *naya password* dalna hoga.\n\nKoi step samajh na aaye ya page open na ho to call karein: *{support_number}* — main guide kar dungi! 📞"
  },
  "pon_compat_gpon_only_en": {
    "category": "Router & Fiber",
    "label": "PON Compat GPON Only (English)",
    "text": "Not directly, unfortunately — our network only runs on *EPON*, not GPON. If your device is EPON or XPON (auto-detect) compatible, it'll work perfectly on our network 😊"
  },
  "pon_compat_gpon_only_ur": {
    "category": "Router & Fiber",
    "label": "PON Compat GPON Only (Urdu)",
    "text": "Nahi, maazrat — hamara network sirf *EPON* support karta hai, GPON nahi. Agar aap ka device EPON ya XPON (auto-detect) hai to woh hamare network par bilkul chal jayega 😊"
  },
  "pon_compat_epon_yes_en": {
    "category": "Router & Fiber",
    "label": "PON Compat EPON Yes (English)",
    "text": "Yes! Your EPON/XPON router will work perfectly on our network 😊 We run purely on EPON, so that's exactly what's supported."
  },
  "pon_compat_epon_yes_ur": {
    "category": "Router & Fiber",
    "label": "PON Compat EPON Yes (Urdu)",
    "text": "Haan ji! Aap ka EPON/XPON router hamare network par bilkul chal jayega 😊 Hamara network sirf EPON pe hai, isliye yeh fully support karta hai."
  },
  "fiber_info": {
    "category": "Router & Fiber",
    "label": "Fiber Info",
    "text": "🌐 *New Fiber Connection*\n\n💵 Fiber cable (2-core): *Rs. {fiber_price_per_meter}/meter*\n📏 Final fiber charges ghar tak ki length pe depend karenge — hamara technician site visit pe exact reading le kar confirm karega.\n\nSirf yeh chahiye aap ke paas:\n• Fiber Optic ONU/Router (EPON device).\n\nAgar yeh nahi hai aap ke paas, koi masla nahi — hum se naya router ya fiber purchase kar sakte hain! Router dekhne ke liye *\"router\"* likh kar bhejein. 📡\n\n📍 Apna area batain, coverage check karke confirm karti hoon!"
  },
  "fiber_info_lead_followup": {
    "category": "Router & Fiber",
    "label": "Fiber Info Lead Followup",
    "text": "\n\nAap ki interest note kar li hai, hamari team 1-2 ghante mein rabta karegi! 🙏"
  },
  "fiber_declined_ack": {
    "category": "Router & Fiber",
    "label": "Fiber Declined Ack",
    "text": "Theek hai! 😊 Aap ki details note kar li hain — team 1-2 ghante mein contact karegi."
  },
  "fiber_upsell_pitch": {
    "category": "Router & Fiber",
    "label": "Fiber Upsell Pitch",
    "text": "Samajh gayi! 😊 Normal WiFi router (jese TP-Link) seedha fiber line se nahi chalta — fiber ke liye ek alag *ONU/GPON device* chahiye hota hai jo fiber signal ko WiFi mein convert karta hai.\n\n🌟 *Fiber to Home* lene ke fawaide:\n• Bohot zyada stable aur fast speed\n• Buffering/disconnect ki tension khatam\n• Gaming, streaming, multiple devices ke liye behtareen\n\nKya aap *Fiber Connection* lena pasand karenge? Reply karein *\"Haan\"* ya *\"Nahi\"* 🙏"
  },
  "password_change_ask_model": {
    "category": "Router & Fiber",
    "label": "Password Change Ask Model",
    "text": "Zaroor madad karti hoon! 😊\n\nAap ka router/ONU konsa model hai? (jaise GS3101, HG8546M, Huawei Q2 — ya jo bhi likha ho device pe)"
  },
  "router_order_confirmed": {
    "category": "Router & Fiber",
    "label": "Router Order Confirmed",
    "text": "Theek hai! *{model}* (Rs. {price}) ka order note kar liya hai 😊\n\nDelivery ke liye apna *pura address* bhej dein, taake hamari team rabta kar sake."
  },
  "router_band_empty": {
    "category": "Router & Fiber",
    "label": "Router Band Empty",
    "text": "Maazrat, abhi is band ke router available nahi hain 🙏 Doosra band dekhne ke liye *\"2.4G\"* ya *\"5G\"* likh kar bhejein, ya call karein: *{support_number}* 📞"
  },
  "router_choice_not_understood": {
    "category": "Router & Fiber",
    "label": "Router Choice Not Understood",
    "text": "Maazrat, samajh nahi payi konsa router pasand aaya 🙏 Model ka naam likh dein (jaise *\"{example_model}\"*) ya *\"1st\"/\"2nd\"* likh kar bata dein."
  },
  "troubleshoot_tips_wifi_auth": {
    "category": "Troubleshooting & Complaints",
    "label": "Troubleshoot Tips WiFi Auth",
    "text": "1️⃣ Mobile/laptop ka WiFi off karke wapis on karein\n2️⃣ Sahi WiFi password dobara check karein (case-sensitive hota hai)\n3️⃣ Router se 5-6 feet door na hon, deewaron ke peeche signal weak ho jata hai"
  },
  "troubleshoot_tips_local": {
    "category": "Troubleshooting & Complaints",
    "label": "Troubleshoot Tips Local",
    "text": "1️⃣ UTP/LAN cable router aur device — dono taraf se sahi tarah lagi honi chahiye, ek baar nikal kar dobara lagayein\n2️⃣ Beech mein switch/hub hai to uski lights check karein — sab ports blink honi chahiye\n3️⃣ Router ko power se nikal kar *30 second* wait karein, phir dobara laga dein\n4️⃣ 1-2 minute device ko boot hone ka time dein\n5️⃣ Phir dobara internet try karein"
  },
  "troubleshoot_tips_generic": {
    "category": "Troubleshooting & Complaints",
    "label": "Troubleshoot Tips Generic",
    "text": "1️⃣ Router/ONU ki light check karein — green/blue blink honi chahiye\n2️⃣ Router ko power se nikal kar *30 second* wait karein, phir dobara laga dein\n3️⃣ 1-2 minute device ko boot hone ka time dein\n4️⃣ Phir dobara internet try karein"
  },
  "troubleshoot_fiber_pitch": {
    "category": "Troubleshooting & Complaints",
    "label": "Troubleshoot Fiber Pitch",
    "text": "\n\n💡 *Suggestion:* Local (UTP) wire connection ka signal weather aur distance se zyada affect hota hai. *Fiber Optic* zyada stable, fast aur kam masla wala hota hai — shift karna chahein to bata dein, free survey kar dete hain! 🌐"
  },
  "troubleshoot_wrapper": {
    "category": "Troubleshooting & Complaints",
    "label": "Troubleshoot Wrapper",
    "text": "Aap ka masla note ho gaya hai 🛠️\n\nPehle yeh quick steps try kar lein, aksar isi se theek ho jata hai:\n\n{tips}\n\nAgar phir bhi masla rahe to bas yahan likh dein — main foran complaint register kar ke technical team ko bhej dungi! 👍{fiber_pitch}"
  },
  "outage_reply": {
    "category": "Troubleshooting & Complaints",
    "label": "Outage Reply",
    "text": "{owner_name} bhai ki team ko *{areas}* mein network outage ka pehle se pata hai aur kaam jaari hai! 🛠️\n{cause_line}\n\nJaise hi network theek hota hai, service automatically restore ho jayegi — alag se complaint karne ki zarurat nahi.\n\nUpdate ke liye thori dair sabar karein, shukriya! 🙏"
  },
  "outage_cause_line": {
    "category": "Troubleshooting & Complaints",
    "label": "Outage Cause Line",
    "text": "\nWajah: {cause}"
  },
  "complaint_tip_router": {
    "category": "Troubleshooting & Complaints",
    "label": "Complaint Tip Router",
    "text": "\n💡 *Quick tip:* Router ek baar off karke 30 sec baad on karein — aksar theek ho jata hai!"
  },
  "complaint_urgent_line": {
    "category": "Troubleshooting & Complaints",
    "label": "Complaint Urgent Line",
    "text": "\n🚨 Urgent case hai — direct call karein: *{support_number}*"
  },
  "complaint_normal_line": {
    "category": "Troubleshooting & Complaints",
    "label": "Complaint Normal Line",
    "text": "\nAam tor pe 2-4 ghante mein hal ho jata hai."
  },
  "complaint_ack_reply": {
    "category": "Troubleshooting & Complaints",
    "label": "Complaint Ack Reply",
    "text": "{name}, complaint note kar li gai hai! 🛠️\n{tip}\n\n🎫 *Ticket:* {ticket_id}\n⚡ *Priority:* {priority}\n📋 *Issue:* {issue}\n\nTechnical team ko foran inform kar diya gaya hai.\n{urgent_or_normal_line}\n\nShukriya aap ki patience ke liye! 🙏"
  },
  "ask_complaint_detail": {
    "category": "Troubleshooting & Complaints",
    "label": "Ask Complaint Detail",
    "text": "Ji {name}! Kya ho raha hai internet mein? Thori detail bata dein. 🛠️"
  },
  "voice_note_not_understood": {
    "category": "Troubleshooting & Complaints",
    "label": "Voice Note Not Understood",
    "text": "Assalam o Alaikum! 😊 Voice note mili lekin abhi samajh nahi paayi.\n\nApna masla text mein likhein ya call karein: *{support_number}* 📞"
  },
  "urdu_script_leak_fallback": {
    "category": "Troubleshooting & Complaints",
    "label": "Urdu Script Leak Fallback",
    "text": "Ji, aap ki baat samajh gayi! Thodi detail se dekh kar foran reply karti hoon.\n\nKoi urgent masla ho to call karein: *{support_number}* 📞"
  },
  "temporary_delay_apology": {
    "category": "General",
    "label": "Temporary Delay Apology",
    "text": "Ji {name}! Is waqt thodi delay aa rahi hai.\nCall karein: *{support_number}* — main foran help karungi! 😊"
  },
  "lead_details_received": {
    "category": "New Connection & Coverage",
    "label": "Lead Details Received",
    "text": "Shukriya! 😊 Details mil gai hain, team verify kar ke aap se rabta karegi. Koi urgent masla ho to call karein: *{support_number}* 📞"
  },
  "lead_details_received_router_hint": {
    "category": "Router & Fiber",
    "label": "Lead Details Received Router Hint",
    "text": "Shukriya! 😊 Aap ki details note kar li hain — team 1-2 ghante mein contact karegi.\n\nRouter dekhna ho to *\"2.4G\"* ya *\"5G\"* likh kar bhejein. 📡"
  }
};

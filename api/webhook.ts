// api/webhook.ts — Ayesha Bot v6 | MahadNet WhatsApp Support
// Dynamic packages from Supabase + Router catalog with images + session state

import { GoogleGenAI } from '@google/genai';
import * as lamejs from '@breezystack/lamejs';

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // service role — bypasses RLS, server-only, never exposed to browser

// 🔒 This Meta WhatsApp number (03042773453) is strictly bound to the mahadnet
// manager account only — customer lookups must never search/match across other
// managers' data. When another manager needs WABot service, they get their own
// WhatsApp Business number (Phase 5 multi-tenant routing), not this one.
const BOUND_MANAGER_ID = 'mahadnet';
const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN || 'mahadnet_ayesha_bot';
const IMG_BASE = 'https://raw.githubusercontent.com/mahadahmad82-source/Isp-Billing/main/public/whatsapp-images';

// ══════════════════════════════════════════════════════
// ⚙️  MAHADNET CONFIG
// ══════════════════════════════════════════════════════
const CONFIG = {
  businessName: 'MahadNet',
  supportNumber: '0304-2773453',
  ownerName: 'Mahad',

  fiberPricePerMeter: 30,

  // How long (ms) to wait for more rapid-fire fragments from the same customer before
  // treating the buffered text as one complete message. Customers often split one thought
  // across several quick messages ("suno" / "mera" / "net" / "nahi chal raha") — this stops
  // the bot replying to each word separately. Raise/lower if replies feel too slow/fast.
  messageDebounceMs: 6000,

  routers: {
    '2.4g': [
      {
        model: 'GS3101',
        company: 'China Mobile',
        band: '2.4GHz Single Band',
        price: 3000,
        image: `${IMG_BASE}/gs3101.jpg`,
        specs: `📡 *GS3101 — China Mobile*
💰 Price: Rs. 3,000

🔧 *Specs:*
• Chipset: EcoNet EN7526F @ 900MHz
• Memory: 256MB RAM + 256MB Flash
• Ports: 1x Gigabit + 3x Fast Ethernet
• Fiber: GPON/EPON auto-detect
• WiFi: 2.4GHz (802.11 b/g/n)
• Extra: 1x VoIP port + 1x USB 2.0

📶 *Range:* 1-2 rooms (30-40 feet), 1 deewar cross karta hai achi tarah
✅ *Best for:* Budget-friendly, single room/small space use, stable connection`,
      },
      {
        model: 'HG8546M',
        company: 'Huawei EchoLife',
        band: '2.4GHz Single Band',
        price: 3500,
        image: `${IMG_BASE}/huawei-hg8546m.jpg`,
        specs: `📡 *Huawei EchoLife HG8546M*
💰 Price: Rs. 3,500

🔧 *Specs:*
• PON: XPON (GPON/EPON adaptive)
• Ports: 1x Gigabit + 3x Fast Ethernet
• WiFi: 2.4GHz only (802.11 b/g/n, 2x2 MIMO)
• Antennas: 2x External (5dBi)
• Extra: 1x Telephone port + 1x USB 2.0

📶 *Range:* Open space mein 60-80 feet, indoor 1 deewar easily, 2+ deewaron ke baad weak
✅ *Best for:* 10 marla ghar ka 1 floor (center mein lagayein)`,
      },
    ],
    '5g': [
      {
        model: 'Q2 Dual Band',
        company: 'Huawei',
        band: '5GHz + 2.4GHz Dual Band',
        price: 6000,
        image: `${IMG_BASE}/huawei-q2.jpg`,
        specs: `📡 *Huawei Q2 — Dual Band 5G*
💰 Price: Rs. 6,000 _(Refurbished)_
📦 Box mein: Router + Original Power Adapter

🔧 *Specs:*
• Dedicated Gigabit WAN — full speed, no drop
• 5GHz Ultra-Speed WiFi — low ping, 4K streaming
• Heavy bandwidth handling, 24/7 use
• 64 devices ek sath connect ho sakte hain

📶 *Range:* Moti deewaron ke through bhi 50-80 feet — 2-3 kamron ya pure medium flat ke liye perfect
✅ *Best for:* Gaming, multiple devices, bara ghar/flat`,
      },
    ],
  } as Record<string, Array<{ model: string; company: string; band: string; price: number; image: string; specs: string }>>,
};

const DEFAULT_TEMPLATES: Record<string, string> = {
  greeting_welcome_menu: `{greeting}

Main *{bot_name}* hoon, aap ki dedicated support executive.

Aap kis cheez mein madad chahte hain? Neeche se option chunein:

1️⃣  Internet Complaint / Masla
2️⃣  Bill aur Balance Check
3️⃣  Payment Methods & Details
4️⃣  Package Expiry Date
5️⃣  New Connection
6️⃣  Packages, Pricing & Routers
7️⃣  Fiber to Home Service Activation
8️⃣  Mahad Bhai se Baat Karein

Bas number likh kar bhej dein ya seedha apna masla bataein! 🙏`,
  greeting_named: `{salutation}, *{name}*! 😊`,
  greeting_unnamed: `{salutation}! 😊 {business_name} Support mein khushamdeed!`,
  bot_identity_reply_en: `I'm {bot_name}, your dedicated support executive here at MahadNet! 😊 I help with billing, complaints, packages, and connections. How can I assist you?`,
  bot_identity_reply_ur: `Main {bot_name} hoon, MahadNet ki dedicated support executive! 😊 Billing, complaint, packages aur connection mein madad ke liye hamesha hazir hoon. Bataiye, kis cheez mein madad karoon?`,
  employment_question_reply_en: `Ji yes! 😊 I'm {bot_name} — {owner_name} bhai has brought me on to handle MahadNet's customer support, so you can get quick help anytime, day or night. Now tell me, how can I help you today?`,
  employment_question_reply_ur: `Ji bilkul! 😊 Main {bot_name} hoon — {owner_name} bhai ne mujhe khaas customer support ke liye rakha hai, taake aap ko har waqt jaldi aur achi tarah madad mil sake. Ab batayen, kis cheez mein aap ki madad kar sakti hoon? 🙏`,
  greeting_personal_chat_reply_en: `Hello! I'm doing well, thank you for asking 😊 Just to let you know, {owner_name} bhai isn't personally available right now — but you can share your message with me and I'll make sure he gets it. How can I help you today?`,
  greeting_personal_chat_reply_ur: `Walaikum Assalam! Main theek hoon, shukriya 😊 {owner_name} bhai is waqt personally available nahi hain — aap apna paigham mujhe bata dein, main unhe zaroor pohncha dungi. Aap kis cheez mein madad chahte hain?`,
  personal_reply_named: `Assalam o Alaikum {name}! 😊

Yeh number MahadNet ka official customer support hai.
{owner_name} bhai is waqt available nahi hain — aap ka message unhe pahuncha diya jayega.

Internet ya kisi service ke masle mein madad chahiye to zaroor batain! 🙏`,
  personal_reply_unnamed: `Assalam o Alaikum! 😊

Yeh MahadNet Support ka WhatsApp hai.
{owner_name} bhai abhi available nahi hain.

Agar internet, bill ya kisi service ka masla ho to batain — main haazir hoon!
Ya call karein: *{support_number}* 📞`,
  unknown_customer_reply: `Assalam o Alaikum! 😊

Aap ka number hamare system mein registered nahi mila.

Thori detail bhej dein taake continue kar sakein:
👉 *Naam*
👉 *Address / Area*
👉 *Username ya Customer ID* (agar pehle se customer hain)

Naya connection chahiye? *"5"* likh kar bhejein!
Koi sawaal? Call karein: *{support_number}* 🙏`,
  account_matched_new_number: `Ji {name}! Mil gaya aap ka account 😊 Lagta hai aap ne naya number use kiya hai — Mahad bhai ko record update karne ke liye inform kar diya hai.

Ab batayen, kis cheez mein madad chahiye? Bill, complaint ya kuch aur? 🙏`,
  receipt_share_caption: `📄 *{business_name} Receipt*
Ref: {ref}
Amount Paid: PKR {amount}
Date: {date}

Shukriya! ✅`,
  receipt_not_available: `Assalam o Alaikum {name}! 😊

Aap ki last receipt mili hai lekin image abhi ready nahi hai — Mahad bhai ko bata diya hai, thodi der mein bhej denge. 🙏`,
  receipt_none_found: `Assalam o Alaikum {name}! 😊

Aap ke naam se koi payment receipt abhi tak record nahi hui. Agar aap ne recently payment ki hai to thoda intezar karein ya Mahad bhai se confirm kar lein. 🙏`,
  talk_to_owner_prompt: `Zaroor! 😊 Apna message likh dein — main {owner_name} bhai tak foran pohcha dungi.`,
  message_forwarded_to_owner: `Aap ka message note ho gaya hai ✅ {owner_name} bhai available hote hi aap ko reply karenge. Shukriya! 🙏`,
  thanks_replies_en: `You're welcome! 😊
No problem at all!
Anytime! 🙏
Glad I could help!
Sure thing — message anytime you need something. 😊`,
  thanks_replies_ur: `Koi baat nahi! 😊
Khush rahein!
Bilkul, koi masla nahi. 🙏
Theek hai ji!
Welcome! Kabhi bhi zarurat ho message kar dein. 😊`,
  closing_ack_replies_en: `Alright! 😊
Sounds good!
Got it!
Okay, take care. 🙏
Sure, let us know if anything comes up.`,
  closing_ack_replies_ur: `Theek hai! 😊
Acha ji!
Bilkul!
Theek hai, khayal rakhein. 🙏
Chaliye theek hai, aur kuch ho to bata dein.`,
  complaint_resolved_ack: `Bohot khushi hui ke masla hal ho gaya! 😊`,
  marketing_optout_confirm_en: `Done — you won't receive promotional messages from us anymore. You can still message us anytime for support. 🙏`,
  marketing_optout_confirm_ur: `Theek hai — ab aap ko promotional messages nahi aayenge. Support ke liye aap kabhi bhi message kar sakte hain. 🙏`,
  bank_accounts: `💳 *Payment Options:*

🏦 *Askari Bank*
   Title: MAHAD AHMAD KHAN LODHI
   Account: 0032060001238
   IBAN: PK32ASCM000032060001238

🏦 *Meezan Bank*
   Title: MAHAD AHMAD KHAN LODHI
   Account: 00300112164874
   IBAN: PK82MEZN0000300112164874

💚 *NayaPay*
   IBAN: PK42NAYA1234503282200943

📱 *EasyPaisa / JazzCash:* 03042773453

✅ Payment ke baad screenshot is number pe zaroor bhejein!`,
  bill_reply: `Ji {name}! Main ne abhi check kiya 😊

📋 *Aap ka Account:*
━━━━━━━━━━━━━━━
👤 Username: {username}
📦 Package: *{plan}*
💰 Monthly: Rs. {monthly_fee}{discount_line}
{balance_line}
📅 Expiry: {expiry_date}
{last_payment_line}
━━━━━━━━━━━━━━━
Koi sawaal ho to zaroor poochein! 🙏`,
  bill_discount_line: `
🎁 Special Discount: Rs. {discount}/month (is amount mein already shamil hai)`,
  bill_balance_pending: `🔴 *Pending: Rs. {amount}*
   ⚠️ Jaldi payment karein taake service active rahe!`,
  bill_balance_advance: `🟢 *Advance: Rs. {amount}*
   ✨ Aap credit mein hain — koi fikar nahi!`,
  bill_balance_clear: `✅ *Balance Clear* — kuch nahi baqa!`,
  bill_last_payment_line: `
🧾 Akhri payment: Rs. {amount} — {period}`,
  payment_history_empty: `{name}, hamare records mein abhi koi payment nahi dikh rahi.

Agar payment ki hai to {owner_name} bhai se confirm karein: *{support_number}* 🙏`,
  payment_history_item: `{index}. *{period}* — Rs. {amount}
   📆 {date}`,
  payment_history_reply: `Ji {name}! Yeh rahi aap ki payment history 📋

{list}

_Total {count} payment(s) record mein hain._
Koi aur cheez? 😊`,
  payment_history_context_note: `Confusion na ho is liye aap ki pichli payments ki detail bhi bhej rahi hoon, taake confirm ho jaye kis month ki payment baqi hai 👇`,
  expiry_no_date: `{name}, expiry date abhi system mein update nahi hai.

Brahay mehr {support_number} pe call karein — {owner_name} bhai directly help karenge! 🙏`,
  expiry_days_safe: `✅ Abhi *{days} din* baqi hain — no worries!`,
  expiry_days_warning: `⚠️ Sirf *{days} din* baqi — jaldi renew karein!`,
  expiry_days_expired: `🔴 Package *expire ho gaya* — foran renew karein!`,
  expiry_reply: `Ji {name}! Package ki details yeh rahi:

📦 *{plan}* Package
📅 Expiry: *{expiry_date}*
{days_line}

Renewal ke liye payment karein aur screenshot bhejein!
Bank details chahiye? *"3"* likh kar bhejein 😊`,
  account_billing_blocked_reply: `Ji {name}! Maine check kiya — internet band hone ki wajah lagta hai *billing* hai, router ka masla nahi 🔍
{pending_line}{expired_line}

Payment clear hote hi service automatically restore ho jati hai ✅
Bank details chahiye? *"3"* likh kar bhejein 😊

Agar payment pehle se clear hai aur phir bhi internet nahi chal raha, please dobara batayen — main foran complaint register kar dungi.`,
  billing_blocked_pending_line: `
🔴 Pending balance: *Rs. {amount}*`,
  billing_blocked_expired_line: `
📅 Package expire ho gaya: *{expiry_date}*`,
  recharge_reply: `Ji zaroor! 😊 Package activate/renew karne ke liye yeh steps follow karein:

{bank_accounts}{plan_line}

✅ Payment karne ke baad yeh *teen* cheezein zaroor bhejein:
1️⃣ Payment ka *screenshot*
2️⃣ Apna *username*
3️⃣ Apna *address*

Yeh milte hi foran activate/renew kar diya jayega! 🙏`,
  recharge_reply_plan_line: `
📦 Aap ka package: *{plan}* — Rs. {amount}/month`,
  recharge_discount_note: `
🎁 Aap ka special discount already is amount mein adjust hai.`,
  payment_screenshot_received_named: `Shukriya {name}! 😊 Aap ka payment screenshot mil gaya hai — verify ho rha hai, jald hi activate/renew kar diya jayega. ✅`,
  payment_screenshot_received_unnamed: `Shukriya! 😊 Screenshot mil gaya hai. Verify karne ke liye apna *username* aur *address* bhi bhej dein taake jaldi activate kar sakein. ✅`,
  complaint_screenshot_received_named: `Ji {name}, tasveer mil gayi hai 📩 Lagta hai yeh kisi fault/issue ki hai — maine turant Mahad bhai ki team tak bhej di hai, jald hi dekh kar aap se rabta karenge. 🙏`,
  complaint_screenshot_received_unnamed: `Tasveer mil gayi hai 📩 Lagta hai yeh kisi fault/issue ki hai — team ko bhej di hai, jald hi check kar liya jayega. Apna *username* ya *address* bhi bhej dein taake jald identify ho sakein. 🙏`,
  new_conn_reply: `MahadNet mein khushamdeed! 🎉

Naya connection ke liye bas yeh batain:

1️⃣ *Aap ka naam*
2️⃣ *Area / Mohalla / Gali*
3️⃣ *Package preference*
4️⃣ *Router/ONU aur fiber cable already available hai ya nahi?*
{package_block}

Agar router/fiber available nahi hai, koi masla nahi — hum se purchase kar sakte hain (fiber Rs. {fiber_price_per_meter}/meter, 2-core, length site visit pe measure hogi) — ya aap khud bhi kahin se la sakte hain.

✅ *Installation hamesha FREE hai* — sirf package ki monthly payment honi hoti hai!

Yeh details milte hi team 1-2 ghante mein coverage check kar ke rabta karegi! 📡`,
  new_conn_package_block: `
📡 *Available Packages:*
{package_list}

Pata nahi konsa lena hai? Bas bata dein kitne log/devices use karenge ya kis kaam ke liye chahiye (streaming, gaming, work-from-home) — best package suggest kar dungi! Aakhir mein faisla aap ka hi hoga. 😊`,
  coverage_reply: `Zaroor pata karti hoon! 😊 Bas yeh batain:

1️⃣ *Aap ka naam*
2️⃣ *Pura address / area*
3️⃣ *Konsa package chahiye*

Yeh milte hi coverage check kar ke 1-2 ghante mein confirm kar dengi! 📍`,
  connection_type_question: `Theek hai, pehle yeh batayein — aap ka connection kis tarah ka hai? 🔌

1️⃣ *Fiber Optic*
2️⃣ *Local Area (UTP/Ethernet wire)*

Number ya naam likh kar bhej dein!`,
  connection_type_not_understood: `Maazrat, samajh nahi payi 🙏 Sirf *"Fiber"* ya *"Local"* likh dein.`,
  coverage_area_matched: `Achi khabar! 😊 Aap ka area *{area}* hamari coverage list mein pehle se maujood hai ✅

Team thodi hi der mein connection details ke liye rabta karegi. Packages dekhne ke liye *"packages"* likh kar bhejein! 📦`,
  address_noted_coverage: `Shukriya! 😊 Aap ka address note ho gaya hai:
📍 {address}

Hamari team aapke area mein coverage/delivery check kar ke 1-2 ghante mein rabta karegi. 🙏`,
  packages_empty: `📦 Hamare packages ki updated list {owner_name} bhai se confirm karein: *{support_number}*`,
  packages_item: `📦 *{name}* — Rs. {price}/month`,
  packages_reply: `MahadNet ke *Internet Packages* 🌐

{package_list}

Router ya Fiber installation ki pricing janni hai? Likhein *"router"* ya *"fiber"* — detail bhej deti hoon! 📡`,
  router_choice_prompt: `Router ke 2 types available hain MahadNet pe 📡

1️⃣  *2.4G* — Single band, budget-friendly, chhoti space ke liye
2️⃣  *5G* — Dual band, fast speed, bara coverage

Likhein *"2.4G"* ya *"5G"* — main detail bhej deti hoon! 😊`,
  router_recommend_24g_en: `For a {mbps_label} package, our *2.4G single-band router* is the perfect fit — budget-friendly and great for smaller spaces. Sending you the specs now! 📡`,
  router_recommend_24g_ur: `{mbps_label} package ke liye hamara *2.4G single band router* perfect rahega — budget-friendly aur chhoti space ke liye behtareen. Specs bhej rahi hoon! 📡`,
  router_recommend_5g_en: `For a {mbps_label} package, I'd recommend our *5G Dual Band Huawei Q2* router — it handles higher speed smoothly with wider coverage. Sending specs now! 📡`,
  router_recommend_5g_ur: `{mbps_label} package ke liye main *5G Dual Band Huawei Q2* router recommend karungi — high speed achi tarah handle karta hai aur coverage bhi behtar deta hai. Specs bhej rahi hoon! 📡`,
  panel_issue_reply: `Samajh gayi! 😊 Aksar yeh issue tab hota hai jab device WiFi se connect na ho ya browser purana page yaad rakh leta hai.

1️⃣ Mobile/laptop ka mobile data band kar dein, sirf router ke WiFi se connect rahein
2️⃣ Browser band karke dobara kholein aur *192.168.1.1* try karein
3️⃣ Kabhi kabhi address *192.168.100.1* hota hai — yeh bhi try kar lein
4️⃣ Router ko 30 second ke liye power se nikal kar dobara laga dein, phir try karein

Phir bhi panel na khule to call karein: *{support_number}* — main guide karti hoon! 📞`,
  router_password_guide: `Theek hai! *{model}* ka WiFi password change karna bohot asaan hai, yeh steps follow karein 🔧

1️⃣ Apna mobile ya laptop *router ke WiFi* se connect karein (jo bhi naam abhi WiFi list mein dikh raha ho)
2️⃣ Phone/laptop ka *browser* (Chrome ya koi bhi) khol kar address bar mein yeh likhein: *{ip}*
   _(yeh kisi website ka link nahi — yeh router ka khud ka control panel hai)_
3️⃣ Login screen aayegi — {note}
   _(agar yeh login chal na ho to device ke sticker pe likha username/password try karein)_
4️⃣ Andar *Wireless* ya *WLAN Settings* (kabhi *WiFi Settings* bhi likha hota hai) wala option dhoondein
5️⃣ Wahan *Password / WiFi Key* ka box milega — naya password likhein (kam az kam 8 letters, mix of numbers achi rahegi)
6️⃣ Sab se neeche *Save* ya *Apply* button dabayen
7️⃣ Router ko ek baar *power se nikal kar 10 second baad dobara laga dein* — naya password apply ho jayega

📱 Phir apne sabhi devices mein WiFi se dobara connect hote waqt *naya password* dalna hoga.

Koi step samajh na aaye ya page open na ho to call karein: *{support_number}* — main guide kar dungi! 📞`,
  pon_compat_gpon_only_en: `Not directly, unfortunately — our network only runs on *EPON*, not GPON. If your device is EPON or XPON (auto-detect) compatible, it'll work perfectly on our network 😊`,
  pon_compat_gpon_only_ur: `Nahi, maazrat — hamara network sirf *EPON* support karta hai, GPON nahi. Agar aap ka device EPON ya XPON (auto-detect) hai to woh hamare network par bilkul chal jayega 😊`,
  pon_compat_epon_yes_en: `Yes! Your EPON/XPON router will work perfectly on our network 😊 We run purely on EPON, so that's exactly what's supported.`,
  pon_compat_epon_yes_ur: `Haan ji! Aap ka EPON/XPON router hamare network par bilkul chal jayega 😊 Hamara network sirf EPON pe hai, isliye yeh fully support karta hai.`,
  fiber_info: `🌐 *New Fiber Connection*

💵 Fiber cable (2-core): *Rs. {fiber_price_per_meter}/meter*
📏 Final fiber charges ghar tak ki length pe depend karenge — hamara technician site visit pe exact reading le kar confirm karega.

Sirf yeh chahiye aap ke paas:
• Fiber Optic ONU/Router (EPON device).

Agar yeh nahi hai aap ke paas, koi masla nahi — hum se naya router ya fiber purchase kar sakte hain! Router dekhne ke liye *"router"* likh kar bhejein. 📡

📍 Apna area batain, coverage check karke confirm karti hoon!`,
  fiber_info_lead_followup: `

Aap ki interest note kar li hai, hamari team 1-2 ghante mein rabta karegi! 🙏`,
  fiber_declined_ack: `Theek hai! 😊 Aap ki details note kar li hain — team 1-2 ghante mein contact karegi.`,
  fiber_upsell_pitch: `Samajh gayi! 😊 Normal WiFi router (jese TP-Link) seedha fiber line se nahi chalta — fiber ke liye ek alag *ONU/GPON device* chahiye hota hai jo fiber signal ko WiFi mein convert karta hai.

🌟 *Fiber to Home* lene ke fawaide:
• Bohot zyada stable aur fast speed
• Buffering/disconnect ki tension khatam
• Gaming, streaming, multiple devices ke liye behtareen

Kya aap *Fiber Connection* lena pasand karenge? Reply karein *"Haan"* ya *"Nahi"* 🙏`,
  password_change_ask_model: `Zaroor madad karti hoon! 😊

Aap ka router/ONU konsa model hai? (jaise GS3101, HG8546M, Huawei Q2 — ya jo bhi likha ho device pe)`,
  router_order_confirmed: `Theek hai! *{model}* (Rs. {price}) ka order note kar liya hai 😊

Delivery ke liye apna *pura address* bhej dein, taake hamari team rabta kar sake.`,
  router_band_empty: `Maazrat, abhi is band ke router available nahi hain 🙏 Doosra band dekhne ke liye *"2.4G"* ya *"5G"* likh kar bhejein, ya call karein: *{support_number}* 📞`,
  router_choice_not_understood: `Maazrat, samajh nahi payi konsa router pasand aaya 🙏 Model ka naam likh dein (jaise *"{example_model}"*) ya *"1st"/"2nd"* likh kar bata dein.`,
  troubleshoot_tips_wifi_auth: `1️⃣ Mobile/laptop ka WiFi off karke wapis on karein
2️⃣ Sahi WiFi password dobara check karein (case-sensitive hota hai)
3️⃣ Router se 5-6 feet door na hon, deewaron ke peeche signal weak ho jata hai`,
  troubleshoot_tips_local: `1️⃣ UTP/LAN cable router aur device — dono taraf se sahi tarah lagi honi chahiye, ek baar nikal kar dobara lagayein
2️⃣ Beech mein switch/hub hai to uski lights check karein — sab ports blink honi chahiye
3️⃣ Router ko power se nikal kar *30 second* wait karein, phir dobara laga dein
4️⃣ 1-2 minute device ko boot hone ka time dein
5️⃣ Phir dobara internet try karein`,
  troubleshoot_tips_generic: `1️⃣ Router/ONU ki light check karein — green/blue blink honi chahiye
2️⃣ Router ko power se nikal kar *30 second* wait karein, phir dobara laga dein
3️⃣ 1-2 minute device ko boot hone ka time dein
4️⃣ Phir dobara internet try karein`,
  troubleshoot_fiber_pitch: `

💡 *Suggestion:* Local (UTP) wire connection ka signal weather aur distance se zyada affect hota hai. *Fiber Optic* zyada stable, fast aur kam masla wala hota hai — shift karna chahein to bata dein, free survey kar dete hain! 🌐`,
  troubleshoot_wrapper: `Aap ka masla note ho gaya hai 🛠️

Pehle yeh quick steps try kar lein, aksar isi se theek ho jata hai:

{tips}

Agar phir bhi masla rahe to bas yahan likh dein — main foran complaint register kar ke technical team ko bhej dungi! 👍{fiber_pitch}`,
  outage_reply: `{owner_name} bhai ki team ko *{areas}* mein network outage ka pehle se pata hai aur kaam jaari hai! 🛠️
{cause_line}

Jaise hi network theek hota hai, service automatically restore ho jayegi — alag se complaint karne ki zarurat nahi.

Update ke liye thori dair sabar karein, shukriya! 🙏`,
  outage_cause_line: `
Wajah: {cause}`,
  complaint_tip_router: `
💡 *Quick tip:* Router ek baar off karke 30 sec baad on karein — aksar theek ho jata hai!`,
  complaint_urgent_line: `
🚨 Urgent case hai — direct call karein: *{support_number}*`,
  complaint_normal_line: `
Aam tor pe 2-4 ghante mein hal ho jata hai.`,
  complaint_ack_reply: `{name}, complaint note kar li gai hai! 🛠️
{tip}

🎫 *Ticket:* {ticket_id}
⚡ *Priority:* {priority}
📋 *Issue:* {issue}

Technical team ko foran inform kar diya gaya hai.
{urgent_or_normal_line}

Shukriya aap ki patience ke liye! 🙏`,
  ask_complaint_detail: `Ji {name}! Kya ho raha hai internet mein? Thori detail bata dein. 🛠️`,
  voice_note_not_understood: `Assalam o Alaikum! 😊 Voice note mili lekin abhi samajh nahi paayi.

Apna masla text mein likhein ya call karein: *{support_number}* 📞`,
  urdu_script_leak_fallback: `Ji, aap ki baat samajh gayi! Thodi detail se dekh kar foran reply karti hoon.

Koi urgent masla ho to call karein: *{support_number}* 📞`,
  temporary_delay_apology: `Ji {name}! Is waqt thodi delay aa rahi hai.
Call karein: *{support_number}* — main foran help karungi! 😊`,
  lead_details_received: `Shukriya! 😊 Details mil gai hain, team verify kar ke aap se rabta karegi. Koi urgent masla ho to call karein: *{support_number}* 📞`,
  lead_details_received_router_hint: `Shukriya! 😊 Aap ki details note kar li hain — team 1-2 ghante mein contact karegi.

Router dekhna ho to *"2.4G"* ya *"5G"* likh kar bhejein. 📡`,
};
// Per-invocation effective templates (DEFAULT_TEMPLATES merged with mahadnet's
// customizations from the WABot "Templates" tab) — set once near the top of handler()
// via getTemplates(). Module-level like voiceReplyTargets above; reset every invocation.
let TEMPLATES: Record<string, string> = DEFAULT_TEMPLATES;

// Resolve a template by key, substituting {placeholder} tokens from vars. This is the
// single point every canned reply goes through, so editing a template in the WABot UI
// changes live bot wording with no code deploy. Falls back to DEFAULT_TEMPLATES if the
// Supabase fetch failed or the key was never customized.
function tmpl(key: string, vars: Record<string, string | number> = {}): string {
  const raw = TEMPLATES[key] ?? DEFAULT_TEMPLATES[key] ?? '';
  return raw.replace(/\{(\w+)\}/g, (_m: string, k: string) => (k in vars ? String(vars[k]) : ''));
}

// For randomized reply pools stored as one variant per line (e.g. thanks/closing replies)
// so adding/removing a variant in the UI is just adding/removing a line.
function pickFromList(key: string): string {
  const raw = TEMPLATES[key] ?? DEFAULT_TEMPLATES[key] ?? '';
  const lines = raw.split('\n').map((s: string) => s.trim()).filter(Boolean);
  return lines.length ? lines[Math.floor(Math.random() * lines.length)] : '';
}

function renderPackageList(planPrices: Record<string, number>): string {
  const entries = Object.entries(planPrices || {}).sort((a, b) => extractMbps(a[0]) - extractMbps(b[0]));
  return entries.map(([name, price]) => tmpl('packages_item', { name, price: price.toLocaleString() })).join('\n');
}


// ══════════════════════════════════════════════════════
// 🔧 SUPABASE HELPERS
// ══════════════════════════════════════════════════════
const normPhone = (p: string) => (p || '').replace(/\D/g, '').slice(-10);

async function findCustomer(from: string) {
  const norm = normPhone(from);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?select=manager_id,data&manager_id=eq.${BOUND_MANAGER_ID}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) { console.error('[Supabase] fetch failed:', res.status); return null; }
    const rows: any[] = await res.json();

    for (const row of rows) {
      if (row.manager_id === '_bot_sessions') continue;
      const users: any[] = row.data?.users || [];
      const user = users.find((u: any) =>
        u && u.status !== 'deleted' &&
        (normPhone(u.phone) === norm || normPhone(u.phone2) === norm)
      );
      if (user) {
        const receipts: any[] = (row.data?.receipts || [])
          .filter((r: any) => r.userId === user.id && r.status === 'Success')
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 5);
        const planPrices: Record<string, number> = row.data?.settings?.planPrices || {};
        console.log(`✅ Customer found: ${user.name} | bal=${user.balance}`);
        return { managerId: row.manager_id, rowData: row.data, user, receipts, planPrices };
      }
    }
    console.log(`⚠️ No customer for: ${norm}`);
  } catch (e: any) { console.error('[findCustomer]', e?.message); }
  return null;
}

// When someone messages from a number we don't recognize, try to match them against an
// EXISTING customer by username/name (e.g. they switched SIMs/phones) before treating
// them as a brand-new lead. Best-effort fuzzy match — Mahad still verifies manually.
async function findCustomerByUsernameOrName(query: string) {
  const q = query.trim().toLowerCase();
  if (!q || q.length < 3) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?select=manager_id,data&manager_id=eq.${BOUND_MANAGER_ID}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows: any[] = await res.json();
    for (const row of rows) {
      if (row.manager_id === '_bot_sessions') continue;
      const users: any[] = row.data?.users || [];
      const user = users.find((u: any) => {
        if (!u || u.status === 'deleted') return false;
        const uname = (u.username || '').toLowerCase();
        const name = (u.name || '').toLowerCase();
        return (uname && (uname === q || q.includes(uname))) || (name && name.length > 3 && q.includes(name));
      });
      if (user) {
        const receipts: any[] = (row.data?.receipts || [])
          .filter((r: any) => r.userId === user.id && r.status === 'Success')
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .slice(0, 5);
        return { managerId: row.manager_id, rowData: row.data, user, receipts, planPrices: row.data?.settings?.planPrices || {} };
      }
    }
  } catch (e: any) { console.error('[findCustomerByUsernameOrName]', e?.message); }
  return null;
}

// After findCustomerByUsernameOrName matches someone messaging from a new/unrecognized
// number, their real phone number in the DB still doesn't match `from` — so a plain
// findCustomer(from) keeps failing on every later message. Previously this bounced the
// customer straight back into the "number nahi mila" unknown-customer flow even though they
// had just verified, which looped forever if they then asked about bill/complaint. This looks
// the already-matched customer up directly by manager+id so verified customers can keep going
// (bill, complaint, etc.) without re-verifying every single message.
async function findCustomerByManagerAndId(managerId: string, userId: string) {
  try {
    const row = await getManagerRow(managerId);
    if (!row) return null;
    const users: any[] = row.users || [];
    const user = users.find((u: any) => u && u.id === userId && u.status !== 'deleted');
    if (!user) return null;
    const receipts: any[] = (row.receipts || [])
      .filter((r: any) => r.userId === user.id && r.status === 'Success')
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
    return { managerId, rowData: row, user, receipts, planPrices: row.settings?.planPrices || {} };
  } catch (e: any) { console.error('[findCustomerByManagerAndId]', e?.message); return null; }
}


// Get planPrices from ANY manager (used when sender isn't a known customer yet)
async function getAnyPlanPrices(): Promise<Record<string, number>> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?select=manager_id,data&manager_id=eq.mahadnet`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows = await res.json();
    if (rows?.[0]?.data?.settings?.planPrices) return rows[0].data.settings.planPrices;
  } catch (e: any) { console.error('[getAnyPlanPrices]', e?.message); }
  return {};
}

// Get router catalog from Supabase settings (admin-editable via the WABot "Catalog" tab),
// falling back to the built-in CONFIG.routers defaults if mahadnet hasn't customized it yet.
// This lets models/specs/prices be updated from the UI without touching code.
async function getRouterCatalog(): Promise<Record<string, Array<{ model: string; company: string; band: string; price: number; image: string; specs: string }>>> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?select=data&manager_id=eq.mahadnet`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows = await res.json();
    const catalog = rows?.[0]?.data?.settings?.routerCatalog;
    if (catalog && ((catalog['2.4g']?.length || 0) + (catalog['5g']?.length || 0) > 0)) return catalog;
  } catch (e: any) { console.error('[getRouterCatalog]', e?.message); }
  return CONFIG.routers;
}

// Get the bot's reply templates from Supabase settings (admin-editable via the WABot
// "Templates" tab), merged over DEFAULT_TEMPLATES so any key mahadnet hasn't customized
// yet — or any NEW key added in a future code update — still has a working default.
async function getTemplates(): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?select=data&manager_id=eq.mahadnet`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows = await res.json();
    const stored = rows?.[0]?.data?.settings?.botTemplates || {};
    const merged: Record<string, string> = { ...DEFAULT_TEMPLATES };
    for (const key of Object.keys(stored)) {
      const text = stored[key]?.text;
      if (typeof text === 'string' && text.trim()) merged[key] = text;
    }
    return merged;
  } catch (e: any) {
    console.error('[getTemplates]', e?.message);
    return DEFAULT_TEMPLATES;
  }
}

async function saveComplaint(managerId: string, rowData: any, user: any, issue: string) {
  const t = issue.toLowerCase();
  const priority = /urgent|emergency|2\s*din|3\s*din|kal\s*se|bilkul\s*nahi|completely/.test(t)
    ? 'high' : /slow|thoda|kabhi/.test(t) ? 'low' : 'medium';
  const ticketId = `WA-${Date.now()}`;
  const complaintTickets = [...(rowData.complaintTickets || []), {
    id: ticketId, customerId: user.id, customerName: user.name,
    customerPhone: user.phone, title: `WA: ${issue.slice(0, 60)}`,
    description: issue, status: 'open', priority,
    createdAt: new Date().toISOString(), createdBy: 'ayesha_bot',
  }];
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${managerId}`, {
      method: 'PATCH',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ data: { ...rowData, complaintTickets } }),
    });
    console.log(`✅ Complaint saved: ${ticketId} (${priority})`);
    await notifyManager(managerId, { ...rowData, complaintTickets }, {
      title: '🛠️ Nayi Complaint (WhatsApp)',
      message: `${user.name}: ${issue.slice(0, 100)}`,
      priority: priority === 'high' ? 'HIGH' : priority === 'low' ? 'LOW' : 'MEDIUM',
    });
  } catch (e: any) { console.error('[saveComplaint]', e?.message); }
  return ticketId;
}

async function getManagerRow(managerId: string): Promise<any | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?select=data&manager_id=eq.${managerId}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows = await res.json();
    return rows?.[0]?.data || null;
  } catch (e: any) { console.error('[getManagerRow]', e?.message); return null; }
}

async function notifyManager(managerId: string, rowData: any, notif: { title: string; message: string; priority?: 'HIGH' | 'MEDIUM' | 'LOW' }) {
  const newNotif = {
    id: `wa-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    type: 'SYSTEM',
    priority: notif.priority || 'MEDIUM',
    title: notif.title,
    message: notif.message,
    timestamp: new Date().toISOString(),
  };
  try {
    // Atomic DB-level append — fixes the bug where a stale rowData snapshot would
    // overwrite the entire pendingManagerNotifications array and resurrect already-
    // dismissed notifications (classic read-modify-write race against the app's own
    // dismiss/clear actions).
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/append_manager_notification`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ p_manager_id: managerId, p_notif: newNotif }),
    });
  } catch (e: any) { console.error('[notifyManager]', e?.message); }
  pushNotify(managerId, notif.title, notif.message.slice(0, 150), 'myisp-alert').catch(() => {});
  return newNotif;
}

// ── Area coverage auto-detection ─────────────────────────────────────────────
// Areas are defined by the manager (Area Dashboard → settings.areas, e.g. "H26", "H30",
// "G1", "HA01", "HA1", "HB01", "HC01", "F1", "FA", "FB") as short building/block codes.
// When a customer asks about coverage and then sends their address, we try to spot one of
// these exact codes in what they typed so Ayesha can confirm coverage instantly instead of
// always saying "team will check in 1-2 hours" — while still logging the lead either way.
function extractAreaTokens(text: string): string[] {
  const raw = (text.toUpperCase().match(/[A-Z]+\d*|\d+/g) || []);
  const tokens = new Set<string>(raw);
  // Handles codes typed with a space or dash, e.g. "H 26" / "H-26" → also try "H26"
  for (let i = 0; i < raw.length - 1; i++) {
    const merged = raw[i] + raw[i + 1];
    if (/^[A-Z]+\d+$/.test(merged)) tokens.add(merged);
  }
  return Array.from(tokens);
}

function detectAreaFromAddress(address: string, definedAreas: string[]): string | null {
  if (!definedAreas?.length || !address) return null;
  const tokens = extractAreaTokens(address);
  for (const area of definedAreas) {
    const norm = area.toUpperCase().replace(/[\s-]/g, '');
    if (norm && tokens.includes(norm)) return area;
  }
  return null;
}

async function saveLead(managerId: string, rowData: any, lead: { name: string; phone: string; address: string; area?: string; interestedPlan?: string; note?: string; source: string }) {
  const now = new Date().toISOString();
  const newLead = {
    id: `lead-${Date.now()}`,
    name: lead.name, phone: lead.phone, address: lead.address, area: lead.area,
    interestedPlan: lead.interestedPlan, status: 'new', note: lead.note,
    source: lead.source, createdAt: now, updatedAt: now,
  };
  const leads = [...(rowData.leads || []), newLead];
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${managerId}`, {
      method: 'PATCH',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ data: { ...rowData, leads } }),
    });
  } catch (e: any) { console.error('[saveLead]', e?.message); }
  return newLead.id;
}

// Saves any stray WhatsApp text as a new-connection lead against the main 'mahadnet' manager.
async function saveStrayLead(from: string, text: string, note?: string) {
  try {
    const row = await getManagerRow('mahadnet');
    if (!row) return;
    await saveLead('mahadnet', row, {
      name: 'WhatsApp Lead', phone: from, address: text.slice(0, 200),
      note: note ? `${note} | ${text}` : text, source: 'WhatsApp Bot',
    });
    await notifyManager('mahadnet', row, {
      title: '🆕 Naya Connection Lead (WhatsApp)',
      message: `Number: ${from}\nDetails: ${text.slice(0, 150)}`,
      priority: 'MEDIUM',
    });
  } catch (e: any) { console.error('[saveStrayLead]', e?.message); }
}

// Returns the currently active (unresolved) outage log for a manager, if any.
function getActiveOutage(rowData: any): any | null {
  const logs: any[] = rowData?.outageLogs || [];
  const now = Date.now();
  return logs.find((o: any) => !o.endTime || new Date(o.endTime).getTime() > now) || null;
}

// ── Message logging (Phase 1 — whatsapp_messages table, Admin Inbox foundation) ─
// Single-tenant for now: manager_id hardcoded to 'mahadnet'. Revisit when Phase 5
// multi-tenant routing (whatsapp_configs.phone_number_id → manager_id) is built.
async function logMessage(
  customerPhone: string,
  direction: 'in' | 'out',
  type: 'text' | 'image' | 'audio' | 'voice' | 'document',
  content: string,
  opts: { flagged?: boolean; managerId?: string; waMessageId?: string; mediaUrl?: string | null; translatedContent?: string | null } = {}
) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        manager_id: opts.managerId || 'mahadnet',
        customer_phone: normPhone(customerPhone),
        direction, type, content,
        media_url: opts.mediaUrl || null,
        translated_content: opts.translatedContent || null,
        flagged_payment_proof: !!opts.flagged,
        wa_message_id: opts.waMessageId || null,
      }),
    });
  } catch (e: any) { console.error('[logMessage]', e?.message); }

  // Fire-and-forget push notification to the Wabot BillCollector Android app
  // for inbound customer messages only. Deliberately not awaited and wrapped
  // so a push failure (or the push_tokens table being empty/missing) can
  // never affect message logging or the bot's reply flow above/below this.
  if (direction === 'in') {
    notifyPushTokens(opts.managerId || 'mahadnet', customerPhone, type, content).catch((e: any) =>
      console.error('[notifyPushTokens]', e?.message)
    );
  }
}

// True if this phone has NOT sent an inbound message yet today (local server day).
// Checked BEFORE the current message is logged, so "first contact" means this is
// message #1 of the day, not #2. Used to proactively greet + show the full option
// menu once per day per number — including totally random/unrecognized numbers —
// instead of only replying with the menu when the customer explicitly says salam.
async function isFirstContactToday(phone: string): Promise<boolean> {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/whatsapp_messages?customer_phone=eq.${normPhone(phone)}&direction=eq.in&created_at=gte.${todayStart.toISOString()}&select=id&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const rows: any = await res.json();
    return !Array.isArray(rows) || rows.length === 0;
  } catch (e: any) {
    console.error('[isFirstContactToday]', e?.message);
    return false; // fail-safe: never spam extra greetings if this check itself breaks
  }
}

// Looks up Expo push tokens registered by the mobile app (push_tokens table)
// for this manager and sends a notification via Expo's push API. See
// mahadahmad82-source/Wabot-Android for the app that registers these tokens.
async function notifyPushTokens(
  managerId: string,
  customerPhone: string,
  type: string,
  content: string
) {
  const tokRes = await fetch(
    `${SUPABASE_URL}/rest/v1/push_tokens?manager_id=eq.${managerId}&select=token`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  );
  if (!tokRes.ok) return;
  const rows: { token: string }[] = await tokRes.json();
  if (!rows.length) return;

  const preview =
    type === 'text' ? (content || '').slice(0, 120)
    : type === 'image' ? '📷 Photo'
    : type === 'audio' || type === 'voice' ? '🎤 Voice message'
    : type === 'document' ? '📄 Document'
    : 'New message';

  const messages = rows.map((r) => ({
    to: r.token,
    sound: 'default',
    title: `+92${normPhone(customerPhone)}`,
    body: preview,
    data: { phone: normPhone(customerPhone) },
  }));

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
}

// Downloads WhatsApp media (e.g. payment screenshot) via Meta Graph API and
// re-uploads it to the public `whatsapp-media` Supabase Storage bucket. Also
// returns the raw buffer + mimeType (used by classifyWhatsAppImage below) so
// the image doesn't need to be downloaded from Meta a second time just to
// figure out what it actually shows.
async function downloadAndStoreMedia(mediaId: string): Promise<{ url: string; buffer: Buffer; mimeType: string } | null> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) return null;
  try {
    const metaRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!metaRes.ok) { console.error('[media meta]', metaRes.status); return null; }
    const meta: any = await metaRes.json();
    const mediaRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${token}` } });
    if (!mediaRes.ok) { console.error('[media download]', mediaRes.status); return null; }
    const buf = Buffer.from(await mediaRes.arrayBuffer());
    const mimeType = meta.mime_type || 'image/jpeg';
    const ext = mimeType.split('/')[1]?.split(';')[0] || 'jpg';
    const path = `payment-proofs/${Date.now()}-${mediaId}.${ext}`;
    const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/whatsapp-media/${path}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': mimeType },
      body: buf,
    });
    if (!upRes.ok) { console.error('[media upload]', upRes.status, await upRes.text()); return null; }
    return { url: `${SUPABASE_URL}/storage/v1/object/public/whatsapp-media/${path}`, buffer: buf, mimeType };
  } catch (e: any) { console.error('[downloadAndStoreMedia]', e?.message); return null; }
}

// Classifies an inbound WhatsApp image as a payment-proof screenshot vs a
// complaint/fault/technical photo (router/modem, cabling, error screens, etc.)
// vs something unrelated. STRICT by design: "payment" is only returned when the
// image is clearly a real bank/wallet transaction slip/receipt — any uncertain,
// blurry, or unrelated image, and any classifier failure (missing key, API error,
// bad JSON), falls back to 'other' (no reply sent) instead of 'payment'. This is
// intentional — previously it fell back to 'payment' on any failure, which caused
// random/unrelated images to get the "payment verify ho rahi hai" reply.
async function classifyWhatsAppImage(buffer: Buffer, mimeType: string, caption: string): Promise<'payment' | 'complaint' | 'other'> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return 'other';
  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Yeh image ek Pakistani ISP (internet provider) ke WhatsApp customer-support number par ek customer ne bheji hai. Ghor se dekh kar STRICT criteria se category tay karo:

- "payment": SIRF tab jab image mein saaf tor par ek bank/EasyPaisa/JazzCash/SadaPay/NayaPay transaction slip ya receipt dikhe — jisme amount (Rs./PKR), transaction/reference ID, date/time, aur "successful"/"paid"/"transfer complete" jaisa status ya bank/wallet app ka logo/naam saaf nazar aaye. Sirf paison ka zikar hona ya rasid "jaisi" lagna kaafi nahi — clear, unmistakable financial transaction proof hona chahiye.
- "complaint": router/modem/ONU/wifi device ki photo, cabling/fiber ka masla, error message/screen, signal lights, ya koi fault/technical issue dikhati tasveer.
- "other": upar dono mein se koi bhi nahi — selfies, ID cards, chat/screenshot of app, memes, khana, kapre, random objects, ya koi bhi image jo clear transaction slip na ho, sab "other" mein aayenge.

STRICT RULE: Agar image blurry/unclear hai, ya "payment" hone mein zara bhi shaq hai, to "payment" HARGIZ mat likho — "other" likho. Galat "payment" batana customer ko galat confirmation de deta hai jo bohot bara masla hai. Shaq wali surat mein hamesha "other" chuno, "payment" nahi.

${caption ? `Customer ka caption: "${caption}"` : 'Customer ne koi caption nahi likha.'}

SIRF is JSON format mein jawab do, kuch aur nahi, koi markdown fence nahi: {"category": "payment" | "complaint" | "other"}`;
    const response: any = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: buffer.toString('base64') } }, { text: prompt }] }],
      config: { temperature: 0, maxOutputTokens: 30, responseMimeType: 'application/json' },
    });
    const raw: string = response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
    let category = '';
    try { category = JSON.parse(raw)?.category; } catch { category = /complaint/i.test(raw) ? 'complaint' : /payment/i.test(raw) ? 'payment' : 'other'; }
    if (category === 'payment' || category === 'complaint' || category === 'other') return category;
    return 'other';
  } catch (e: any) {
    console.error('[classifyWhatsAppImage]', e?.message);
    return 'other';
  }
}

// Phones that should receive THIS turn's reply as a voice note instead of text.
// Cleared defensively at the top of every invocation, and per-message via try/finally
// in the main handler — see voiceReplyTargets.delete(from) below.
const voiceReplyTargets = new Set<string>();

// Downloads a WhatsApp voice note, stores the original audio in Supabase Storage
// (so mahadnet can actually listen to it in the Admin Inbox — previously only the
// transcript was kept), and transcribes it via Groq's hosted Whisper. Whisper
// auto-detects language, so Urdu/Hindi speech sometimes comes back in Devanagari
// or Urdu/Nastaliq script — that's handled by transliterateToRoman() in the caller,
// not here, so the raw transcript stays intact for display/translation purposes.
async function transcribeAudio(mediaId: string): Promise<{ transcript: string | null; mediaUrl: string | null }> {
  const waToken = process.env.WHATSAPP_TOKEN;
  const groqKey = process.env.GROQ_API_KEY;
  if (!waToken || !groqKey || !mediaId) return { transcript: null, mediaUrl: null };
  try {
    const metaRes = await fetch(`https://graph.facebook.com/v20.0/${mediaId}`, { headers: { Authorization: `Bearer ${waToken}` } });
    if (!metaRes.ok) { console.error('[transcribeAudio meta]', metaRes.status); return { transcript: null, mediaUrl: null }; }
    const meta: any = await metaRes.json();
    const audioRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${waToken}` } });
    if (!audioRes.ok) { console.error('[transcribeAudio download]', audioRes.status); return { transcript: null, mediaUrl: null }; }
    const buf = Buffer.from(await audioRes.arrayBuffer());
    const mimeType = meta.mime_type || 'audio/ogg';

    let mediaUrl: string | null = null;
    try {
      const ext = mimeType.split('/')[1]?.split(';')[0] || 'ogg';
      const path = `voice-notes/${Date.now()}-${mediaId}.${ext}`;
      const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/whatsapp-media/${path}`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': mimeType },
        body: buf,
      });
      if (upRes.ok) mediaUrl = `${SUPABASE_URL}/storage/v1/object/public/whatsapp-media/${path}`;
      else console.error('[transcribeAudio upload]', upRes.status, await upRes.text());
    } catch (e: any) { console.error('[transcribeAudio store]', e?.message); }

    const form = new FormData();
    form.append('file', new Blob([buf], { type: mimeType }), 'voice.ogg');
    form.append('model', 'whisper-large-v3-turbo');
    form.append('response_format', 'json');

    const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}` },
      body: form as any,
    });
    if (!groqRes.ok) { console.error('[transcribeAudio groq]', groqRes.status, await groqRes.text()); return { transcript: null, mediaUrl }; }
    const data: any = await groqRes.json();
    return { transcript: (data.text || '').trim() || null, mediaUrl };
  } catch (e: any) { console.error('[transcribeAudio]', e?.message); return { transcript: null, mediaUrl: null }; }
}

// Devanagari Unicode block — Whisper sometimes transcribes Urdu/Hindi speech using
// Hindi script instead of Roman letters. When that happens none of the Roman-Urdu
// regex intents below can match it, so the message silently fell through to the
// Groq fallback (no grounded facts → hallucinated account numbers, package lists,
// wrong greetings, etc.). containsUrduScript() (further below) catches the Nastaliq
// case the same way.
function containsDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text);
}

// Phonetic script-conversion ONLY (never translation) — turns a Devanagari/Nastaliq
// voice transcript into Roman Urdu so it can flow through the exact same
// deterministic intent detection, sessions, and fact-grounded replies that text
// messages already use. The original-script transcript is kept separately (passed
// into logMessage by the caller) for display + the Admin Inbox "Translate" toggle.
async function transliterateToRoman(text: string): Promise<string> {
  const key = process.env.GROQ_API_KEY;
  if (!key || !text) return text;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // The smaller 8b-instant model was inconsistent at this — sometimes echoing the
        // original script back unchanged, sometimes appending the Roman version after it
        // instead of replacing it. The bigger model follows the "ONLY" instruction reliably.
        model: 'llama-3.3-70b-versatile',
        messages: [{
          role: 'system',
          content: `Tum sirf ek script-transliteration tool ho — TRANSLATION nahi karte, sirf script (likhne ka tareeqa) badalte ho. Diya gaya text (Devanagari/Hindi script ya Urdu/Nastaliq script) ko phonetically Roman/Latin letters mein likho — alfaz, maani aur tarteeb EXACTLY wese hi rakho jese bole gaye hain. Agar text already Roman/English mein hai to bilkul wese hi wapis bhej do.

SIRF transliterated Roman text return karo. NA original script wapis likho, NA dono versions ek sath do, NA koi quote marks/explanation. Sirf ek line ka plain Roman Urdu text — bas.

Example:
Input: बड़ी महरबानी
Output: Badi meherbani

Input: السلام علیکم، انٹرنیٹ کام نہیں کر رہا
Output: Assalam o alaikum, internet kaam nahi kar raha`,
        }, { role: 'user', content: text }],
        temperature: 0.1,
        max_tokens: 300,
      }),
    });
    if (!res.ok) { console.error('[transliterateToRoman] groq', res.status, await res.text()); return text; }
    const data: any = await res.json();
    let out: string = data?.choices?.[0]?.message?.content?.trim() || text;
    // Safety net: if the model still echoed the original script anywhere in its
    // reply, keep only the line(s) that are purely Latin script.
    if (containsDevanagari(out) || containsUrduScript(out)) {
      const latinOnly = out.split('\n').filter(line => line.trim() && !containsDevanagari(line) && !containsUrduScript(line)).join(' ').trim();
      if (latinOnly) out = latinOnly;
    }
    return out || text;
  } catch (e: any) { console.error('[transliterateToRoman]', e?.message); return text; }
}

// Converts text to a female-voice MP3 via Gemini 2.5 Flash TTS (Google GenAI),
// stores it in the public whatsapp-media bucket, and returns its public URL.
// Gemini's TTS is LLM-based — it understands Roman Urdu directly (no script
// conversion step needed, unlike Azure's locale-bound voices) and follows a
// plain-language style instruction prefixed to the text. Returns null on any
// failure so the caller can gracefully fall back to a text reply.
async function textToSpeech(text: string): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || !text) return null;
  // Override via GEMINI_TTS_VOICE if a different prebuilt voice is picked later.
  const voiceName = process.env.GEMINI_TTS_VOICE || 'Kore';
  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `Garmjoshi aur tassali se, ek friendly Pakistani customer support agent ke andaaz mein Roman Urdu mein bolo: ${text}`;
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      },
    } as any);
    const inline: any = (response as any).candidates?.[0]?.content?.parts?.[0]?.inlineData;
    const b64 = inline?.data;
    if (!b64) { console.error('[textToSpeech] no audio data in Gemini response'); return null; }
    const pcm = Buffer.from(b64, 'base64'); // raw 16-bit PCM, mono, 24kHz

    // Encode PCM -> MP3 in pure JS (no ffmpeg binary available/needed here) —
    // WhatsApp Cloud API does not accept raw WAV/PCM for audio messages.
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.length / 2);
    const encoder = new (lamejs as any).Mp3Encoder(1, 24000, 128);
    const blockSize = 1152;
    const mp3Chunks: Uint8Array[] = [];
    for (let i = 0; i < samples.length; i += blockSize) {
      const chunk = samples.subarray(i, i + blockSize);
      const buf = encoder.encodeBuffer(chunk);
      if (buf.length > 0) mp3Chunks.push(buf);
    }
    const tail = encoder.flush();
    if (tail.length > 0) mp3Chunks.push(tail);
    const mp3Buf = Buffer.concat(mp3Chunks.map((c) => Buffer.from(c)));

    const path = `tts-replies/${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
    const upRes = await fetch(`${SUPABASE_URL}/storage/v1/object/whatsapp-media/${path}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'audio/mpeg' },
      body: mp3Buf,
    });
    if (!upRes.ok) { console.error('[textToSpeech upload]', upRes.status, await upRes.text()); return null; }
    return `${SUPABASE_URL}/storage/v1/object/public/whatsapp-media/${path}`;
  } catch (e: any) { console.error('[textToSpeech]', e?.message); return null; }
}

// True live push notification (Web Push, works even with the app closed) — reuses
// the existing send-push-notification Edge Function + push_subscriptions infra
// already built for the main MYISP app.
async function pushNotify(managerId: string, title: string, body: string, tag?: string) {
  try {
    await fetch('https://mzmajmjzopmkzboizrbm.supabase.co/functions/v1/send-push-notification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manager_id: managerId, title, body, tag: tag || 'wabot' }),
    });
  } catch (e: any) { console.error('[pushNotify]', e?.message); }
}

// Training loop: every Groq-handled (non-deterministic) reply gets logged here as an
// "unreviewed" candidate. mahadnet reviews these in the Admin Inbox training tab and
// approves the good ones, which then feed back into future replies via getApprovedKnowledge.
async function logKnowledgeCandidate(question: string, answer: string, managerId: string = 'mahadnet') {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/ayesha_knowledge`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ manager_id: managerId, question: question.slice(0, 500), answer: answer.slice(0, 1000), tags: ['unreviewed'] }),
    });
  } catch (e: any) { console.error('[logKnowledgeCandidate]', e?.message); }
}

// Pulls mahadnet-approved Q&A pairs so Groq can align its answers with house-approved
// wording instead of re-improvising every time for recurring questions.
async function getApprovedKnowledge(managerId: string = 'mahadnet', limit = 12): Promise<string> {
  try {
    const url = `${SUPABASE_URL}/rest/v1/ayesha_knowledge?manager_id=eq.${managerId}&tags=cs.{approved}&order=updated_at.desc&limit=${limit}&select=question,answer`;
    const r = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
    if (!r.ok) return '';
    const rows: any[] = await r.json();
    if (!rows.length) return '';
    return rows.map(k => `Q: ${k.question}\nA: ${k.answer}`).join('\n\n');
  } catch (e: any) { console.error('[getApprovedKnowledge]', e?.message); return ''; }
}

// Phase 4 — conversation memory: pulls the last few logged messages for this
// customer so Ayesha doesn't lose track mid-conversation across separate webhook
// invocations (each WhatsApp message is its own serverless call with no in-memory state).
async function getRecentHistory(phone: string, managerId: string, limit = 6): Promise<string> {
  try {
    const url = `${SUPABASE_URL}/rest/v1/whatsapp_messages?manager_id=eq.${managerId}&customer_phone=eq.${normPhone(phone)}&order=created_at.desc&limit=${limit}&select=direction,content`;
    const r = await fetch(url, { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } });
    if (!r.ok) return '';
    const rows: any[] = await r.json();
    if (!rows.length) return '';
    return rows.reverse().map(m => `${m.direction === 'in' ? 'Customer' : 'Ayesha'}: ${(m.content || '').slice(0, 200)}`).join('\n');
  } catch (e: any) { console.error('[getRecentHistory]', e?.message); return ''; }
}

// ── Lightweight session state (for slot-filling flows) ──────────────────────────
async function getSession(phone: string): Promise<{ state: string; data?: any } | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq._bot_sessions&select=data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows = await res.json();
    const sessions = rows?.[0]?.data?.sessions || {};
    const s = sessions[phone];
    return s ? { state: s.state, data: s.data } : null;
  } catch (e: any) { console.error('[getSession]', e?.message); return null; }
}

async function setSession(phone: string, state: string | null, data?: any) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq._bot_sessions&select=data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows = await res.json();
    const existing = rows?.[0]?.data || { sessions: {} };
    const sessions = existing.sessions || {};
    if (state) sessions[phone] = { state, ts: Date.now(), data };
    else delete sessions[phone];

    if (rows?.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq._bot_sessions`, {
        method: 'PATCH',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ data: { ...existing, sessions } }),
      });
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/manager_data`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ manager_id: '_bot_sessions', data: { sessions } }),
      });
    }
  } catch (e: any) { console.error('[setSession]', e?.message); }
}

async function hasGreetedBefore(phone: string): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq._bot_sessions&select=data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows = await res.json();
    const greeted: string[] = rows?.[0]?.data?.greetedPhones || [];
    return greeted.includes(phone);
  } catch (e: any) { console.error('[hasGreetedBefore]', e?.message); return false; }
}

async function markGreetedBefore(phone: string) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq._bot_sessions&select=data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows = await res.json();
    const existing = rows?.[0]?.data || { sessions: {} };
    const greeted: string[] = existing.greetedPhones || [];
    if (!greeted.includes(phone)) greeted.push(phone);
    if (rows?.length) {
      await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq._bot_sessions`, {
        method: 'PATCH',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ data: { ...existing, greetedPhones: greeted } }),
      });
    } else {
      await fetch(`${SUPABASE_URL}/rest/v1/manager_data`, {
        method: 'POST',
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ manager_id: '_bot_sessions', data: { sessions: {}, greetedPhones: greeted } }),
      });
    }
  } catch (e: any) { console.error('[markGreetedBefore]', e?.message); }
}

// ── Message batching/debounce ────────────────────────────────────────────────────
// Customers often split one thought across several rapid messages (e.g. "suno" / "mera" /
// "net" / "nahi chal raha" sent as 4 separate texts within a couple seconds). Replying to
// each fragment on its own broke the conversation. Fix: buffer every incoming fragment in
// `whatsapp_message_buffer`, wait CONFIG.messageDebounceMs, then check whether a NEWER
// fragment arrived for this phone in the meantime. If yes, this invocation stands down (the
// invocation handling that newer fragment will do the combining). If no — this was the last
// fragment — gather everything buffered for this phone, combine into one message, clear the
// buffer, and proceed with that combined text.
async function debounceAndCombineFragments(phone: string, fragment: string, fragmentId: string): Promise<string | null> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_message_buffer`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ phone, message: fragment, wa_message_id: fragmentId }),
    });
  } catch (e: any) {
    console.error('[msgBuffer insert]', e?.message);
    return fragment; // fail-open: buffering broke, just process this one fragment alone
  }

  await new Promise(resolve => setTimeout(resolve, CONFIG.messageDebounceMs));

  try {
    const latestRes = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_message_buffer?phone=eq.${encodeURIComponent(phone)}&select=wa_message_id&order=created_at.desc&limit=1`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const latestRows: any[] = await latestRes.json();
    const latestId = latestRows?.[0]?.wa_message_id;

    if (latestId && latestId !== fragmentId) {
      // A newer fragment arrived while we were waiting — that invocation owns the reply.
      return null;
    }

    const allRes = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_message_buffer?phone=eq.${encodeURIComponent(phone)}&select=message&order=created_at.asc`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const allRows: any[] = await allRes.json();
    const combined = (allRows || []).map((r: any) => r.message).join(' ').replace(/\s+/g, ' ').trim();

    await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_message_buffer?phone=eq.${encodeURIComponent(phone)}`, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });

    return combined || fragment;
  } catch (e: any) {
    console.error('[msgBuffer combine]', e?.message);
    return fragment; // fail-open
  }
}

// ══════════════════════════════════════════════════════
// 🧠 INTENT DETECTION
// ══════════════════════════════════════════════════════
type Intent =
  | 'greeting' | 'menu_complaint' | 'menu_bill' | 'menu_payment'
  | 'menu_expiry' | 'menu_new_conn' | 'menu_packages' | 'menu_talk_owner'
  | 'complaint' | 'bill' | 'payment_how' | 'payment_history'
  | 'expiry' | 'new_conn' | 'packages' | 'router_info' | 'fiber_info'
  | 'router_24g' | 'router_5g' | 'personal' | 'recharge_request'
  | 'password_change' | 'coverage' | 'thanks' | 'bot_identity'
  | 'panel_issue' | 'router_recommend' | 'employment_question' | 'bill_dispute'
  | 'closing_ack' | 'greeting_personal_chat' | 'router_pon_compat' | 'marketing_optout'
  | 'receipt_request';

function detectIntent(text: string): Intent {
  const t = text.trim().toLowerCase();

  // Gratitude / closing remarks — checked FIRST so "thanks"/"shukriya"/"mehrbani" never
  // falls through to the Groq off-topic fallback and gets stuck repeating "note ho gaya hai".
  if (/^(thanks?|thank\s*you|thank\s*u|thnx|ty|tysm|shukriya|shukran|shukar(i+ya?)?a?|mehrbani|meherbani|bohot\s*shukriya|ji\s*shukriya|ok\s*thanks|okay\s*thanks|great\s*thanks)\b/.test(t) && t.length < 40)
    return 'thanks';

  if (/^(stop|unsubscribe|band\s*karo|messages?\s*band|opt\s*out|no\s*more\s*messages?)\.?$/.test(t))
    return 'marketing_optout';

  // Plain closing acknowledgment ("ok", "theek hai", "acha") with NOTHING else — the
  // conversation is over, customer is just confirming they read the last reply. This
  // must NOT re-open the main menu/"how can I help" prompt (that was the bug — every
  // "ok" was looping back into "aap kis cheez mein madad chahte hain?").
  if (/^(ok+|okay|okk+|k|kk+|acha|achaa|theek\s*hai|thik\s*hai|sahi\s*hai|done|alright|got\s*it|noted|fine)\.?$/.test(t))
    return 'closing_ack';

  // "What's your name / who are you" — answered with a fixed, correctly-gendered reply
  // instead of leaving it to the LLM (which sometimes slipped into Hindi/male grammar).
  if (/(aap|ap|tum|tu)\s*(ka|ki)?\s*na+m\s*(kya|kiya)\s*hai|tumhara\s*na+m|aap\s*kaun\s*hai|tum\s*kaun\s*ho|who\s*are\s*you|what'?s?\s*(is\s*)?your\s*name|(ap|aap|tum)\s*kya\s*kar(ti|te)?\s*ho?n?|(ap|aap|tum)\s*kya\s*kar(ti)?\s*hai/.test(t))
    return 'bot_identity';

  // User is surprised/questioning that they're talking to a bot/hired person, e.g.
  // "mahad ne aapko rakh liya hai?", "tumhe job pe rakha hai kya", "ye bot hai kya".
  // Answered with a warm, transparent self-intro instead of dodging or going to Groq.
  if (/mahad\s*(bhai)?\s*(ne|ney|nay|nye)\s*(ap|aap|tum|tumhe|tumhein|tumko|isay|ise)?\s*(ko\s*)?(rakh|hire|naukri|job|kaam)\w*|(ap|aap|tum)\s*(bot|ai|robot)\s*(ho|hai|hain)\s*kya|kya\s*(ap|aap|tum)\s*(ek\s*)?(bot|ai|robot)\s*ho/.test(t))
    return 'employment_question';

  // Greeting combined with casual personal chit-chat (e.g. "Assalam o Alaikum, kaise ho
  // Mahad bhai, khairiyat hai?") — common in voice notes. This is NOT an off-topic
  // question to redirect; reply warmly, then clarify Mahad bhai isn't personally
  // available and the message can be left with the bot instead.
  if (/(as+ala+m|aoa|salam|\bhi\b|hey|hello)/.test(t) && /kaise?\s*ho|kaisa?y?\s*ho|kaisi\s*ho|kh?aire?yat|tabiyat|kya\s*haal\s*chaal|how\s*('?r|are)\s*you|hope\s*you\s*('re|are)?\s*(doing\s*)?well|sab\s*(theek|thik)\b/.test(t))
    return 'greeting_personal_chat';

  // Router band selection (checked first — works regardless of session)
  if (/2\.?4\s*g(hz)?|single\s*band/.test(t)) return 'router_24g';
  if (/\b5\s*g(hz)?\b|dual\s*band/.test(t)) return 'router_5g';

  // Numbered main menu
  if (/^1$/.test(t)) return 'menu_complaint';
  if (/^2$/.test(t)) return 'menu_bill';
  if (/^3$/.test(t)) return 'menu_payment';
  if (/^4$/.test(t)) return 'menu_expiry';
  if (/^5$/.test(t)) return 'menu_new_conn';
  if (/^6$/.test(t)) return 'menu_packages';
  if (/^7$/.test(t)) return 'fiber_info';
  if (/^8$/.test(t)) return 'menu_talk_owner';

  // Greeting
  if (/^(as+ala+m+[\w\s]*|aoa|a\.?o\.?a\.?|salam+|hi+|hey+|hello+|good\s*(morning|evening|night|afternoon)|kya\s*hal|assalamu)/.test(t) && t.length < 60)
    return 'greeting';

  // Router/device control-panel or login trouble (e.g. "192.168.1.1 open nahi horaha") —
  // checked BEFORE the generic router_info catch-all so it isn't misread as a buying inquiry.
  if (/(192\.168|control\s*panel|admin\s*panel|device\s*(ka\s*)?panel|router\s*panel|login\s*page)/.test(t) && /nahi|na\s*ho|problem|nahi\s*khul|nahi\s*hot/.test(t))
    return 'panel_issue';

  if (/password\s*(bhool|change|reset|nahi\s*yaad|pata\s*nahi|update)|wifi\s*ka\s*password|router\s*(ka\s*)?password|password\s*(kese|kaise)/.test(t)) return 'password_change';
  if (/coverage|area\s*cover|cover\s*hota|service\s*available|yaha\s*available|hamare\s*area|apke\s*area|hamara\s*area/.test(t)) return 'coverage';
  // Activation / recharge / renewal — checked before generic packages/pricing.
  // "activ\w*" now also catches plain "active" (e.g. "package active karwana hai"),
  // not just "activate"/"activation".
  if (/activ\w*|recharge|chalu\s*kar|continue\s*kar(wa)?|dobara\s*chalu|package\s*(karwa|laga)|plan\s*(karwa|laga)/.test(t)) return 'recharge_request';
  if (/payment\s*(method|option|detail|info)|bank\s*(detail|account|number)|account\s*(number|detail|num|no)\b|kis\s*account|paisay?\s*(kaise|kahan|kese)|paise\s*(kaise|kahan|kese)|pay\s*(kese|kaise|kahan)|kese\s*pay|kaise\s*pay|kahan\s*pay|payment\s*kaise|easypaisa|jazzcash|nayapay|transfer|deposit\s*kahan|kahan\s*jama/.test(t)) return 'payment_how';
  // Fiber info — checked before generic "router_info"/"packages" since both regexes would otherwise catch "fiber"
  if (/^fiber$/.test(t) || /fiber\s*(connection|install|lagwa|chahiye|info|detail|charges?|home|to\s*home)/.test(t)) return 'fiber_info';

  // Router recommendation by package speed — e.g. "15 to 20mb ke liye konsa router acha hai"
  if (/router|device|modem/.test(t) && /\d+\s*-?\s*\d*\s*mb(ps)?\b/.test(t)) return 'router_recommend';

  // EPON/XPON/GPON compatibility question — answered with a fixed, factually correct
  // reply (our network is EPON-only) instead of the AI hallucinating an unrelated
  // "which package speed do you want" response. Checked before the generic router_info
  // catch-all since "onu" would otherwise match that first.
  if (/\b(epon|xpon|gpon)\b/.test(t) && /chal|support|compatible|kya|hai\s*kya|hoga|works?|work/.test(t)) return 'router_pon_compat';
  if (/router|device|modem|equipment|hardware|onu/.test(t)) return 'router_info';
  if (/package|plan|price|pricing|kitna\s*hoga|rates?|speed|mbps/.test(t)) return 'packages';
  if (/history|pichle\s*pay|kin\s*kin|purani\s*pay|payment\s*list/.test(t)) return 'payment_history';
  if (/expir|khatam|kab\s*band|band\s*hoga|kitne\s*din|end\s*date/.test(t)) return 'expiry';

  // Complaint — symptom described directly (e.g. "internet bhut slow") → register right away.
  if (/internet.{0,15}(nahi|band|slow|down|problem)|net.{0,12}(nahi|band|slow|down)|speed.{0,12}(slow|kam)|wifi.{0,12}(nahi|band)|kharab|chal\s*nahi|nahi\s*chal|atak\s*raha|ruk\s*ja(ta|ya)|buffer/.test(t)) return 'complaint';
  // Vague complaint mention with NO symptom yet (e.g. "mujhe complain karni hai") → ask what's
  // wrong first, same as the numbered-menu flow, instead of registering a blank ticket.
  if (/\bcomplain(t)?\b|\bshikayat\b|\bmasla\b|\bissue\b/.test(t)) return 'menu_complaint';

  // Customer asking for their payment receipt/slip/invoice/parchi image — checked
  // before 'bill'/'bill_dispute' so phrases like "bill ki slip bhej do" route here
  // instead of the balance-check flow. Opens the 24h window + triggers WABot to
  // instantly share the stored receipt PNG for their most recent payment.
  if (/receipt|\bslip\b|\bsilp\b|invoice|\bparchi\b|parchee|parchy/.test(t) && /bhej|send|kar\s*d/.test(t))
    return 'receipt_request';

  // Dispute / confusion over balance — checked before generic 'bill' so the customer
  // gets their full payment ledger automatically instead of just the current balance.
  if (/balance\s*ghalat|bill\s*ghalat|amount\s*ghalat|ye\s*kaisa\s*balance|yeh\s*kaisa\s*balance|maine\s*(to\s*)?pay\s*(kar|ki)\s*(diya|di)\s*tha|maine\s*(to\s*)?payment\s*(kar|ki)\s*(diya|di)\s*thi|maine\s*de\s*diya\s*tha|maine\s*paisay?\s*de\s*diye\s*the|dispute|inkar\s*karta|inkar\s*karti|nahi\s*dene\s*wala|ye\s*dues\s*nahi|yeh\s*dues\s*nahi|galat\s*balance|wrong\s*balance|wrong\s*amount/.test(t)) return 'bill_dispute';
  if (/bill|balance|dues|arrear|baqi|kitna\s*banta|kitna\s*hai|monthly|fees?/.test(t)) return 'bill';
  // "lagwana" now matches even when typed with a stray space ("lag wana"), plus a few more phrasings.
  if (/nay[ai]\s*conn|new\s*conn|install|lag\s*wa|lagwa|lagana|connection\s*(chahiye|laga|lagana)|naya\s*lena|naya\s*connection/.test(t)) return 'new_conn';

  return 'personal';
}

// ── Small helpers for the deterministic (non-Groq) replies below ──────────────
function isEnglishText(text: string): boolean {
  const t = text.toLowerCase();
  const urduMarkers = /\b(hai|hain|ka|ki|ke|kya|kyun|mujhe|mujhy|ap|aap|tha|thi|raha|rahi|kar|wala|wali|chahiye|nahi|han|haan|bhai|acha|theek|zaroor|hoon|horaha)\b/;
  return !urduMarkers.test(t);
}

function thanksReply(text: string): string {
  return pickFromList(isEnglishText(text) ? 'thanks_replies_en' : 'thanks_replies_ur');
}

// Customer just said "ok"/"theek hai"/"acha" — conversation is wrapping up, NOT a
// request to re-open the main menu. A short, warm close instead of re-asking
// "kis cheez mein madad chahte hain" all over again.
function closingAckReply(text: string): string {
  return pickFromList(isEnglishText(text) ? 'closing_ack_replies_en' : 'closing_ack_replies_ur');
}

function botIdentityReply(text: string, botName: string = 'Ayesha'): string {
  return tmpl(isEnglishText(text) ? 'bot_identity_reply_en' : 'bot_identity_reply_ur', { bot_name: botName });
}

// Customer (often in a voice note) greets AND asks general wellbeing — usually
// addressed to Mahad personally ("kaise ho Mahad bhai"). Reply warmly, then clarify
// Mahad isn't personally available right now so the redirect doesn't feel cold.
function greetingPersonalChatReply(text: string): string {
  return tmpl(isEnglishText(text) ? 'greeting_personal_chat_reply_en' : 'greeting_personal_chat_reply_ur', { owner_name: CONFIG.ownerName });
}

// EPON/XPON/GPON compatibility — our network only runs EPON, so this needs a fixed,
// factually correct answer instead of letting the AI improvise an unrelated reply.
function ponCompatibilityReply(text: string): string {
  const t = text.toLowerCase();
  const mentionsGpon = /\bgpon\b/.test(t);
  const mentionsEponOrXpon = /\b(epon|xpon)\b/.test(t);
  const english = isEnglishText(text);
  if (mentionsGpon && !mentionsEponOrXpon) {
    return tmpl(english ? 'pon_compat_gpon_only_en' : 'pon_compat_gpon_only_ur');
  }
  return tmpl(english ? 'pon_compat_epon_yes_en' : 'pon_compat_epon_yes_ur');
}

// For when a customer is surprised/curious to realize they're talking to a bot and
// asks something like "Mahad ne aapko rakh liya hai?" — a warm, honest self-intro
// instead of dodging the question, so trust isn't broken.
function employmentQuestionReply(text: string, botName: string = 'Ayesha'): string {
  return tmpl(isEnglishText(text) ? 'employment_question_reply_en' : 'employment_question_reply_ur', { bot_name: botName, owner_name: CONFIG.ownerName });
}

function panelIssueReply(): string {
  return tmpl('panel_issue_reply', { support_number: CONFIG.supportNumber });
}

function extractRouterRecommendMbps(text: string): number {
  const matches = [...text.toLowerCase().matchAll(/(\d+)\s*mb(ps)?/g)];
  if (!matches.length) return 0;
  return Math.max(...matches.map((m) => parseInt(m[1], 10)));
}

function routerRecommendReply(mbps: number, english: boolean): string {
  const band = mbps > 20 ? '5g' : '2.4g';
  const mbpsLabel = mbps > 0 ? `${mbps}Mbps` : 'aap ke';
  const key = band === '2.4g'
    ? (english ? 'router_recommend_24g_en' : 'router_recommend_24g_ur')
    : (english ? 'router_recommend_5g_en' : 'router_recommend_5g_ur');
  return tmpl(key, { mbps_label: mbpsLabel });
}

// ══════════════════════════════════════════════════════
// 💬 STATIC REPLY BUILDERS
// ══════════════════════════════════════════════════════

function greetingSalutation(text: string): string {
  const t = text.trim().toLowerCase();
  if (/^(as+ala+m+|aoa|a\.?o\.?a\.?|salam+|assalamu)/.test(t)) return 'Walaikum Assalam';
  if (/^good\s*morning/.test(t)) return 'Good Morning';
  if (/^good\s*afternoon/.test(t)) return 'Good Afternoon';
  if (/^good\s*evening/.test(t)) return 'Good Evening';
  if (/^good\s*night/.test(t)) return 'Good Night';
  return 'Hello';
}

function extractMbps(planName: string): number {
  const m = planName.match(/(\d+)\s*mb?ps/i) || planName.match(/(\d+)\s*mb\b/i) || planName.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 999999;
}

function welcomeMenu(salutation: string, name?: string, botName: string = 'Ayesha'): string {
  const greeting = name
    ? tmpl('greeting_named', { salutation, name })
    : tmpl('greeting_unnamed', { salutation, business_name: CONFIG.businessName });
  return tmpl('greeting_welcome_menu', { greeting, bot_name: botName });
}

function billReply(user: any, receipts: any[]): string {
  const bal = user.balance ?? 0;
  const expDate = user.expiryDate
    ? new Date(user.expiryDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'N/A';
  const last = receipts[0];

  const balanceLine = bal > 0
    ? tmpl('bill_balance_pending', { amount: bal })
    : bal < 0
    ? tmpl('bill_balance_advance', { amount: Math.abs(bal) })
    : tmpl('bill_balance_clear');
  const lastPaymentLine = last ? tmpl('bill_last_payment_line', { amount: last.paidAmount, period: last.period }) : '';

  // Quote the customer's actual net rate, not the raw system/package price — a
  // manager-set persistentDiscount must always be reflected here, otherwise the
  // bot deals purely off the system price and contradicts a discount Mahad bhai
  // already agreed with this specific customer.
  const discount = user.persistentDiscount || 0;
  const netFee = Math.max(0, (user.monthlyFee || 0) - discount);
  const discountLine = discount > 0 ? tmpl('bill_discount_line', { discount }) : '';

  return tmpl('bill_reply', {
    name: user.name,
    username: user.username || user.name,
    plan: user.plan || 'Standard',
    monthly_fee: netFee,
    discount_line: discountLine,
    balance_line: balanceLine,
    expiry_date: expDate,
    last_payment_line: lastPaymentLine,
  });
}

function paymentHistoryReply(user: any, receipts: any[]): string {
  if (!receipts.length)
    return tmpl('payment_history_empty', { name: user.name, owner_name: CONFIG.ownerName, support_number: CONFIG.supportNumber });

  const list = receipts.slice(0, 5).map((r: any, i: number) =>
    tmpl('payment_history_item', { index: i + 1, period: r.period, amount: r.paidAmount, date: new Date(r.date).toLocaleDateString('en-PK') })
  ).join('\n');

  return tmpl('payment_history_reply', { name: user.name, list, count: receipts.length });
}

function expiryReply(user: any): string {
  if (!user.expiryDate)
    return tmpl('expiry_no_date', { name: user.name, support_number: CONFIG.supportNumber, owner_name: CONFIG.ownerName });

  const exp = new Date(user.expiryDate);
  const days = Math.ceil((exp.getTime() - Date.now()) / 86400000);
  const dateStr = exp.toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' });

  const daysLine = days > 10
    ? tmpl('expiry_days_safe', { days })
    : days > 0
    ? tmpl('expiry_days_warning', { days })
    : tmpl('expiry_days_expired');

  return tmpl('expiry_reply', { name: user.name, plan: user.plan || 'Standard', expiry_date: dateStr, days_line: daysLine });
}

function packagesReply(planPrices: Record<string, number>): string {
  const entries = Object.entries(planPrices || {});
  if (!entries.length) {
    return tmpl('packages_empty', { owner_name: CONFIG.ownerName, support_number: CONFIG.supportNumber });
  }
  return tmpl('packages_reply', { package_list: renderPackageList(planPrices) });
}

function fiberUpsellPitch(): string {
  return tmpl('fiber_upsell_pitch');
}

// Checked before troubleshooting tips / complaint-ticket creation — a suspended
// account (unpaid balance or expired package) is the real cause of "no internet"
// far more often than a router fault, so billing is confirmed clear first.
function accountBillingBlockedReply(user: any): string | null {
  const bal = user.balance ?? 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const expired = user.expiryDate ? new Date(user.expiryDate) < today : false;
  if (bal <= 0 && !expired) return null;
  const expDateStr = user.expiryDate
    ? new Date(user.expiryDate).toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';
  const pendingLine = bal > 0 ? tmpl('billing_blocked_pending_line', { amount: bal }) : '';
  const expiredLine = expired ? tmpl('billing_blocked_expired_line', { expiry_date: expDateStr }) : '';
  return tmpl('account_billing_blocked_reply', { name: user.name, pending_line: pendingLine, expired_line: expiredLine });
}

function connectionTypeQuestion(): string {
  return tmpl('connection_type_question');
}

function detectConnectionType(text: string): 'fiber' | 'local' | null {
  const t = text.toLowerCase().trim();
  if (/^1$|fiber|fibre|optic/.test(t)) return 'fiber';
  if (/^2$|local|utp|\blan\b|ethernet|taar\s*wala|wire\s*wala/.test(t)) return 'local';
  return null;
}

function troubleshootingReply(issue: string, connectionType?: 'fiber' | 'local'): string {
  const t = issue.toLowerCase();
  const isWifiAuth = /password|connect\s*nahi|wifi\s*(nahi|disconnect)/.test(t);

  let tips: string;
  if (isWifiAuth) {
    tips = tmpl('troubleshoot_tips_wifi_auth');
  } else if (connectionType === 'local') {
    // Local Area (UTP/Ethernet) connections fail differently from fiber — the cable
    // crimp/connection itself or an intermediate switch is the usual culprit, not the ONU.
    tips = tmpl('troubleshoot_tips_local');
  } else {
    tips = tmpl('troubleshoot_tips_generic');
  }

  const fiberPitch = connectionType === 'local' ? tmpl('troubleshoot_fiber_pitch') : '';

  return tmpl('troubleshoot_wrapper', { tips, fiber_pitch: fiberPitch });
}

function outageReply(outage: any): string {
  const areas = (outage.areasAffected || []).join(', ') || 'aap ke area';
  const causeLine = outage.cause ? tmpl('outage_cause_line', { cause: outage.cause }) : '';
  return tmpl('outage_reply', { owner_name: CONFIG.ownerName, areas, cause_line: causeLine });
}

function routerChoicePrompt(): string {
  return tmpl('router_choice_prompt');
}

function newConnReply(planPrices?: Record<string, number>): string {
  const entries = Object.entries(planPrices || {});
  const packageBlock = entries.length ? tmpl('new_conn_package_block', { package_list: renderPackageList(planPrices!) }) : '';
  return tmpl('new_conn_reply', { package_block: packageBlock, fiber_price_per_meter: CONFIG.fiberPricePerMeter });
}

function coverageReply(): string {
  return tmpl('coverage_reply');
}

function routerPasswordGuide(modelInput: string): string {
  const m = modelInput.toLowerCase();
  let ip = '192.168.1.1';
  let note = 'username/password device ke peeche/neeche lage sticker pe likha hota hai';
  if (/gs3101/.test(m)) { ip = '192.168.1.1'; note = 'default login *admin / admin* try karein'; }
  else if (/hg8546|echolife/.test(m)) { ip = '192.168.100.1'; note = 'default login *telecomadmin / admintelecom* ya *admin / admin* try karein'; }
  else if (/\bq2\b/.test(m)) { ip = '192.168.100.1'; note = 'login device ke sticker pe check karein'; }

  return tmpl('router_password_guide', { model: modelInput, ip, note, support_number: CONFIG.supportNumber });
}

function complaintAckReply(user: any, ticketId: string, issue: string): string {
  const t = issue.toLowerCase();
  const isUrgent = /urgent|emergency|2\s*din|3\s*din|bilkul\s*nahi/.test(t);
  const isSlow = /slow|thoda/.test(t);
  const priority = isUrgent ? '🔴 High' : isSlow ? '🟡 Low' : '🟠 Medium';

  const tip = /router|wifi|net/.test(t) ? tmpl('complaint_tip_router') : '';
  const urgentOrNormalLine = isUrgent ? tmpl('complaint_urgent_line', { support_number: CONFIG.supportNumber }) : tmpl('complaint_normal_line');

  return tmpl('complaint_ack_reply', {
    name: user.name, tip, ticket_id: ticketId, priority, issue: issue.slice(0, 70), urgent_or_normal_line: urgentOrNormalLine,
  });
}

function personalReply(name?: string): string {
  return name
    ? tmpl('personal_reply_named', { name, owner_name: CONFIG.ownerName })
    : tmpl('personal_reply_unnamed', { owner_name: CONFIG.ownerName, support_number: CONFIG.supportNumber });
}

function unknownCustomerReply(): string {
  return tmpl('unknown_customer_reply', { support_number: CONFIG.supportNumber });
}

function rechargeReply(user?: any, planPrices?: Record<string, number>): string {
  const discount = user?.persistentDiscount || 0;
  const baseFee = user?.monthlyFee || planPrices?.[user?.plan] || 0;
  const netFee = Math.max(0, baseFee - discount);
  const planLine = user?.plan
    ? tmpl('recharge_reply_plan_line', { plan: user.plan, amount: netFee.toLocaleString() }) + (discount > 0 ? tmpl('recharge_discount_note') : '')
    : '';
  return tmpl('recharge_reply', { bank_accounts: tmpl('bank_accounts'), plan_line: planLine });
}

// ══════════════════════════════════════════════════════
// 🤖 GROQ (fallback for complex/open-ended queries)
// ══════════════════════════════════════════════════════
// Deterministic backstop: prompt instructions alone don't 100% stop a small/fast LLM
// from occasionally slipping in a Hindi-coded word. This runs on every Groq reply
// (text AND voice) and force-replaces any known offender with its Pakistani Urdu
// equivalent — matters more for voice since a wrong word is far more noticeable spoken
// aloud than read silently.
const HINDI_TO_URDU: Record<string, string> = {
  dhanyawad: 'shukriya', kripya: 'meherbani', samasya: 'masla', samadhan: 'hal',
  seva: 'khidmat', uplabdh: 'available', sunishchit: 'pakka', jankaari: 'maloomat',
  jankari: 'maloomat', turant: 'foran', vyavastha: 'intezam', prayas: 'koshish',
  uttar: 'jawab', pradan: 'faraham', sahayata: 'madad', sahyta: 'madad',
  vyakti: 'shaks', samay: 'waqt', yogdaan: 'hissa', nirdesh: 'hidayat',
  anurodh: 'darkhwast', namaste: 'Assalam o Alaikum', namaskar: 'Assalam o Alaikum',
  sahayog: 'tawaqo', uchit: 'munasib', vishesh: 'khaas', anumati: 'ijazat',
  nivedan: 'darkhwast', uddeshya: 'maqsad', sthiti: 'soorat-e-haal',
  kshama: 'maazrat', vidhi: 'tareeqa', abhar: 'shukriya',
};
function sanitizeHindiWords(text: string): string {
  let out = text;
  for (const [hi, ur] of Object.entries(HINDI_TO_URDU)) {
    out = out.replace(new RegExp(`\\b${hi}\\b`, 'gi'), ur);
  }
  return out;
}

// Detects Urdu/Arabic-script characters. Used to catch the failure mode where the LLM
// mirrors a voice-transcript's script (Nastaliq) back in its reply, ignoring the
// "Roman Urdu only" instruction — confirmed happening in production testing.
function containsUrduScript(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

async function callGroqOnce(system: string, userMessage: string): Promise<{ onTopic: boolean; reply: string }> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('No GROQ key');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: system }, { role: 'user', content: userMessage }],
      temperature: 0.6,
      max_tokens: 350,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = await res.json();
  const raw = data?.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error('Groq empty');

  try {
    const parsed = JSON.parse(raw);
    return { onTopic: parsed.onTopic !== false, reply: sanitizeHindiWords(parsed.reply || raw) };
  } catch {
    return { onTopic: true, reply: sanitizeHindiWords(raw) };
  }
}

// Safety net for the "CONVERSATION ENDING" prompt rule above: Groq is told not to
// repeat the same generic "koi aur madad chahiye to batayen" closer every reply, but
// small/fast models don't always follow that instruction reliably — customers notice
// immediately when a support agent sounds like a scripted bot. This strips the trailing
// generic-closer sentence whenever Ayesha's own last reply in this conversation already
// ended with something near-identical, leaving the substantive part of the answer intact.
function stripRepeatedGenericCloser(reply: string, recentHistory: string): string {
  const genericCloserRe = /[^.!?\n]*\b(koi (aur )?(masla|madad|sawal|dikkat|pareshani)\b[^.!?\n]*\b(bataen|batayen|bata dein|bata dena|zaroor batayen)|main (hamesha )?(yahan|haazir) hoon)\b[^.!?\n]*[.!?]?\s*$/i;
  const match = reply.match(genericCloserRe);
  if (!match || match.index === undefined) return reply;

  const lastAyeshaLine = recentHistory.split('\n').filter((l) => l.trim().startsWith('Ayesha:')).pop() || '';
  if (!genericCloserRe.test(lastAyeshaLine)) return reply; // first time saying it — leave it alone

  const trimmed = reply.slice(0, match.index).trim();
  return trimmed || reply; // never send an empty message
}

async function askGroq(custData: string, userMessage: string, recentHistory: string = '', botName: string = 'Ayesha', knowledgeContext: string = ''): Promise<{ onTopic: boolean; reply: string }> {
  // Customer wrote in Urdu/Nastaliq script → reply in that same script (previously this was
  // always force-converted to Roman Urdu, even when the customer clearly preferred Urdu script).
  const replyInUrduScript = containsUrduScript(userMessage);
  // Customer wrote a full English message (not just one stray English word mixed into
  // Roman Urdu) → reply fully in English, text and voice both.
  const isFullEnglish = !replyInUrduScript && isEnglishText(userMessage) && userMessage.trim().split(/\s+/).length >= 3;

  const scriptRule = replyInUrduScript
    ? `SCRIPT — ZAROORI: Customer ne apna message Urdu/Nastaliq script (اردو) mein likha hai — is liye tumhara jawab BHI sirf Urdu/Nastaliq script (اردو) mein hona chahiye, Roman/Latin letters mat likho.`
    : `SCRIPT — BILKUL ZAROORI: Customer ka message kisi bhi script mein ho (Roman/Latin letters YA Urdu/Nastaliq script — kabhi kabhi voice-note transcript Urdu script mein aata hai), tumhara jawab HAMESHA Roman/Latin alphabet mein hi hona chahiye. Kabhi Urdu/Arabic script (نستعلیق) mein mat likho — chahe customer ne usi script mein likha ho. Ek bhi Urdu/Arabic letter reply mein nahi hona chahiye.`;

  const system = `Tu ${botName} hai — MahadNet ISP ki customer support executive, ek real Pakistani larki. Tu kabhi khud ko AI, bot, model, ya assistant nahi kehti — hamesha ${botName}, MahadNet ki support team ka hissa.

URDU QUALITY BAR — ZAROORI: Tumhari Roman Urdu ek senior, tajurbakar Pakistani call-center agent jesi honi chahiye — rawan, mukammal sahih grammar, natural sentence flow. Halki si bhi awkward ya tooti-phooti construction bardasht nahi (jese galat verb tense, gender mismatch, ya word-by-word translation jesi banawat). Chhoti, seedhi, baat-cheet wali sentences likho — lambi formal ya kitabi Urdu mat likho.
Misaal SAHI: "Theek hai, main abhi check karti hoon aap ka balance." / "Fiber wala masla aksar router restart se hal ho jata hai."
Misaal GHALAT (mat likhna): "Main aap ki sahayata ke liye uplabdh hoon" (formal/Hindi-jesi), "Aap ka masla hum dekh rahe hain process" (awkward word order).

LANGUAGE MATCHING (zaroori):
- Agar customer pure English mein likhe, tum bhi professional English mein jawab do.
- Agar customer Urdu/Roman Urdu mein likhe, tum sirf Roman Urdu mein jawab do.
- Kabhi do zabanon ko mix mat karo ek hi reply mein.
- ${scriptRule}${isFullEnglish ? `\n- Customer ne is dafa MUKAMMAL English mein likha hai — is liye jawab bhi PURI tarah professional English mein do, Roman Urdu bilkul mix mat karo.` : ''}

FEMALE TONE — ZAROORI (Urdu replies mein, kabhi male/larko wale verb forms mat use karo):
GHALAT (male) → SAHI (female):
raha hoon → rahi hoon | karoon ga / karunga → karungi | doon ga / dunga → dungi
loon ga / lunga → lungi | bhejoon ga → bhejungi | samajhta hoon → samajhti hoon
rahunga → rahungi | sakta hoon → sakti hoon | tha → thi | hua tha → hui thi
madad karta hoon → madad karti hoon | dekhta hoon → dekhti hoon

SOFT, REALISTIC TONE — ZAROORI: Bilkul aisi tarah baat karo jaise koi tajurbakar Pakistani call-center female agent live call par karti hai — narm, sukoon dene wala lehja, lekin natural insaan jesa, robotic ya script-jesa nahi.
- Jawab seedha ek-line hukam jesa shuru mat karo — pehle thoda acknowledge karo (jese "Acha, samajh gayi", "Ji zaroor", "Theek hai, dekhti hoon abhi") phir baat continue karo.
- Customer pareshan ya frustrated lage to pehle thoda tasalli do (jese "Pareshan na hon, abhi dekhti hoon") phir solution do — lekin overly dramatic ya emotional mat ho, aur fake/halki tasalli har message mein repeat mat karo.
- Chhoti, warm, baat-cheet wali sentences rakho — jese koi reliable, mehrban support agent baat kar rahi ho, kitabi ya corporate-jesi zabaan se bacho.

SCOPE: Sirf MahadNet ke internet/ISP business (connection, billing, complaint, package, router, fiber, coverage, payment) se related sawalon ka khud jawab do.
Agar sawal in topics se bilkul mutaliq NAHI hai (jokes, siyasat, mazhab, ${botName} ke baray mein random/frank personal sawal, chit-chat, kisi aur company ka topic), to "onTopic": false rakho aur politely maazrat karte hue redirect karo — har dafa alfaz badal kar, jese: "Maazrat chahti hoon, main sirf MahadNet ki internet services ke mutaliq baat kar sakti hoon 😊 Koi internet, bill ya package se related sawal ho to zaroor batayen." Kabhi yeh mat kaho ke "aap ka message note kar liya gaya hai / Mahad bhai tak pohcha diya jayega" jab tak masla wakai business-related ho — woh jumla sirf genuine business messages ke liye hai, casual chit-chat ke liye nahi.

DISCOUNT AWARENESS — ZAROORI: Agar CUSTOMER INFO mein "Special Discount" mention hai, to iska matlab Mahad bhai ne is specific customer ko ek discount diya hua hai — CUSTOMER INFO mein diya gaya "Monthly (net)" amount hi is customer ka asal rate hai, jisme discount already shamil hai. Kabhi bhi full/system package price is customer ko mat batao — hamesha discount-adjusted (net) amount hi quote karo, chahe customer khud discount ka zikar kare ya na kare.

PAYMENT & COLLECTION GUIDANCE:
- Agar customer bole ke abhi payment nahi kar sakta / thodi dair mein karega: usay assure karo ke Mahad bhai ko inform kar diya jayega, jab convenient ho payment kar dein, koi pressure nahi.
- Agar customer bole ke online/bank/easypaisa se payment nahi ho sakti: usay batao ke hamara "recovery boy" ghar aa kar cash collect kar sakta hai — uska *username* aur *address* maango taake visit arrange ho sake.
- Agar koi seedha "account number" ya "bank details" maange: foran bank account details share karo, ghuma phira kar baat mat karo ya "zarooratmand details" jese vague jawab mat do.
- Naya connection ke liye installation hamesha *FREE* hai — sirf monthly package ki payment honi hoti hai. Yeh hamesha clear batao jab koi charges ke baare mein poochay.

TIMING: Kabhi "24 ghante" jaisa lamba wada mat karo — "thodi dair" ya "1-2 ghante mein" kaho.

ROUTER RECOMMENDATION: Agar koi package speed (Mbps) ke against router pochay — 20Mbps tak *2.4G single band* router refer karo, 20Mbps se zyada ke liye *5G Dual Band Huawei Q2* refer karo.

TONE RULES (zaroori):
- Cooperative aur warm raho lekin ziyada chamchagiri ya overpraise mat karo ("great question", "you're amazing" jese phrases mana hain)
- Har reply mein wording badlo, ek hi stock jumla baar baar mat daalo
- "afsos hua", "bura laga", "main madad ke liye haazir hoon", "hum hamesha hazir hain", "hum hamesha yahan hain" jese generic AI-jesi fillers BILKUL mat use karo — na shuru mein, na end mein
- Seedhi, samajhdaar, professional lekin insaan jesi baat karo — jese kisi achi call-center agent se baat ho rahi ho
- Customer ko hamesha izzat aur respect se deal karo, jese ek qeemti customer ke saath behave kiya jata hai

CONVERSATION ENDING — ZAROORI (typical chatbot jesi harkat se bacho): Jab customer "thanks", "ok", "theek hai" jesi baat kar ke conversation khatam kar raha ho, to sirf ek chhota, warm jawab do aur ruk jao — har reply ke end mein "koi aur madad chahiye to zaroor batayen" ya "main yahan hoon" jesi generic line chipkana ZAROORI nahi hai, aur baar baar yeh line dohrana bilkul mat karo. Sirf tab aisi line likho jab genuinely naya sawal ya action expect ho, warna seedha jawab de kar khatam karo — jese ek real insaan text karta hai, na ke ek AI jo har reply ke end mein "kuch aur chahiye?" pochta rehta hai.

FOLLOW-UP QUESTIONS — ZAROORI: Sirf tabhi customer se koi extra sawal pochho jab us ke bagair jawab dena genuinely mumkin na ho. Agar sawal ka jawab already CUSTOMER INFO ya us ki baat se maloom hai, to seedha jawab do — extra clarifying sawal pooch kar conversation lamba mat karo, jese aksar AI chatbots karte hain.

LANGUAGE — SIRF PAKISTANI ROMAN URDU (jab Roman Urdu mein jawab do):
Hindi ke ye words BILKUL FORBIDDEN hain:
dhanyawad→shukriya | kripya→meherbani | samasya→masla | samadhan→hal | seva→khidmat | uplabdh→available | sunishchit→pakka | jankaari→baat | turant→foran | vyavastha→intezam | prayas→koshish | uttar→jawab | pradan→dena | sahayata/sahyta→madad | vyakti→shaks | samay→waqt | yogdaan→hissa | nirdesh→hidayat | anurodh→darkhwast

SAHI WORDS: shukriya, haan ji, acha, theek hai, bilkul, zaroor, foran, masla, hal, batao, dekhti hoon, chalo

OUTPUT: Hamesha SIRF valid JSON return karo, kuch aur nahi, koi markdown fence nahi:
{"onTopic": true ya false, "reply": "tumhari reply yahan — max 4-5 lines, 1-2 emoji max"}

CUSTOMER INFO: ${custData}
COMPANY: MahadNet | Support: ${CONFIG.supportNumber}${recentHistory ? `\n\nRECENT CONVERSATION (purana context — isay yaad rakh kar jawab do, dohrao mat — sirf CURRENT message ka jawab do, kisi purane/unrelated topic par wapis mat jao):\n${recentHistory}` : ''}${knowledgeContext ? `\n\nAPPROVED REFERENCE ANSWERS (Mahad bhai ne yeh wording manually approve ki hai — agar customer ka sawal in se milta hai, isi tarah ka wording/lehja use karo):\n${knowledgeContext}` : ''}`;

  let result = await callGroqOnce(system, userMessage);

  // Guardrail: if the model leaked Urdu/Nastaliq script when it WASN'T supposed to
  // (i.e. we asked for Roman Urdu/English), retry once with a pointed correction. If it
  // leaks again, never forward broken script to the customer — fall back to a safe,
  // guaranteed-clean reply instead. (Skipped when replyInUrduScript is true, since an
  // Urdu-script reply is then the CORRECT, intended behaviour, not a leak.)
  if (!replyInUrduScript && containsUrduScript(result.reply)) {
    console.error('[askGroq] Urdu-script leak detected, retrying with stricter instruction');
    const strictSystem = `${system}\n\nCRITICAL CORRECTION: Pichli baar tumne Urdu/Nastaliq (Arabic) script mein jawab diya tha — yeh GHALAT hai. Is dafa jawab SIRF Roman/Latin letters mein likho (jese "Shukriya", "theek hai", "foran"). Ek bhi Urdu/Arabic character (نستعلیق) use mat karna, chahe customer ka message kisi bhi script mein ho.`;
    result = await callGroqOnce(strictSystem, userMessage);
  }

  if (!replyInUrduScript && containsUrduScript(result.reply)) {
    console.error('[askGroq] Urdu-script leak persisted after retry — using safe fallback reply');
    return {
      onTopic: true,
      reply: tmpl('urdu_script_leak_fallback', { support_number: CONFIG.supportNumber }),
    };
  }

  result.reply = stripRepeatedGenericCloser(result.reply, recentHistory);
  return result;
}

// ══════════════════════════════════════════════════════
// 📤 WHATSAPP SEND
// ══════════════════════════════════════════════════════
async function sendText(to: string, body: string) {
  // Voice-in → voice-out: if this customer's message this turn was a transcribed
  // voice note, every sendText() call for the rest of this turn becomes a voice reply.
  if (voiceReplyTargets.has(to)) {
    const audioUrl = await textToSpeech(body);
    if (audioUrl) { await sendAudio(to, audioUrl); return; }
    console.error('[sendText] TTS failed, falling back to text reply');
  }

  const token = process.env.WHATSAPP_TOKEN;
  const pid   = process.env.PHONE_NUMBER_ID;
  if (!token || !pid) { console.error('❌ WA env missing'); return; }
  let wamid: string | undefined;
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${pid}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
    });
    const d = await r.json();
    if (!r.ok) console.error('❌ Meta text:', JSON.stringify(d).slice(0, 200));
    else wamid = d?.messages?.[0]?.id;
  } catch (e: any) { console.error('❌ sendText:', e?.message); }
  await logMessage(to, 'out', 'text', body, { waMessageId: wamid });
}

// Complaint-ticket confirmations must always carry the ticket ID as text (so it's
// on record/searchable), even mid voice-conversation — a voice-only reply isn't
// enough for something the customer may need to reference later. Sends text always,
// and additionally a voice note when this turn started as a voice message.
async function sendTextAndVoice(to: string, body: string) {
  const wasVoiceTurn = voiceReplyTargets.has(to);
  voiceReplyTargets.delete(to); // prevent sendText() below from converting this into a voice-only reply
  await sendText(to, body);
  if (wasVoiceTurn) {
    const audioUrl = await textToSpeech(body);
    if (audioUrl) await sendAudio(to, audioUrl);
    voiceReplyTargets.add(to); // restore in case more replies follow later this turn
  }
}

async function sendAudio(to: string, audioUrl: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const pid   = process.env.PHONE_NUMBER_ID;
  if (!token || !pid) return;
  let wamid: string | undefined;
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${pid}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'audio', audio: { link: audioUrl } }),
    });
    const d = await r.json();
    if (!r.ok) console.error('❌ Meta audio:', JSON.stringify(d).slice(0, 200));
    else wamid = d?.messages?.[0]?.id;
  } catch (e: any) { console.error('❌ sendAudio:', e?.message); }
  await logMessage(to, 'out', 'audio', audioUrl, { waMessageId: wamid, mediaUrl: audioUrl });
}

async function sendImage(to: string, imageUrl: string, caption: string) {
  const token = process.env.WHATSAPP_TOKEN;
  const pid   = process.env.PHONE_NUMBER_ID;
  if (!token || !pid) return;
  let wamid: string | undefined;
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${pid}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp', to, type: 'image',
        image: { link: imageUrl, caption },
      }),
    });
    const d = await r.json();
    if (!r.ok) console.error('❌ Meta image:', JSON.stringify(d).slice(0, 200));
    else wamid = d?.messages?.[0]?.id;
  } catch (e: any) { console.error('❌ sendImage:', e?.message); }
  await logMessage(to, 'out', 'image', imageUrl, { waMessageId: wamid, mediaUrl: imageUrl });
}

async function sendRouterCatalog(to: string, band: '2.4g' | '5g') {
  const catalog = await getRouterCatalog();
  const list = catalog[band] || [];
  for (const r of list) {
    await sendImage(to, r.image, `${r.model} — ${r.company}`);
    await sendText(to, r.specs);
  }
  await sendText(to, `Koi router pasand aaya? Order ke liye batain ya call karein: *${CONFIG.supportNumber}* 😊`);
  return list;
}

// ══════════════════════════════════════════════════════
// 🚀 MAIN HANDLER
// ══════════════════════════════════════════════════════
export default async function handler(req: any, res: any) {
  if (req.method === 'GET') {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
    if (mode === 'subscribe' && token === VERIFY_TOKEN) return res.status(200).send(challenge);
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.method !== 'POST') return res.status(405).end();

  try {
    const messages: any[] = req.body?.entry?.[0]?.changes?.[0]?.value?.messages || [];
    const statuses: any[] = req.body?.entry?.[0]?.changes?.[0]?.value?.statuses || [];
    voiceReplyTargets.clear(); // defensive: never carry voice-reply state across invocations

    // Delivery ticks: Meta calls this webhook again with a `statuses` array whenever a
    // message we sent changes state (sent → delivered → read). Match by WAMID and update.
    for (const st of statuses) {
      const wamid = st?.id;
      const newStatus = st?.status; // 'sent' | 'delivered' | 'read' | 'failed'
      if (!wamid || !newStatus) continue;
      if (newStatus === 'failed' && st?.errors) {
        console.error('[delivery failed]', wamid, JSON.stringify(st.errors));
      }
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages?wa_message_id=eq.${wamid}`, {
          method: 'PATCH',
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ status: newStatus }),
        });
      } catch (e: any) { console.error('[status update]', e?.message); }
    }

    // Phase 3 — Admin Inbox: conversations mahadnet has manually taken over should not
    // get auto-replies from Ayesha. Single-tenant for now, so always manager_id='mahadnet'.
    let pausedPhones: string[] = [];
    try {
      const cfgRes = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_configs?manager_id=eq.mahadnet&select=paused_phones`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      });
      const cfgRows: any[] = await cfgRes.json();
      pausedPhones = cfgRows?.[0]?.paused_phones || [];
    } catch (e: any) { console.error('[pausedPhones fetch]', e?.message); }

    // Load admin-editable reply templates (WABot "Templates" tab) — every canned reply
    // below resolves through tmpl(key, vars), so wording changes don't need a code deploy.
    if (messages.length > 0) TEMPLATES = await getTemplates();

    for (const msg of messages) {
      const from: string = msg.from;
      let type: string = msg.type;
      let text: string = msg?.text?.body?.trim() || '';

      console.log(`📩 from=${from} type=${type} text="${text.slice(0, 80)}"`);

      // Meta's webhook delivery is at-least-once — it can resend the same event on
      // retry/timeout, and our handler can take several seconds (AI/TTS/image work),
      // which is exactly the window Meta retries in. A SELECT-then-process check has
      // a race: two concurrent invocations can both pass the check before either has
      // actually logged the message — causing duplicate chat rows AND a duplicate bot
      // reply/send. Fixed with an atomic claim: INSERT into a table with wa_message_id
      // as PRIMARY KEY. Postgres guarantees only one concurrent request can win this;
      // the loser gets a conflict and skips immediately, closing the race window.
      const msgId: string | undefined = msg.id;
      if (msgId) {
        try {
          const claimRes = await fetch(`${SUPABASE_URL}/rest/v1/webhook_processed_messages`, {
            method: 'POST',
            headers: {
              apikey: SUPABASE_KEY,
              Authorization: `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal',
            },
            body: JSON.stringify({ wa_message_id: msgId }),
          });
          // Deliberately NOT using resolution=ignore-duplicates/merge-duplicates — those
          // suppress the conflict and always return 2xx, which defeats the whole point.
          // A plain insert against the primary key gives a real 409 on duplicate, which
          // is the atomic signal we need.
          if (claimRes.status === 409) {
            console.log(`⏭️ duplicate webhook delivery for msg.id=${msgId}, skipping`);
            continue;
          }
        } catch (e: any) { console.error('[dedup claim]', e?.message); }
      }

      // Live push notification — fires for every inbound message, exactly like WhatsApp
      // itself, so mahadnet gets an instant phone alert even with the app closed.
      try {
        const pushLabel = (await findCustomer(from))?.user?.name || `+92${normPhone(from)}`;
        const preview = type === 'text' ? text.slice(0, 100) : type === 'image' ? '📷 Photo' : type === 'audio' || type === 'voice' ? '🎤 Voice note' : 'New message';
        await pushNotify('mahadnet', `💬 ${pushLabel}`, preview, `wabot-${normPhone(from)}`);
      } catch (e: any) { console.error('[wabot push]', e?.message); }

      if (pausedPhones.includes(normPhone(from))) {
        // Bot is paused on this thread — skip the AI reply/classification pipeline, but
        // still download/store any media exactly like the active-bot path below does.
        // Previously this branch logged only a '[voice note]'/'[image]' placeholder with
        // no media_url at all, which is why paused threads (i.e. almost every thread
        // mahad had manually replied on) permanently lost the actual audio/photo — the
        // Android app showed "Voice note unavailable" and the PWA fell back to plain
        // placeholder text with no player, even though a real file was sent.
        if (type === 'text' && text) {
          await logMessage(from, 'in', 'text', text);
        } else if (type === 'image') {
          const mediaId: string | undefined = msg?.image?.id;
          const caption: string = msg?.image?.caption?.trim() || '';
          const media = mediaId ? await downloadAndStoreMedia(mediaId) : null;
          await logMessage(from, 'in', 'image', caption || '[image]', { flagged: true, mediaUrl: media?.url || null });
        } else if (type === 'audio' || type === 'voice') {
          const mediaId: string | undefined = msg?.audio?.id || msg?.voice?.id;
          const { transcript, mediaUrl } = mediaId ? await transcribeAudio(mediaId) : { transcript: null, mediaUrl: null };
          await logMessage(from, 'in', 'audio', transcript || '[voice note]', { mediaUrl });
        }
        continue;
      }

      try {

      let alreadyLoggedThisTurn = false;

      if (type === 'audio' || type === 'voice') {
        const mediaId: string | undefined = msg?.audio?.id || msg?.voice?.id;
        const { transcript, mediaUrl } = mediaId ? await transcribeAudio(mediaId) : { transcript: null, mediaUrl: null };
        if (transcript) {
          // Whisper sometimes hands back Urdu/Hindi speech in Devanagari or Nastaliq
          // script — none of the Roman-Urdu regex intents below can read that, so it
          // used to fall straight to the Groq fallback (no grounded facts → wrong
          // account numbers, package lists, missed greetings, etc.). Transliterate to
          // Roman first so voice gets the exact same deterministic routing as text;
          // keep the original-script transcript for the Admin Inbox display/translate.
          const needsRoman = containsUrduScript(transcript) || containsDevanagari(transcript);
          const romanText = needsRoman ? await transliterateToRoman(transcript) : transcript;
          await logMessage(from, 'in', 'audio', transcript, { mediaUrl, translatedContent: needsRoman ? romanText : null });
          alreadyLoggedThisTurn = true;
          voiceReplyTargets.add(from); // every sendText() below now auto-becomes a voice reply
          text = romanText;
          type = 'text';
          // falls through into the normal text pipeline below — same intents, same logic
        } else {
          await logMessage(from, 'in', 'audio', '[voice note — transcription unavailable]', { mediaUrl });
          await sendText(from, tmpl('voice_note_not_understood', { support_number: CONFIG.supportNumber }));
          continue;
        }
      }

      // ── Image (payment screenshot OR a complaint/fault/technical photo) ──
      // Previously EVERY image got the exact same "payment screenshot mil gaya, verify
      // ho rahi hai" reply, even when the customer sent a router/fault photo. Now the
      // image is classified first so the reply (and the manager notification) actually
      // matches what was sent.
      if (type === 'image') {
        const mediaId: string | undefined = msg?.image?.id;
        const caption: string = msg?.image?.caption?.trim() || '';
        const found = await findCustomer(from);
        const managerId = found?.managerId || 'mahadnet';
        const media = mediaId ? await downloadAndStoreMedia(mediaId) : null;
        const mediaUrl = media?.url || null;
        await logMessage(from, 'in', 'image', mediaUrl || caption || '[image]', { flagged: true, managerId, mediaUrl });

        const rowData = found?.rowData || (await getManagerRow(managerId)) || {};
        // If media couldn't be downloaded, we can't actually see the image — don't guess
        // 'payment', fall back to 'other' (logged, no reply) same as any classifier failure.
        const category = media ? await classifyWhatsAppImage(media.buffer, media.mimeType, caption) : 'other';

        if (category === 'complaint') {
          const issueText = `[WhatsApp tasveer] Customer ne fault/complaint ki tasveer bheji hai.${caption ? `\nCaption: ${caption}` : ''}${mediaUrl ? `\nImage: ${mediaUrl}` : ''}`;
          if (found?.user) {
            await saveComplaint(managerId, rowData, found.user, issueText);
          } else {
            await notifyManager(managerId, rowData, {
              title: '🛠️ Fault/Complaint Screenshot (WhatsApp)',
              message: `${from} ne fault/complaint ki tasveer bheji hai.${caption ? `\nCaption: ${caption}` : ''}${mediaUrl ? `\n${mediaUrl}` : ''}`,
              priority: 'MEDIUM',
            });
          }
          await sendText(from, found?.user
            ? tmpl('complaint_screenshot_received_named', { name: found.user.name })
            : tmpl('complaint_screenshot_received_unnamed'));
        } else if (category === 'other') {
          // Random/unrelated photo — not a payment proof, not a fault/complaint photo.
          // No reply needed and no manager notification (avoids noise); the message log
          // entry above is enough of a record if it's ever needed.
        } else {
          // 'payment' — only reached when the classifier is confident it's a real
          // bank/wallet transaction slip. Uncertain/failed classification now falls
          // back to 'other' above, not here.
          await notifyManager(managerId, rowData, {
            title: '🧾 Payment Screenshot Mila (WhatsApp)',
            message: `${found?.user?.name || from} (${from}) ne payment screenshot bheja hai.${caption ? `\nCaption: ${caption}` : ''}${mediaUrl ? `\n${mediaUrl}` : ''}`,
            priority: 'MEDIUM',
          });
          await sendText(from, found?.user
            ? tmpl('payment_screenshot_received_named', { name: found.user.name })
            : tmpl('payment_screenshot_received_unnamed'));
        }
        continue;
      }

      if (type !== 'text' || !text) continue;

      // ── Daily first-contact greeting — checked BEFORE logging this message so
      // "first today" is accurate. Applies to EVERY number (known customer or
      // totally random/unrecognized) so whoever texts the support line sees Salam
      // + the full numbered option menu at least once per day, not only when they
      // explicitly type "assalam o alaikum". Their actual message still gets its
      // normal reply right after this, via the existing logic below.
      if (!alreadyLoggedThisTurn && (await isFirstContactToday(from))) {
        try {
          const foundForGreeting = await findCustomer(from);
          await sendText(from, welcomeMenu('Assalam o Alaikum', foundForGreeting?.user?.name, foundForGreeting?.rowData?.settings?.ayeshaBotName));
        } catch (e: any) { console.error('[daily greeting]', e?.message); }
      }

      if (!alreadyLoggedThisTurn) await logMessage(from, 'in', 'text', text);

      // ── Batch rapid-fire fragments (see debounceAndCombineFragments above) so the
      // bot understands the WHOLE thought before replying, instead of reacting to each
      // word-by-word message on its own.
      const fragmentId = msgId || `${from}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const combinedText = await debounceAndCombineFragments(from, text, fragmentId);
      if (combinedText === null) continue; // a newer fragment arrived — that invocation handles the reply
      text = combinedText;

      const intent = detectIntent(text);
      console.log(`💬 intent=${intent}`);

      // ── Priority: mid-flow slot-filling sessions (unless user issues a fresh command) ──
      const sessionObj = await getSession(from);
      const session = sessionObj?.state || null;
      const sessionData = sessionObj?.data || {};
      // BUG FIX: digits 1-8 used to ALWAYS jump to the main menu, even when a session had
      // just asked its OWN numbered question (e.g. "1=Fiber, 2=Local"). That hijacked the
      // reply to an unrelated menu item instead of answering what was actually asked.
      // Now a bare digit only counts as a main-menu override when there's no active session.
      const isOverrideCommand = intent === 'greeting' || intent === 'greeting_personal_chat' || intent === 'thanks' || intent === 'bot_identity' || intent === 'employment_question' || intent === 'marketing_optout' || (!session && /^[1-8]$/.test(text.trim()));

      if (session && !isOverrideCommand) {
        // ── Customer is choosing a specific router model from the catalog just shown ──
        // (Previously there was no session here at all, so the AI improvised an entire
        // "order placed, send address" conversation on its own — sometimes drifting to an
        // unrelated topic from older history. Now it's a real, deterministic flow.)
        if (session === 'router_catalog_shown') {
          // Customer is asking to see a different BAND (e.g. just saw 2.4G, now says "5G")
          // rather than naming a model from the list just shown. Previously this fell through
          // to the model-matching logic below, which tried to match "5g" against 2.4G model
          // names, always failed, and looped the same "samajh nahi payi" message forever.
          // Fix: detect the band-switch intent FIRST and show that catalog instead.
          if (intent === 'router_24g' || intent === 'router_5g') {
            const newBand: '2.4g' | '5g' = intent === 'router_24g' ? '2.4g' : '5g';
            await sendRouterCatalog(from, newBand);
            await setSession(from, 'router_catalog_shown', { band: newBand });
            continue;
          }

          const band: '2.4g' | '5g' = sessionData?.band === '5g' ? '5g' : '2.4g';
          const catalog = await getRouterCatalog();
          const list = catalog[band] || [];
          const t = text.toLowerCase();
          let chosen: (typeof list)[number] | null = null;

          if (list.length === 1) {
            if (/^(haan|han|ji\s*haan|yes|ok(ay)?|theek|bilkul|chahiye|le\s*lunga|le\s*loon|pasand|sure|isi|yehi|yahi|1|2)\b/.test(t)) chosen = list[0];
          } else {
            const ordinalMap: RegExp[] = [
              /^1$|1st|pehl[ai]|first|number\s*1/,
              /^2$|2nd|dusr[ai]|second|number\s*2/,
              /^3$|3rd|teesr[ai]|third|number\s*3/,
            ];
            for (let i = 0; i < list.length; i++) {
              if (ordinalMap[i]?.test(t)) { chosen = list[i]; break; }
            }
            if (!chosen) chosen = list.find(r => t.includes(r.model.toLowerCase())) || null;
          }

          if (chosen) {
            await setSession(from, 'awaiting_order_address', { model: chosen.model, price: chosen.price, band });
            await sendText(from, tmpl('router_order_confirmed', { model: chosen.model, price: chosen.price.toLocaleString() }));
          } else if (list.length === 0) {
            await setSession(from, null);
            await sendText(from, tmpl('router_band_empty', { support_number: CONFIG.supportNumber }));
          } else {
            await sendText(from, tmpl('router_choice_not_understood', { example_model: list[0].model }));
          }
          continue;
        }

        // ── Customer is sending their delivery address after picking a router ──
        if (session === 'awaiting_order_address') {
          await setSession(from, null);
          const found = await findCustomer(from);
          const row = found?.rowData || await getManagerRow('mahadnet');
          if (row) {
            await notifyManager(found?.managerId || 'mahadnet', row, {
              title: '📦 Router Order (WhatsApp)',
              message: `${found?.user?.name || from} (${from}) ne *${sessionData?.model || 'router'}* (Rs. ${sessionData?.price || ''}) order kiya hai.\nAddress: ${text.slice(0, 200)}`,
              priority: 'MEDIUM',
            });
          }
          await sendText(from, tmpl('address_noted_coverage', { address: text }));
          continue;
        }

        if (session === 'lead_awaiting_details') {
          const t = text.toLowerCase();

          // Step: user is answering the fiber-upgrade pitch (Haan/Nahi)
          if (sessionData?.fiberPitched) {
            await setSession(from, null);
            const wantsFiber = /^(haan|han|ji\s*haan|yes|bilkul|theek|chahiye|sure|ok)/.test(t);
            if (wantsFiber) {
              await saveStrayLead(from, sessionData.priorNote || text, 'Fiber upgrade — interested');
              await sendText(from, `${tmpl('fiber_info', { fiber_price_per_meter: CONFIG.fiberPricePerMeter })}${tmpl('fiber_info_lead_followup')}`);
            } else {
              await saveStrayLead(from, sessionData.priorNote || text, 'Apna existing router rakhna chahte hain — fiber upgrade se inkar');
              await sendText(from, tmpl('fiber_declined_ack'));
            }
            continue;
          }

          // Step: free-text mentions a non-fiber router brand → pitch fiber upgrade first
          const hasNonFiberRouter = /tp-?link|tenda|netgear|d-?link|mercusys|totolink|asus\s*router|wifi\s*router|wireless\s*router|taar\s*wala/.test(t);
          if (hasNonFiberRouter) {
            await setSession(from, 'lead_awaiting_details', { fiberPitched: true, priorNote: text });
            await sendText(from, fiberUpsellPitch());
            continue;
          }

          // Default: save as lead
          await setSession(from, null);
          const missingRouter = /router\s*(nahi|nai|available\s*nahi)|no\s*router/.test(t);
          const missingFiber = /fiber\s*(nahi|nai|available\s*nahi)|no\s*fiber|cable\s*nahi/.test(t);
          const planPrices = await getAnyPlanPrices();
          const matchedPlan = Object.keys(planPrices).find(p => t.includes(p.toLowerCase()));
          const row = await getManagerRow('mahadnet');
          if (row) {
            await saveLead('mahadnet', row, {
              name: 'WhatsApp Lead', phone: from, address: text.slice(0, 200),
              interestedPlan: matchedPlan, note: text, source: 'WhatsApp Bot',
            });
            await notifyManager('mahadnet', row, {
              title: '🆕 Naya Connection Lead (WhatsApp)',
              message: `Number: ${from}\nDetails: ${text.slice(0, 150)}`,
              priority: 'MEDIUM',
            });
          }

          // If this address came from a coverage question, try to auto-confirm it against
          // the manager's defined Areas before falling back to the generic "team will check"
          // reply — lead is already saved/notified above either way.
          if (sessionData?.fromCoverage) {
            const matchedArea = detectAreaFromAddress(text, row?.settings?.areas || []);
            if (matchedArea) {
              await sendText(from, tmpl('coverage_area_matched', { area: matchedArea }));
              continue;
            }
          }

          let offer = '';
          if (missingRouter) offer += `\n📡 Router chahiye? *"router"* likh kar bhejein, catalog bhej deti hoon — ya aap khud bhi kahin se le sakte hain, koi pabandi nahi! 😊`;
          if (missingFiber) offer += `\n🌐 Fiber cable Rs. ${CONFIG.fiberPricePerMeter}/meter (2-core) milta hai — installation ke waqt length measure ho jayegi. Yeh aap khud bhi kahin se kharid kar la sakte hain.`;

          // Recommend a package based on whatever the customer described — grounded
          // with the REAL packages list (same fact-grounding pattern used elsewhere)
          // instead of a generic "team will contact you" reply every time.
          const packagesListForLead = Object.entries(planPrices).map(([n, p]) => `${n} — Rs.${p}/month`).join(', ') || 'Mahad bhai se confirm karein';
          const leadCustData = `Yeh ek NAYA connection lead hai (abhi MahadNet ka customer nahi hai). Customer ne yeh detail/requirement batayi hai: "${text}"\n\nREAL AVAILABLE PACKAGES — requirement ke mutabiq suggest karna ho to YEHI exact list se karo, khud se package/price mat banao:\n${packagesListForLead}\n\nNaya connection ki installation hamesha FREE hai. Fiber cable Rs.${CONFIG.fiberPricePerMeter}/meter hai. Aap ke pas router/fiber na ho to woh humse bhi le sakte hain ya khud kahin se bhi la sakte hain — dono options hain.\n\nAakhir mein: package final customer ki apni marzi se hoga, bas requirement ke mutabiq sahi suggestion dein.`;
          let leadReply = `Shukriya! 😊 Aap ki details note kar li hain — team 1-2 ghante mein contact karegi.${offer}`;
          try {
            const aiResult = await askGroq(leadCustData, text, '', row?.settings?.ayeshaBotName || 'Ayesha', '');
            if (aiResult?.onTopic && aiResult.reply) leadReply = `${aiResult.reply}${offer}`;
          } catch (e: any) { console.error('[lead askGroq]', e?.message); }

          await sendText(from, leadReply);
          continue;
        }

        if (session === 'awaiting_router_model') {
          await setSession(from, null);
          await sendText(from, routerPasswordGuide(text));
          continue;
        }

        if (session === 'awaiting_unknown_details') {
          await setSession(from, null);
          // First check: is this actually an existing customer messaging from a new number?
          const matched = await findCustomerByUsernameOrName(text);
          if (matched) {
            await notifyManager(matched.managerId, matched.rowData, {
              title: '📱 Customer Naye Number Se Message Aaya',
              message: `${matched.user.name} (username: ${matched.user.username || 'N/A'}) ne naye number ${from} se contact kiya hai. Record mein purana number: ${matched.user.phone}. Agar sahi hai to number update kar dein.`,
              priority: 'MEDIUM',
            });
            // Remember this match so their NEXT messages (bill/complaint/etc.) don't bounce
            // back into "number nahi mila" just because the phone number itself is still
            // mismatched in the DB — see findCustomerByManagerAndId fallback below.
            await setSession(from, 'verified_alt_number', { verifiedManagerId: matched.managerId, verifiedUserId: matched.user.id });
            await sendText(from, tmpl('account_matched_new_number', { name: matched.user.name }));
            continue;
          }
          const row = await getManagerRow('mahadnet');
          if (row) {
            await notifyManager('mahadnet', row, {
              title: '📩 Naya/Unknown Number Inquiry',
              message: `Number: ${from}\nDetails: ${text.slice(0, 150)}`,
              priority: 'LOW',
            });
          }
          await sendText(from, tmpl('lead_details_received', { support_number: CONFIG.supportNumber }));
          continue;
        }

        // User went off-script while choosing a router band → still capture their text as a lead
        if (session === 'router_choice' && intent !== 'router_24g' && intent !== 'router_5g') {
          await setSession(from, null);
          await saveStrayLead(from, text, 'Router selection ke dauran area/masla bataya');
          await sendText(from, tmpl('lead_details_received_router_hint'));
          continue;
        }

        // Direct message meant for Mahad bhai
        if (session === 'awaiting_owner_message') {
          await setSession(from, null);
          const found = await findCustomer(from);
          const row = found?.rowData || await getManagerRow('mahadnet');
          const managerId = found?.managerId || 'mahadnet';
          if (row) {
            await notifyManager(managerId, row, {
              title: `📨 Direct Message for ${CONFIG.ownerName} Bhai`,
              message: `${found?.user?.name || from} (${from}): ${text.slice(0, 200)}`,
              priority: 'MEDIUM',
            });
          }
          await sendText(from, tmpl('message_forwarded_to_owner', { owner_name: CONFIG.ownerName }));
          continue;
        }

        // Complaint described via menu option 1 → check outage/billing, then ask connection type
        if (session === 'awaiting_complaint_text') {
          await setSession(from, null);
          let found = await findCustomer(from);
          if (!found && sessionData?.verifiedManagerId && sessionData?.verifiedUserId) {
            found = await findCustomerByManagerAndId(sessionData.verifiedManagerId, sessionData.verifiedUserId);
          }
          if (!found) { await sendText(from, unknownCustomerReply()); await setSession(from, 'awaiting_unknown_details'); continue; }
          const outage = getActiveOutage(found.rowData);
          if (outage) { await sendText(from, outageReply(outage)); continue; }
          const billingBlock = accountBillingBlockedReply(found.user);
          if (billingBlock) { await sendText(from, billingBlock); continue; }
          await setSession(from, 'awaiting_connection_type', { issue: text, verifiedManagerId: found.managerId, verifiedUserId: found.user.id });
          await sendText(from, connectionTypeQuestion());
          continue;
        }

        // Fiber vs Local(UTP) — branches which troubleshooting tips apply
        if (session === 'awaiting_connection_type') {
          const connType = detectConnectionType(text);
          if (!connType) {
            await sendText(from, tmpl('connection_type_not_understood'));
            continue;
          }
          const issue = sessionData?.issue || text;
          await setSession(from, 'awaiting_complaint_confirm', { issue, connectionType: connType, verifiedManagerId: sessionData?.verifiedManagerId, verifiedUserId: sessionData?.verifiedUserId });
          await sendText(from, troubleshootingReply(issue, connType));
          continue;
        }

        // After troubleshooting tips — confirm if resolved, else register the ticket
        if (session === 'awaiting_complaint_confirm') {
          await setSession(from, null);
          const t = text.toLowerCase();
          const resolved = /^(shukriya|thanks|theek\s*ho\s*gaya|fix\s*ho\s*gaya|ho\s*gaya|chal\s*gaya|sahi\s*ho\s*gaya|thank\s*you)/.test(t);
          if (resolved) {
            await sendText(from, tmpl('complaint_resolved_ack'));
            continue;
          }
          let found = await findCustomer(from);
          if (!found && sessionData?.verifiedManagerId && sessionData?.verifiedUserId) {
            found = await findCustomerByManagerAndId(sessionData.verifiedManagerId, sessionData.verifiedUserId);
          }
          if (!found) { await sendText(from, unknownCustomerReply()); await setSession(from, 'awaiting_unknown_details'); continue; }
          const connTag = sessionData?.connectionType === 'local' ? '[Local/UTP] ' : sessionData?.connectionType === 'fiber' ? '[Fiber] ' : '';
          const combinedIssue = sessionData?.issue ? `${connTag}${sessionData.issue} | Follow-up: ${text}` : `${connTag}${text}`;
          const tid = await saveComplaint(found.managerId, found.rowData, found.user, combinedIssue);
          await sendTextAndVoice(from, complaintAckReply(found.user, tid, combinedIssue));
          continue;
        }
      }

      // ── Greeting → menu (clear any pending session) ──
      // Uses sendTextAndVoice (not sendText) so a voice-note greeting gets the menu as
      // BOTH text and voice — for a first-contact intro, the visible numbered menu
      // matters even on a voice turn, unlike most other replies which go voice-only.
      if (intent === 'greeting') {
        const wasVerified = sessionData?.verifiedManagerId && sessionData?.verifiedUserId;
        await setSession(from, null);
        let found = await findCustomer(from);
        if (!found && wasVerified) found = await findCustomerByManagerAndId(sessionData.verifiedManagerId, sessionData.verifiedUserId);
        await sendTextAndVoice(from, welcomeMenu(greetingSalutation(text), found?.user?.name, found?.rowData?.settings?.ayeshaBotName));
        continue;
      }

      // ── Greeting + "kaise ho/khairiyat" personal chit-chat (common in voice notes) —
      // warm reply + clarify Mahad isn't personally available, instead of the generic
      // off-topic redirect ──
      if (intent === 'greeting_personal_chat') {
        await setSession(from, null);
        await sendTextAndVoice(from, greetingPersonalChatReply(text));
        continue;
      }

      // ── Plain "ok"/"theek hai" closing the conversation — do NOT re-open the menu ──
      if (intent === 'marketing_optout') {
        const found = await findCustomer(from);
        if (found) {
          try {
            const users = found.rowData.users || [];
            const u = users.find((x: any) => x.id === found.user.id);
            if (u) u.optedOutOfMarketing = true;
            await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${found.managerId}`, {
              method: 'PATCH',
              headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
              body: JSON.stringify({ data: { ...found.rowData, users } }),
            });
          } catch (e: any) { console.error('[marketing_optout]', e?.message); }
        }
        await sendText(from, tmpl(isEnglishText(text) ? 'marketing_optout_confirm_en' : 'marketing_optout_confirm_ur'));
        continue;
      }

      if (intent === 'closing_ack') { await sendText(from, closingAckReply(text)); continue; }

      // ── Gratitude / closing remark — quick natural reply, no Groq call, no notification spam ──
      if (intent === 'thanks') { await sendText(from, thanksReply(text)); continue; }

      // ── "What's your name / who are you" — fixed, correctly-gendered identity reply ──
      if (intent === 'bot_identity') {
        const cfgRow = await getManagerRow('mahadnet');
        await sendText(from, botIdentityReply(text, cfgRow?.settings?.ayeshaBotName));
        continue;
      }

      // ── Customer surprised/asking if Mahad "hired"/"kept" this bot — honest, warm intro ──
      if (intent === 'employment_question') {
        const cfgRow = await getManagerRow('mahadnet');
        await sendText(from, employmentQuestionReply(text, cfgRow?.settings?.ayeshaBotName));
        continue;
      }

      // ── EPON/XPON/GPON network-compatibility question — fixed factual answer ──
      if (intent === 'router_pon_compat') { await sendText(from, ponCompatibilityReply(text)); continue; }

      // ── Router/device control-panel or login trouble — troubleshooting, not a sales pitch ──
      if (intent === 'panel_issue') { await setSession(from, null); await sendText(from, panelIssueReply()); continue; }

      // ── Router recommendation based on package speed mentioned in the message ──
      if (intent === 'router_recommend') {
        const mbps = extractRouterRecommendMbps(text);
        const band: '2.4g' | '5g' = mbps > 20 ? '5g' : '2.4g';
        await sendText(from, routerRecommendReply(mbps, isEnglishText(text)));
        await sendRouterCatalog(from, band);
        await setSession(from, 'router_catalog_shown', { band });
        continue;
      }

      // ── Router band selection ──
      if (intent === 'router_24g') { await sendRouterCatalog(from, '2.4g'); await setSession(from, 'router_catalog_shown', { band: '2.4g' }); continue; }
      if (intent === 'router_5g')  { await sendRouterCatalog(from, '5g');   await setSession(from, 'router_catalog_shown', { band: '5g' });   continue; }

      // ── Router info request → show choice prompt ──
      if (intent === 'router_info') {
        await setSession(from, 'router_choice');
        await sendText(from, routerChoicePrompt());
        continue;
      }

      // ── Fiber info → share details, then capture the area reply as a lead ──
      if (intent === 'fiber_info') {
        await sendText(from, tmpl('fiber_info', { fiber_price_per_meter: CONFIG.fiberPricePerMeter }));
        await setSession(from, 'lead_awaiting_details');
        continue;
      }

      // ── Password change → ask router model first ──
      if (intent === 'password_change') {
        await setSession(from, 'awaiting_router_model');
        await sendText(from, tmpl('password_change_ask_model'));
        continue;
      }

      // ── Talk to Mahad bhai directly ──
      if (intent === 'menu_talk_owner') {
        await setSession(from, 'awaiting_owner_message');
        await sendText(from, tmpl('talk_to_owner_prompt', { owner_name: CONFIG.ownerName }));
        continue;
      }

      // ── Menu shortcuts (no DB needed) ──
      if (intent === 'menu_payment')  { await sendText(from, tmpl('bank_accounts')); continue; }
      if (intent === 'menu_new_conn' || intent === 'new_conn') {
        const planPricesForNewConn = await getAnyPlanPrices();
        await sendText(from, newConnReply(planPricesForNewConn));
        await setSession(from, 'lead_awaiting_details');
        continue;
      }
      if (intent === 'coverage') {
        await sendText(from, coverageReply());
        await setSession(from, 'lead_awaiting_details', { fromCoverage: true });
        continue;
      }
      if (intent === 'payment_how')   { await sendText(from, tmpl('bank_accounts')); continue; }

      if (intent === 'menu_packages' || intent === 'packages') {
        const found = await findCustomer(from);
        const planPrices = found?.planPrices && Object.keys(found.planPrices).length
          ? found.planPrices
          : await getAnyPlanPrices();
        await sendText(from, packagesReply(planPrices));
        continue;
      }

      // ── Activate / recharge / renew ──
      if (intent === 'recharge_request') {
        const found = await findCustomer(from);
        const planPrices = found?.planPrices && Object.keys(found.planPrices).length
          ? found.planPrices
          : await getAnyPlanPrices();
        await sendText(from, rechargeReply(found?.user, planPrices));
        continue;
      }

      // ── DB required intents ──
      let found = await findCustomer(from);
      if (!found && sessionData?.verifiedManagerId && sessionData?.verifiedUserId) {
        found = await findCustomerByManagerAndId(sessionData.verifiedManagerId, sessionData.verifiedUserId);
      }

      if (intent === 'menu_complaint') {
        if (!found) { await sendText(from, unknownCustomerReply()); await setSession(from, 'awaiting_unknown_details'); continue; }
        const outage = getActiveOutage(found.rowData);
        if (outage) { await sendText(from, outageReply(outage)); continue; }
        const billingBlock = accountBillingBlockedReply(found.user);
        if (billingBlock) { await sendText(from, billingBlock); continue; }
        // Carry the resolved identity forward so the rest of the complaint flow (which
        // re-looks-up the customer at each step) doesn't lose it if the phone number itself
        // still doesn't match the DB (e.g. verified-via-alt-number customers).
        await setSession(from, 'awaiting_complaint_text', { verifiedManagerId: found.managerId, verifiedUserId: found.user.id });
        await sendText(from, tmpl('ask_complaint_detail', { name: found.user.name }));
        continue;
      }
      if (intent === 'menu_bill') {
        if (!found) { await sendText(from, unknownCustomerReply()); await setSession(from, 'awaiting_unknown_details'); continue; }
        await sendText(from, billReply(found.user, found.receipts));
        continue;
      }
      if (intent === 'menu_expiry') {
        if (!found) { await sendText(from, unknownCustomerReply()); await setSession(from, 'awaiting_unknown_details'); continue; }
        await sendText(from, expiryReply(found.user));
        continue;
      }

      if (!found) {
        if (intent === 'personal') { await sendText(from, personalReply()); continue; }
        await sendText(from, unknownCustomerReply());
        await setSession(from, 'awaiting_unknown_details');
        continue;
      }

      const { managerId, rowData, user, receipts } = found;

      if (intent === 'receipt_request') {
        const latest = receipts[0];
        if (latest && latest.receiptImageUrl) {
          await sendImage(from, latest.receiptImageUrl, tmpl('receipt_share_caption', {
            business_name: rowData?.settings?.businessName || 'MahadNet',
            ref: latest.transactionRef || '',
            amount: (latest.paidAmount || 0).toLocaleString(),
            date: latest.date ? new Date(latest.date).toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' }) : '',
          }));
        } else if (latest) {
          // Receipt exists but has no stored image (e.g. created before this feature) —
          // fall back to the text summary instead of leaving the customer with nothing.
          await sendText(from, tmpl('receipt_not_available', { name: user.name }));
          await sendText(from, billReply(user, receipts));
        } else {
          await sendText(from, tmpl('receipt_none_found', { name: user.name }));
        }
        continue;
      }
      if (intent === 'bill')            { await sendText(from, billReply(user, receipts)); continue; }
      // Customer is disputing/confused about their balance — proactively send the full
      // payment ledger too, so they can see exactly which month's payment is missing
      // instead of going back and forth over a number.
      if (intent === 'bill_dispute') {
        await sendText(from, billReply(user, receipts));
        await sendText(from, tmpl('payment_history_context_note'));
        await sendText(from, paymentHistoryReply(user, receipts));
        continue;
      }
      if (intent === 'payment_history') { await sendText(from, paymentHistoryReply(user, receipts)); continue; }
      if (intent === 'expiry')          { await sendText(from, expiryReply(user)); continue; }

      if (intent === 'complaint') {
        const outage = getActiveOutage(rowData);
        if (outage) { await sendText(from, outageReply(outage)); continue; }
        const billingBlock = accountBillingBlockedReply(user);
        if (billingBlock) { await sendText(from, billingBlock); continue; }
        await setSession(from, 'awaiting_connection_type', { issue: text });
        await sendText(from, connectionTypeQuestion());
        continue;
      }

      // ── Fallback: Groq for everything else (personal chat, open-ended, off-topic) ──
      // 'personal' is the catch-all intent — route it to Groq instead of a canned reply,
      // so the bot actually thinks instead of just refusing with "Mahad bhai available nahi".
      const planPricesForGroq = rowData?.settings?.planPrices || {};
      const packagesListForGroq = Object.entries(planPricesForGroq).map(([n, p]) => `${n} — Rs.${p}`).join(', ') || 'Mahad bhai se confirm karein';
      const customerDiscount = user.persistentDiscount || 0;
      const customerNetFee = Math.max(0, (user.monthlyFee || planPricesForGroq?.[user.plan] || 0) - customerDiscount);
      const custData = `Customer: ${user.name} | Package: ${user.plan} | Monthly (net${customerDiscount > 0 ? ', discount already applied — mat repeat karo full price' : ''}): Rs.${customerNetFee} | Balance: Rs.${user.balance ?? 0} | Expiry: ${user.expiryDate || 'N/A'}${customerDiscount > 0 ? `\nSpecial Discount: Rs.${customerDiscount}/month — is customer ko yeh discount diya gaya hai, yeh already Monthly (net) mein shamil hai. Kabhi bhi full/system price mat quote karna.` : ''}

REAL BANK ACCOUNTS — agar account number/bank details maange to YEHI EXACT digits do, kabhi khud se number mat banao:
${tmpl('bank_accounts')}

REAL AVAILABLE PACKAGES — agar package list/pricing maange to YEHI EXACT list do, kabhi khud se package/price mat banao:
${packagesListForGroq}

Naya connection ki installation hamesha FREE hai. Fiber cable Rs.${CONFIG.fiberPricePerMeter}/meter hai (2-core, length site visit pe measure hoti hai) — yeh charge installation se alag hai.`;
      try {
        const recentHistory = await getRecentHistory(from, managerId);
        const knowledgeContext = await getApprovedKnowledge(managerId);
        const result = await askGroq(custData, text, recentHistory, rowData?.settings?.ayeshaBotName, knowledgeContext);
        await sendText(from, result.reply);

        // Knowledge-base training loop: log every AI-handled (non-deterministic) reply
        // so mahadnet can review in the Admin Inbox and "approve" good ones, which then
        // get fed back into future askGroq calls as reference answers.
        logKnowledgeCandidate(text, result.reply).catch(() => {});

        // Even though Groq's reply already addresses these conversationally, also flag them
        // to Mahad bhai so a human can act (arrange a recovery visit, follow up on a delay, etc.)
        const lowerText = text.toLowerCase();
        if (/recovery\s*boy|cash\s*(de|len|dena|collect)|bank\s*account\s*nahi|online\s*payment\s*nahi|ghar\s*pe\s*aa\s*k|aa\s*k.{0,10}le\s*lo/.test(lowerText)) {
          await notifyManager(managerId, rowData, {
            title: '💵 Cash Collection Request (WhatsApp)',
            message: `${user.name} (${from}) cash payment / recovery visit chahta hai: ${text.slice(0, 150)}`,
            priority: 'MEDIUM',
          });
        }
        if (/abhi\s*nahi\s*kar\s*sakta|paisay?\s*nahi\s*hai|baad\s*mein\s*kar\s*dunga|thodi\s*dair\s*mein\s*kar\s*doon|\budhar\b/.test(lowerText)) {
          await notifyManager(managerId, rowData, {
            title: '⏳ Payment Delay Request (WhatsApp)',
            message: `${user.name} (${from}) abhi payment nahi kar sakta: ${text.slice(0, 150)}`,
            priority: 'LOW',
          });
        }
        if (!result.onTopic) {
          await notifyManager(managerId, rowData, {
            title: '💬 Off-topic Message (WhatsApp)',
            message: `${user.name} (${from}): ${text.slice(0, 150)}`,
            priority: 'LOW',
          });
        }
      } catch (e: any) {
        await sendText(from, tmpl('temporary_delay_apology', { name: user.name, support_number: CONFIG.supportNumber }));
      }

      } finally {
        voiceReplyTargets.delete(from); // never let a voice-reply flag leak into the next message
      }
    }
  } catch (err: any) { console.error('[webhook error]', err?.message); }

  return res.status(200).json({ status: 'ok' });
}

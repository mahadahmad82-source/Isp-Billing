// Water bot reply templates (Roman Urdu). Every number comes from the database; nothing is invented.

export interface WaterCtxCustomer { id: string; name: string | null; status: string | null; area?: string | null }
export interface WaterCtx {
  found: boolean;
  matches?: number;
  customer?: WaterCtxCustomer;
  settings?: { rate_per_bottle: number; usual_bottles: number; opening_balance?: number } | null;
  ledger?: { bottles_out: number; billed: number; collected_on_delivery: number; last_delivery_date: string | null } | null;
  payments?: number;
  last_payment_date?: string | null;
  today_order?: { id: string; qty: number; status: 'new' | 'planned' } | null;
  today_delivered?: number;
}

export const rs = (n: number): string => 'Rs. ' + Math.round(n).toLocaleString('en-US');

const firstName = (c?: WaterCtxCustomer): string => (c?.name || '').trim().split(/\s+/)[0] || '';

export function menuText(business: string, bot: string, name?: string): string {
  const hi = name ? `Assalam o Alaikum ${name}!` : 'Assalam o Alaikum!';
  return `${hi} ${business} mein khush amdeed. Main ${bot} hoon.\n\nAap yeh likh sakte hain:\n1) "2 bottle bhej do" - order\n2) "hisaab" - bill / baqaya\n3) "bottles" - aap ke pas kitni bottles hain\n4) "order" - aaj ke order ka status\n5) "order cancel" - aaj ka order cancel`;
}

export const unknownCustomerText = (business: string): string =>
  `Maaf kijiye, aap ka number ${business} ke record mein nahi mila. Aap ka paigham supplier tak pohancha diya gaya hai, woh jald rabta karenge.`;

export const askQtyText = (): string => 'Kitni bottles chahiye? Jaise likhein: "3 bottle bhej do".';
export const tooManyText = (): string => 'Itni zyada bottles ke liye seedha supplier se baat kar lein. Aap ka paigham unhein bhej diya gaya hai.';
export const thanksText = (): string => 'Shukriya! Koi aur madad chahiye to likhein.';
export const complaintText = (): string => 'Aap ki shikayat supplier tak pohancha di gayi hai. Woh jald aap se rabta karenge.';
export const unsupportedMediaText = (): string => 'Abhi main sirf likhe hue paighamat samajh sakta hoon. Order ke liye likhein: "2 bottle bhej do".';
export const unknownText = (business: string, bot: string): string =>
  `Mujhe yeh baat samajh nahi aayi, magar aap ka paigham supplier tak pohancha diya gaya hai.\n\n${menuText(business, bot)}`;

export function orderText(c: WaterCtxCustomer | undefined, action: string, qty: number, prevQty?: number): string {
  const n = firstName(c);
  const head = n ? `${n}, ` : '';
  if (action === 'updated' && prevQty !== undefined && prevQty !== qty) {
    return `${head}aaj ka order ${prevQty} se badal kar ${qty} bottle kar diya. Supplier jald deliver karega.`;
  }
  return `${head}${qty} bottle ka order aaj ke liye note kar liya. Supplier jald deliver karega.`;
}

export function cancelText(r: { cancelled: number; already_planned: number }): string {
  if (r.cancelled > 0) return 'Aaj ka order cancel kar diya.';
  if (r.already_planned > 0) return 'Aap ka order route par lag chuka hai, is liye supplier se seedha baat karein.';
  return 'Aaj ka koi naya order maujood nahi tha.';
}

export function balanceText(ctx: WaterCtx, business: string): string {
  const l = ctx.ledger;
  const billed = Number(l?.billed || 0), collected = Number(l?.collected_on_delivery || 0), paid = Number(ctx.payments || 0);
  const opening = Number(ctx.settings?.opening_balance || 0);
  if (!l || (billed === 0 && paid === 0 && collected === 0 && opening === 0)) return 'Abhi tak hamare record mein koi delivery ya payment darj nahi hai.';
  const due = opening + billed - collected - paid;
  const lines = [`Aap ka hisaab:`];
  if (opening !== 0) lines.push(`Pichla baqaya: ${rs(opening)}`);
  lines.push(`Total bill: ${rs(billed)}`, `Ada kiya: ${rs(collected + paid)}`);
  if (due > 0) lines.push(`Baqaya: ${rs(due)}`);
  else if (due < 0) lines.push(`Advance: ${rs(-due)}`);
  else lines.push('Baqaya: Rs. 0');
  if (l.last_delivery_date) lines.push(`Aakhri delivery: ${l.last_delivery_date}`);
  lines.push(`(${business} ke record ke mutabiq)`);
  return lines.join('\n');
}

export function bottlesOutText(ctx: WaterCtx): string {
  const n = Number(ctx.ledger?.bottles_out || 0);
  if (n > 0) return `Hamare record ke mutabiq aap ke pas abhi ${n} bottle${n === 1 ? '' : 's'} hain.`;
  if (n < 0) return `Hamare record mein aap ki taraf se ${-n} extra khali bottle${-n === 1 ? '' : 's'} jama hain.`;
  return 'Hamare record ke mutabiq aap ke pas koi bottle nahi hai.';
}

export function statusText(ctx: WaterCtx): string {
  const delivered = Number(ctx.today_delivered || 0);
  const o = ctx.today_order;
  const parts: string[] = [];
  if (delivered > 0) parts.push(`Aaj ${delivered} bottle${delivered === 1 ? '' : 's'} deliver ho chuki hain.`);
  if (o) parts.push(o.status === 'planned'
    ? `Aaj ka order (${o.qty} bottle) route par lag chuka hai.`
    : `Aaj ka order (${o.qty} bottle) note ho gaya hai, abhi route par lagna baqi hai.`);
  if (!parts.length) return 'Aaj ke liye koi order nahi hai. Order ke liye likhein: "2 bottle bhej do".';
  return parts.join('\n');
}

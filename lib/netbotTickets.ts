// NetBot ticket-integrity helpers (pure — no I/O, unit-tested in tests/netbotTickets.test.ts).
// Used by api/webhook.ts: ticket idempotency (WI-2), open-ticket follow-up routing (WI-1)
// and the connection-type trust policy (WI-3).
import { createHash } from 'node:crypto';

const STOPWORDS = new Set([
  'hai', 'hain', 'ka', 'ki', 'ke', 'ko', 'mein', 'me', 'mera', 'meri', 'mere', 'aap', 'nahi', 'nahin',
  'bhi', 'aur', 'yeh', 'ye', 'wo', 'woh', 'the', 'and', 'for', 'my', 'is', 'hi', 'to', 'se', 'par', 'pe',
  'bohot', 'bahut', 'bohat', 'zyada', 'abhi', 'kal', 'aaj', 'ho', 'raha', 'rahi', 'rahe', 'kar', 'karo',
]);

export function contentWords(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

/** Same customer + same issue (paraphrase-tolerant) => same fingerprint. */
export function ticketFingerprint(customerId: string, issue: string): string {
  const norm = Array.from(new Set(contentWords(issue))).sort().join(' ');
  return createHash('sha1').update(`${customerId}|${norm}`).digest('hex');
}

export type OpenTicket = {
  id: string; issue: string; status: string; priority: string; createdAt: string; ageHours: number;
};

// Real ComplaintStatus values (types.ts): everything except resolved/closed is still unresolved.
export const OPEN_STATUSES = new Set(['open', 'assigned', 'revision_required', 'pending_manager_review']);

/** Customer's unresolved tickets, newest first (max 5). */
export function getOpenTickets(customerId: string, complaints: any[] | undefined, now = Date.now()): OpenTicket[] {
  return (Array.isArray(complaints) ? complaints : [])
    .filter(c => c && c.customerId === customerId && OPEN_STATUSES.has(String(c.status || '').toLowerCase()))
    .map(c => {
      const created = c.createdAt ? new Date(c.createdAt).getTime() : now;
      return {
        id: String(c.id), issue: String(c.description || c.title || ''), status: String(c.status),
        priority: String(c.priority || 'medium'), createdAt: c.createdAt || new Date(now).toISOString(),
        ageHours: Math.max(0, Math.floor((now - created) / 3600000)),
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);
}

const FOLLOWUP_RE = /\b(abhi\s*(bhi|tak)|koi\s*(aaya|aya)\s*nahi|status|kya\s*hua|kab\s*(tak|aoge|aayega|ayega)|theek\s*nahi\s*hua|wahi\s*(masla|problem)|still\s*(not|down|slow)|ticket\s*(banai|bana\s*di))\b/i;
const NEW_ISSUE_RE = /\b(aur\s+(mera|meri|ek)|doosra|dusra|alag\s+(masla|problem)|another\s+(issue|problem)|bill\s+(bhi|zyada))\b/i;

/** Deterministic (no LLM): is this complaint message a follow-up on an already-open ticket? */
export function isFollowUp(text: string, openTickets: OpenTicket[]): boolean {
  if (!openTickets.length) return false;
  const t = text || '';
  const idMatch = t.match(/WA-\d+/i);
  if (idMatch) return openTickets.some(o => o.id.toUpperCase() === idMatch[0].toUpperCase());
  if (NEW_ISSUE_RE.test(t)) return false; // customer clearly raising something different
  const newest = openTickets[0];
  const mine = new Set(contentWords(t));
  const shared = contentWords(newest.issue).filter(w => mine.has(w));
  if (new Set(shared).size >= 2) return true;
  return FOLLOWUP_RE.test(t) && newest.ageHours < 72;
}

export function followUpReply(name: string | undefined, t: OpenTicket, openCount: number): string {
  const ageLine = t.ageHours < 1 ? 'abhi thori der pehle banai thi'
    : t.ageHours < 24 ? `${t.ageHours} ghante pehle banai thi`
    : `${Math.floor(t.ageHours / 24)} din pehle banai thi`;
  const nextStep = t.ageHours < 4 ? 'Team ko forward ho chuki hai, jald check hogi.'
    : t.ageHours < 24 ? 'Team is par kaam kar rahi hai, thodi dair mein update milega.'
    : 'Mahad bhai ko dobara remind kar diya hai, aaj prioritize hogi.';
  const extra = openCount > 1 ? ` (aap ki ${openCount} tickets open hain)` : '';
  return `Ji${name ? ` ${name}` : ''}, aap ki ticket ${t.id} abhi open hai — ${ageLine}${extra}. ${nextStep} Nayi ticket nahi banai. Agar masla kuch AUR hai to wo alag se likhein.`;
}

// ── WI-3: connection-type trust policy ──
export const CONNECTION_TRUST_MS = 180 * 24 * 3600 * 1000;

export function mapConnectionType(dbType?: string): 'fiber' | 'local' | null {
  if (!dbType) return null;
  return String(dbType).trim().toLowerCase() === 'fiber' ? 'fiber' : 'local';
}

/** Only a customer-confirmed / admin-set value younger than 180 days is trusted; otherwise ask once. */
export function trustedConnectionType(user: any, now = Date.now()): 'fiber' | 'local' | null {
  const mapped = mapConnectionType(user?.connectionType);
  if (!mapped) return null;
  const src = user?.connectionTypeSource;
  const age = user?.connectionTypeAt ? now - new Date(user.connectionTypeAt).getTime() : Infinity;
  return (src === 'customer_confirmed' || src === 'admin_set') && age < CONNECTION_TRUST_MS ? mapped : null;
}

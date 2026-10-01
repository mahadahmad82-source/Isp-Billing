import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../utils/agent/parser';

// Offline Copilot intent parser — trilingual (English / Roman Urdu / Urdu script).
// These are the core regression cases; the parser must stay deterministic and
// must never send text to a server for classification.

test('payment: Ali se 1500 wasool hue', () => {
  const p = parse('Ali se 1500 wasool hue');
  assert.equal(p.intent, 'record_payment');
  assert.equal(p.customer?.value, 'ali'); // normalized for case-insensitive matching
  assert.equal(p.amount, 1500);
  assert.deepEqual(p.missing, []);
});

test('payment: Urdu script with Urdu digits', () => {
  const p = parse('علی سے ۱۵۰۰ وصول ہوئے');
  assert.equal(p.intent, 'record_payment');
  assert.equal(p.amount, 1500);
});

test('customer lookup beats summary for "Ali ka balance batao"', () => {
  const p = parse('Ali ka balance batao');
  assert.equal(p.intent, 'customer_lookup');
  assert.equal(p.customer?.value, 'ali');
});

test('total balance summary still works', () => {
  const p = parse('total balance kitna hai');
  assert.equal(p.intent, 'summary');
  assert.equal(p.metric, 'total_balance');
});

test('suspend / activate intents', () => {
  const a = parse('Ali ko band kar do');
  assert.equal(a.intent, 'set_status');
  assert.equal(a.status, 'suspended');
  const b = parse('sara ko chalu kar do');
  assert.equal(b.intent, 'set_status');
  assert.equal(b.status, 'active');
});

test('receipt history: Ali ki payments dikhao', () => {
  const p = parse('Ali ki payments dikhao');
  assert.equal(p.intent, 'receipt_history');
  assert.equal(p.customer?.value, 'ali');
});

test('today collection in Urdu script', () => {
  const p = parse('آج کی کلیکشن کتنی ہوئی');
  assert.equal(p.intent, 'summary');
  assert.equal(p.metric, 'collection_today');
});

test('expense with Urdu title and Urdu digits', () => {
  const p = parse('کھرچہ ۵۰۰ ڈیزل');
  assert.equal(p.intent, 'add_expense');
  assert.equal(p.amount, 500);
});

test('generate receipt with amount', () => {
  const p = parse('Sara ki receipt 1500 ki banao');
  assert.equal(p.intent, 'generate_receipt');
  assert.equal(p.amount, 1500);
});

test('navigation intents', () => {
  assert.equal(parse('Open customer list').intent, 'open_tab');
  assert.equal(parse('receipts kholo').intent, 'open_tab');
  assert.equal(parse('Open customer list').tab, 'users');
  assert.equal(parse('receipts kholo').tab, 'receipts');
});

test('summary intents', () => {
  assert.equal(parse('kitne customers hain').metric, 'total_customers');
  assert.equal(parse('kitne band hain').metric, 'suspended');
});

test('complaints / team / reminder intents', () => {
  assert.equal(parse('complaints dikhao').intent, 'complaint_list');
  const t = parse('Team ko message bhejo kal meeting hai');
  assert.equal(t.intent, 'send_team_message');
  assert.ok((t.teamText || '').includes('kal meeting hai'));
  const r = parse('Ali ko reminder bhej diya');
  assert.equal(r.intent, 'mark_reminded');
  assert.equal(r.customer?.value, 'ali');
});

test('edit customer extracts field and value', () => {
  const p = parse('Ali ka number change karo 03001234567');
  assert.equal(p.intent, 'edit_customer');
  assert.equal(p.editField, 'phone');
  assert.equal(p.editValue, '03001234567');
});

test('balance-filtered customer list', () => {
  const p = parse('jin ka balance zyada hai unki list dikhao');
  assert.equal(p.intent, 'customer_list');
});

test('missing slots are reported, not guessed', () => {
  const p = parse('1500 wasool hue');
  assert.equal(p.intent, 'record_payment');
  assert.ok((p.missing || []).includes('customer'));
  assert.equal(p.amount, 1500);
});

test('nonsense input is unclear, never a write', () => {
  const p = parse('xyz blabla qwerty');
  assert.equal(p.intent, 'unclear');
});

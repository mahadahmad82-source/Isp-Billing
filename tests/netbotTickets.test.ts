import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ticketFingerprint, getOpenTickets, isFollowUp, followUpReply, trustedConnectionType,
} from '../lib/netbotTickets';

const NOW = new Date('2026-10-08T10:00:00Z').getTime();
const hoursAgo = (h: number) => new Date(NOW - h * 3600000).toISOString();
const ticket = (over: any = {}) => ({
  id: 'WA-1', customerId: 'u1', status: 'open', priority: 'medium',
  description: 'net slow in evening', title: 'WA: net slow in evening', createdAt: hoursAgo(26), ...over,
});

test('fingerprint: paraphrase collides', () => {
  assert.equal(ticketFingerprint('u1', 'net slow hai'), ticketFingerprint('u1', 'net bohot slow hai'));
  assert.equal(ticketFingerprint('u1', 'Net SLOW hai!!'), ticketFingerprint('u1', 'net slow'));
});
test('fingerprint: distinct issues / customers do not collide', () => {
  assert.notEqual(ticketFingerprint('u1', 'bill zyada aya hai'), ticketFingerprint('u1', 'net band hai'));
  assert.notEqual(ticketFingerprint('u1', 'net slow'), ticketFingerprint('u2', 'net slow'));
});

test('getOpenTickets: only this customer, only unresolved, newest first', () => {
  const list = getOpenTickets('u1', [
    ticket({ id: 'WA-old', createdAt: hoursAgo(50) }),
    ticket({ id: 'WA-new', createdAt: hoursAgo(2) }),
    ticket({ id: 'WA-done', status: 'resolved' }),
    ticket({ id: 'WA-closed', status: 'closed' }),
    ticket({ id: 'WA-asg', status: 'assigned', createdAt: hoursAgo(30) }),
    ticket({ id: 'WA-other', customerId: 'u2' }),
  ], NOW);
  assert.deepEqual(list.map(t => t.id), ['WA-new', 'WA-asg', 'WA-old']);
  assert.equal(list[0].ageHours, 2);
  assert.deepEqual(getOpenTickets('u1', undefined, NOW), []);
});

test('isFollowUp: true for "abhi bhi" with open ticket < 72h', () => {
  const open = getOpenTickets('u1', [ticket()], NOW);
  assert.equal(isFollowUp('mera net abhi bhi slow hai, kal ticket banai thi', open), true);
  assert.equal(isFollowUp('koi aaya nahi abhi tak', open), true);
});
test('isFollowUp: true on own ticket id, false on someone else’s id', () => {
  const open = getOpenTickets('u1', [ticket()], NOW);
  assert.equal(isFollowUp('WA-1 ka status batao', open), true);
  assert.equal(isFollowUp('WA-999 ka status', open), false);
});
test('isFollowUp: false for a clearly new issue', () => {
  const open = getOpenTickets('u1', [ticket()], NOW);
  assert.equal(isFollowUp('aur mera bill bhi zyada aaya hai', open), false);
  assert.equal(isFollowUp('mera cable cut gaya hai', open), false);
});
test('isFollowUp: false with no open tickets; follow-up phrasing alone is stale after 72h', () => {
  assert.equal(isFollowUp('abhi bhi slow hai', []), false);
  const stale = getOpenTickets('u1', [ticket({ createdAt: hoursAgo(100) })], NOW);
  assert.equal(isFollowUp('abhi bhi masla hai', stale), false);
});
test('isFollowUp: shares ≥2 content words with open ticket', () => {
  const open = getOpenTickets('u1', [ticket({ description: 'router wifi signal weak bedroom', createdAt: hoursAgo(100) })], NOW);
  assert.equal(isFollowUp('wifi signal phir weak hai', open), true);
});

test('followUpReply mentions id and never promises a new ticket', () => {
  const [t] = getOpenTickets('u1', [ticket()], NOW);
  const r = followUpReply('Ahmed', t, 1);
  assert.match(r, /WA-1/);
  assert.match(r, /Nayi ticket nahi banai/);
  assert.doesNotMatch(r, /24 ghante mein/);
});

test('trustedConnectionType: 179d trusted, 181d not, missing source -> null', () => {
  const d = (n: number) => new Date(NOW - n * 86400000).toISOString();
  assert.equal(trustedConnectionType({ connectionType: 'Fiber', connectionTypeSource: 'customer_confirmed', connectionTypeAt: d(179) }, NOW), 'fiber');
  assert.equal(trustedConnectionType({ connectionType: 'Fiber', connectionTypeSource: 'customer_confirmed', connectionTypeAt: d(181) }, NOW), null);
  assert.equal(trustedConnectionType({ connectionType: 'Fiber' }, NOW), null);
  assert.equal(trustedConnectionType({ connectionType: 'Wireless', connectionTypeSource: 'admin_set', connectionTypeAt: d(5) }, NOW), 'local');
  assert.equal(trustedConnectionType({}, NOW), null);
});

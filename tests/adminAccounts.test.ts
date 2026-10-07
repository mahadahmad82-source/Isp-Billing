import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCreateManager, createManagerAccount } from '../lib/adminAccounts';

const good = { username: 'Dabeer.Water', password: 'secret1', business_name: 'Dabeer Water', business_type: 'water', phone: '0300-1234567' };

test('validation: normalizes username, enforces rules', () => {
  const r = validateCreateManager(good); assert.equal(r.ok, true);
  if (r.ok) { assert.equal(r.v.username, 'dabeer.water'); assert.equal(r.v.businessType, 'water'); }
  for (const bad of [{ username: 'a b' }, { username: 'ab' }, { password: '123' }, { business_name: 'x' }, { business_type: 'cable' },
                     { email: 'x@myisp.local' }, { email: 'nope' }, { cnic: '123' }, { phone: 'abc' }]) {
    assert.equal(validateCreateManager({ ...good, ...bad }).ok, false, JSON.stringify(bad));
  }
  assert.equal(validateCreateManager({ ...good, email: '', cnic: '' }).ok, true);
});

// minimal fake supabase client
function fakeDb(opts: { taken?: boolean; mdTaken?: boolean; cnicTaken?: boolean; authErr?: string; updErr?: string; updRows?: number } = {}) {
  const log: string[] = [];
  const q = (table: string) => {
    const st: any = { table, filters: {} as any };
    st.select = () => st; st.eq = (c: string, v: any) => { st.filters[c] = v; return st; };
    st.limit = async () => {
      if (table === 'profiles' && 'username' in st.filters) return { data: opts.taken ? [{ id: 'x' }] : [] };
      if (table === 'manager_data') return { data: opts.mdTaken ? [{ manager_id: 'x' }] : [] };
      if (table === 'profiles' && 'cnic' in st.filters) return { data: opts.cnicTaken ? [{ id: 'x' }] : [] };
      return { data: [] };
    };
    st.update = (payload: any) => { log.push('update:' + JSON.stringify(payload)); const u: any = {}; u.eq = () => u; u.select = async () => opts.updErr ? { data: null, error: { message: opts.updErr } } : { data: Array.from({ length: opts.updRows ?? 1 }, () => ({ id: 'u1' })), error: null }; return u; };
    st.insert = (p: any) => { log.push('insert:' + table + ':' + p.action); return Promise.resolve({}); };
    return st;
  };
  const db: any = { from: q, auth: { admin: {
    createUser: async (a: any) => { log.push('createUser:' + a.email + ':confirm=' + a.email_confirm); return opts.authErr ? { data: null, error: { message: opts.authErr } } : { data: { user: { id: 'u1' } }, error: null }; },
    deleteUser: async (id: string) => { log.push('deleteUser:' + id); return {}; },
  } } };
  return { db, log };
}

test('create: success uses synthetic email, confirms, sets type + business_type_set, logs', async () => {
  const f = fakeDb(); const r = await createManagerAccount(f.db, 'admin1', good);
  assert.equal(r.status, 200); assert.equal(r.body.success, true); assert.equal(r.body.uses_synthetic_email, true);
  assert.ok(f.log.includes('createUser:dabeer.water@myisp.local:confirm=true'));
  const upd = f.log.find(l => l.startsWith('update:'))!; assert.match(upd, /"business_type":"water"/); assert.match(upd, /"business_type_set":true/); assert.match(upd, /"role":"manager"/);
  assert.ok(f.log.includes('insert:admin_action_logs:create_manager:water'));
});
test('create: real email is used when provided', async () => {
  const f = fakeDb(); await createManagerAccount(f.db, 'a', { ...good, email: 'Owner@Example.com' });
  assert.ok(f.log.includes('createUser:owner@example.com:confirm=true'));
});
test('create: duplicates are rejected before Auth is touched', async () => {
  for (const o of [{ taken: true }, { mdTaken: true }, { cnicTaken: true }]) {
    const f = fakeDb(o); const r = await createManagerAccount(f.db, 'a', { ...good, cnic: '1234512345671' });
    assert.equal(r.status, 409); assert.equal(f.log.some(l => l.startsWith('createUser')), false);
  }
});
test('create: profile failure rolls back the Auth user (nothing half-created)', async () => {
  for (const o of [{ updErr: 'boom' }, { updRows: 0 }]) {
    const f = fakeDb(o); const r = await createManagerAccount(f.db, 'a', good);
    assert.equal(r.body.success, false); assert.ok(f.log.includes('deleteUser:u1'));
  }
});
test('create: auth error is reported, duplicate email => 409', async () => {
  const f = fakeDb({ authErr: 'User already registered' }); const r = await createManagerAccount(f.db, 'a', { ...good, email: 'a@b.com' });
  assert.equal(r.status, 409);
});

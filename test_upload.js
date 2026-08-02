const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16bWFqbWp6b3Bta3pib2l6cmJtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQ2NTIwNywiZXhwIjoyMDkzMDQxMjA3fQ.46JjFzVTyNPWWMhT1dCUZRLBpniGe2BwzE_qUHd7frY';

async function test() {
  const path = 'test-' + Date.now() + '.txt';
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/whatsapp-media/${path}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'text/plain' },
    body: 'test content'
  });
  console.log('Status:', res.status);
  console.log('Body:', await res.text());
}
test();

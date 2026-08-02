const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16bWFqbWp6b3Bta3pib2l6cmJtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzQ2NTIwNywiZXhwIjoyMDkzMDQxMjA3fQ.46JjFzVTyNPWWMhT1dCUZRLBpniGe2BwzE_qUHd7frY';

async function test() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages?direction=eq.out&order=created_at.desc&limit=10`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
test();

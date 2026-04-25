// utils/supabase.ts
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://msnvbnnglbjrgnkwtwwg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1zbnZibm5nbGJqcmdua3d0d3dnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNjk0NDYsImV4cCI6MjA5MTg0NTQ0Nn0.DLGhhHFeofUZGORGMobTULtrcHolcSWCRrT0_skPolw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

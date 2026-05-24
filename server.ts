import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createClient } from '@supabase/supabase-js';

// Configuration
const PORT = 3000;
const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';

// Lazy initialization of Supabase Admin Client
let supabaseAdmin: any = null;
function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) {
      console.warn("SUPABASE_SERVICE_ROLE_KEY not found. Server-side sync will be limited.");
      // Fallback to anon key if service role is missing (for local testing without secrets)
      return createClient(SUPABASE_URL, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16bWFqbWp6b3Bta3pib2l6cmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjUyMDcsImV4cCI6MjA5MzA0MTIwN30.YpirkCCMXoRGBpHVqv4YtIyKQMqhjWSxMf1m7hTOSjw');
    }
    supabaseAdmin = createClient(SUPABASE_URL, key);
  }
  return supabaseAdmin;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '50mb' }));

  // API Route: Search for an agent in the manager_data JSON
  // This allows agents to log in even if they don't have a Supabase Auth account
  app.post("/api/auth/search-agent", async (req, res) => {
    const { username, password } = req.body;
    console.log(`[Auth] Search request for: ${username}`);
    
    try {
      const supabase = getSupabaseAdmin();
      
      // We can't easily do a complex OR search with multiple fields in a JSON array via PostgREST contains
      // So we fetch all manager data and search in memory. 
      // (Optimized: in a real app, we would use a Postgres function, but this works for moderate scale)
      const { data: managers, error } = await supabase
        .from('manager_data')
        .select('manager_id, data');

      if (error) {
        console.error("[Auth] Supabase select error:", error);
        throw error;
      }
      
      if (managers) {
        for (const manager of managers) {
          const agents = (manager.data as any).subManagers || [];
          const agent = agents.find((sm: any) => 
            (sm.username?.toLowerCase() === username.toLowerCase() || 
             sm.email?.toLowerCase() === username.toLowerCase() || 
             sm.phone === username) && 
            sm.password === password
          );
          
          if (agent) {
            console.log(`[Auth] Found agent: ${agent.username} under manager: ${manager.manager_id}`);
            return res.json({ 
              success: true, 
              agent: {
                username: agent.username,
                name: agent.name,
                email: agent.email || '',
                phone: agent.phone || '',
                managerId: manager.manager_id
              } 
            });
          }
        }
      }
      
      console.warn(`[Auth] No agent found for credentials: ${username}`);
      res.status(401).json({ success: false, message: "Invalid credentials" });
    } catch (err: any) {
      console.error("[Auth] Exception:", err);
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // API Route: Secure Sync Save (Bypasses RLS)
  app.post("/api/sync/save", async (req, res) => {
    const { managerId, state } = req.body;
    if (!managerId) return res.status(400).json({ error: "Missing managerId" });

    try {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase
        .from('manager_data')
        .upsert(
          { manager_id: managerId, data: state, updated_at: new Date().toISOString() },
          { onConflict: 'manager_id' }
        );

      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      console.error("Sync save error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Route: Secure Sync Load (Bypasses RLS)
  app.get("/api/sync/load/:managerId", async (req, res) => {
    const { managerId } = req.params;
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('manager_data')
        .select('data')
        .eq('manager_id', managerId)
        .maybeSingle();

      if (error) throw error;
      res.json({ data: data?.data || null });
    } catch (err: any) {
      console.error("Sync load error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Route: Admin Export All Data
  app.get("/api/admin/export", async (req, res) => {
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('manager_data')
        .select('*');
      if (error) throw error;
      res.json({ success: true, data });
    } catch (err: any) {
      console.error("Admin export error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // API Route: Admin Export All Data File Download
  app.get("/api/admin/export-download", async (req, res) => {
    try {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from('manager_data')
        .select('*');
      if (error) throw error;
      
      const exportData = {
         databaseDump: data,
         version: 'admin_1.0',
         timestamp: new Date().toISOString()
      };
      
      const filename = `Admin_Database_Backup_${new Date().toISOString().split('T')[0]}.json`;
      
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      res.send(JSON.stringify(exportData, null, 2));
    } catch (err: any) {
      console.error("Admin export download error:", err);
      res.status(500).send("Error generating backup: " + err.message);
    }
  });

  // API Route: Admin Import All Data
  app.post("/api/admin/import", async (req, res) => {
    const { data } = req.body;
    try {
      const supabase = getSupabaseAdmin();
      const { error } = await supabase
        .from('manager_data')
        .upsert(data, { onConflict: 'manager_id' });
      if (error) throw error;
      res.json({ success: true });
    } catch (err: any) {
      console.error("Admin import error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

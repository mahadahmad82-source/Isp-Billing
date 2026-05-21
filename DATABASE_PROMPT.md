# Claude Code Prompt: MyISP Backend & Agent Portal Sync

Copy and paste this prompt into Claude Code to implement the necessary backend and database changes for your ISP Billing app.

---

**Task**: Implement full cloud synchronization for the Agent Portal and fix agent login persistence issues.

**Context**: My React app uses Supabase for authentication and state persistence. Managers recruit field agents, but these agents currently only exist in local storage on the manager's device. We need to move them to a real database structure so they can login from any device and sync data to their manager's record.

**Requirements**:

1. **Database Schema Setup (Supabase)**:
   - Create a `profiles` table to store user metadata (`id`, `username`, `role`, `manager_id`, `name`).
   - The `manager_id` should point to the manager's UUID for agents, and be NULL for managers.
   - Set up RLS (Row Level Security) on `manager_data` so that:
     - Managers can READ/UPDATE their own record.
     - Agents can READ the record of their `manager_id`.

2. **Backend API (Express/Vite)**:
   - Implement an API endpoint `/api/auth/create-agent` that uses a Supabase Service Role Key (securely on the server) to create a new Supabase Auth user for an agent.
   - This prevents the manager from being logged out when they recruit a new agent.
   - The API should:
     - Create the Auth user.
     - Insert a record into the `profiles` table with `role = 'sub-manager'` and the current manager's ID.

3. **Frontend Integration**:
   - Update `onAgentRecruited` in `App.tsx` to call this new API instead of just saving to local storage.
   - Update the login flow to ensure that when an agent logs in, their profile data (including `manager_id`) is correctly fetched and applied to the session.

4. **Persistence of Profile Settings**:
   - Ensure that when an agent updates the business address or phone in their profile, it correctly triggers an update to the `manager_data` JSON blob in Supabase.

Please implement these changes across the `server.ts`, `App.tsx`, and relevant components.

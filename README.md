# Hope City Hub

Mobile-first church hub for **Hope City Highlands** — connect, give, request prayer, and see upcoming events. Includes an optional AI assistant for personalized prayers (Hugging Face).

**Tagline:** Belong. Believe. Become.

---

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Features

- **Announcement banner** — Dismissible top banner (e.g. Easter times).
- **Primary actions** — I'm New / Connect, Give Online (Tithe.ly), Prayer Request (Elvanto forms).
- **Upcoming events** — Cultural Sunday, Worship Night, Outreach with sign-up links.
- **Hope AI Assistant** — Floating button opens a modal; users can share a need and get a short prayer + scripture (Hugging Face). Optional “Listen to Prayer” (TTS can be wired later).
- **NFC Tap landing** — `/tap` route supports `?action=connect|give|prayer|directions&source=...&tag=...`.
- **Engagement tracking** — Click events can be stored in Supabase and viewed in `/admin`.

---

## Configuration

Use the **Admin** page (`/admin`, or “Admin” in the footer) to edit:

- Announcement banner (on/off, text, link)
- Links (connect card, prayer, giving, baptism, dream team, directions, YouTube)
- Social links (Instagram, Facebook, YouTube)
- Upcoming events (add/edit/remove)

Admin now requires Supabase authentication. Without Supabase configuration, `/admin` is intentionally unavailable.

Brand colors stay in **`BRAND_COLORS`** in `src/App.jsx` (teal `#004E59`, lime `#A3D600`).

---

## Database (optional)

To store config and events in a **Supabase** (Postgres) database:

1. Create a project at [supabase.com](https://supabase.com).
2. In the Supabase dashboard, open **SQL Editor** and run the contents of `supabase/migrations/001_initial.sql` (creates `site_config` and `events` tables and RLS policies).
3. Run `supabase/migrations/002_click_events.sql` to create click tracking table and policies for NFC/home CTA analytics.
4. Run `supabase/migrations/003_admin_hardening.sql` to enable transactional admin save RPC and aggregated analytics RPC.
5. Run `supabase/migrations/004_admin_rbac.sql` to enforce explicit admin allowlisting (`public.admin_users`).
6. Run `supabase/migrations/005_admin_lockdown.sql` to enforce admin-only direct writes and hardened public click ingestion.
7. In **Authentication → Providers**, ensure **Email** is enabled. (Optional: turn off “Confirm email” for simpler first-time admin setup.)
8. Create the **first auth user** in the dashboard: **Authentication → Users → Add user** (enter email and password).
9. Copy `.env.example` to `.env` and set:
   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```
   (Find URL and anon key under **Settings → API**.)
10. Restart the dev server. Optionally deploy the **invite-admin** Edge Function so existing admins can invite others: install [Supabase CLI](https://supabase.com/docs/guides/cli), run `supabase link` and `supabase functions deploy invite-admin`. Then use **Add admin** in `/admin` to send invite emails.
11. Run `supabase/migrations/006_admin_audit_log.sql` to add admin audit logging.
12. Set edge-function CORS allowlist (comma-separated origins):
   ```bash
   supabase secrets set ALLOWED_ORIGINS=https://hopecityhighlands.com,https://www.hopecityhighlands.com
   ```
13. Redeploy edge functions after changing CORS allowlist:
   ```bash
   supabase functions deploy invite-admin
   supabase functions deploy hf-generate
   ```

Without these env vars, the app still serves the public site but keeps `/admin` locked.

### One-time admin bootstrap

After your first auth user is created, allowlist them as admin:

```sql
insert into public.admin_users (user_id)
values ('YOUR_AUTH_USER_UUID')
on conflict (user_id) do nothing;
```

### Admin offboarding

Remove admin access for a user:

```sql
delete from public.admin_users
where user_id = 'USER_UUID_TO_REMOVE';
```

### Periodic admin review

Review current admins and latest action history monthly:

```sql
select
  au.user_id,
  au.created_at,
  au.created_by,
  max(a.created_at) as last_admin_action_at
from public.admin_users au
left join public.admin_audit_log a
  on a.actor_user_id = au.user_id
group by au.user_id, au.created_at, au.created_by
order by coalesce(max(a.created_at), au.created_at) desc;
```

Review recent admin actions:

```sql
select created_at, actor_user_id, action, details
from public.admin_audit_log
order by created_at desc
limit 100;
```

### NFC tag URL format

Use this format when programming tags:

```text
https://your-domain.com/tap?action=connect&source=lobby_sign&tag=tag01
```

- `action`: `connect`, `give`, `prayer`, `directions`
- `source`: where the tag is placed
- `tag`: unique tag identifier

---

## AI prayers (optional)

The Hope AI Assistant uses a **Supabase Edge Function proxy** (`hf-generate`) to call Hugging Face server-side (avoids browser CORS and keeps token off the client).

1. Create a [Hugging Face account](https://huggingface.co/join) and get an [access token](https://huggingface.co/settings/tokens) (read role is enough).
2. Deploy the edge function:
   ```bash
   supabase functions deploy hf-generate
   ```
3. Set function secret in Supabase:
   ```bash
   supabase secrets set HUGGINGFACE_API_TOKEN=your_token_here
   ```
4. Ensure frontend env has:
   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```
5. (Optional) Pick a model in `.env`:
   ```bash
   VITE_HF_MODEL=HuggingFaceTB/SmolLM3-3B
   ```
6. Restart the dev server. Open Hope AI Assistant and submit a request.

---

## Scripts

| Command       | Description                |
|---------------|----------------------------|
| `npm run dev` | Start dev server           |
| `npm run build` | Production build in `dist/` |
| `npm run preview` | Preview production build |

---

## Stack

- **React 18** + **Vite** + **React Router**
- **Tailwind CSS** + **tailwindcss-animate**
- **lucide-react** for icons
- **Supabase** (optional) for Postgres config/events and email/password admin auth

---

## License

See [LICENSE](LICENSE).

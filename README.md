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
- **PWA install support** — Installable on mobile/desktop with offline fallback and home-screen metadata.
- **Hope AI Assistant** — Floating button opens a modal; users can ask for prayer, scripture, or Hope City Highlands/site information pulled from current app data. Optional “Listen to Prayer” (TTS can be wired later).
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
10. Restart the dev server. Optionally deploy the **invite-admin** Edge Function so existing admins can invite others: install [Supabase CLI](https://supabase.com/docs/guides/cli), run `supabase link` and `supabase functions deploy invite-admin --no-verify-jwt`. Then use **Add admin** in `/admin` to send invite emails.
11. Run `supabase/migrations/006_admin_audit_log.sql` to add admin audit logging.
12. Run `supabase/migrations/007_keepalive_ping.sql` if you want a lightweight keepalive RPC.
13. Run `supabase/migrations/008_keepalive_cron.sql` if you want the initial Supabase Cron wiring.
14. Run `supabase/migrations/009_public_page_config_rpc.sql` to add a single-response public config RPC and align keepalive with the same read path the site uses.
15. Run `supabase/migrations/010_keepalive_cron_refresh.sql` to replace the original daily cron with an hourly refresh that targets the new keepalive path.
16. Run `supabase/migrations/011_public_page_config_meta.sql` to add a lightweight public cache metadata RPC so clients can validate cached config before downloading the full payload.
17. Run `supabase/migrations/012_ai_chat_logs.sql` to store AI prayer conversations for admin review.
18. Run `supabase/migrations/013_ai_chat_log_retention.sql` to automatically purge AI prayer logs older than 30 days.
19. Run `supabase/migrations/014_admin_save_events_delete_where.sql` to keep event saves compatible with Supabase safe-update settings.
20. Run `supabase/migrations/015_event_locations.sql` to add event location/address support for maps links and calendar files.
21. **Optional:** restrict which browser origins may call Edge Functions by setting `ALLOWED_ORIGINS` (comma-separated, exact origins, no trailing slash unless you use it in the URL). If you **skip** this secret, any origin is allowed (your anon key is still required). If you **do** set it, list **every** place the app runs—e.g. production **and** Vercel preview URLs such as `https://hope-city-hub.vercel.app`. Otherwise the browser shows a CORS error on Hope AI (`No 'Access-Control-Allow-Origin' header` on the preflight). To go back to permissive mode: `supabase secrets unset ALLOWED_ORIGINS`.
   ```bash
   supabase secrets set ALLOWED_ORIGINS=https://hopecityhighlands.com,https://www.hopecityhighlands.com,https://hope-city-hub.vercel.app
   ```
22. Redeploy edge functions after changing secrets or function code. Turn off Supabase gateway JWT checks for browser-called functions so CORS preflights and ES256 session tokens reach the function code (see `supabase/config.toml`, or use the flags below):
   ```bash
   supabase functions deploy invite-admin --no-verify-jwt
   supabase functions deploy hf-generate --no-verify-jwt
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

### Keepalive

If your Supabase project idles when the site goes quiet, this repo now includes an optional keepalive path:

1. Apply `supabase/migrations/007_keepalive_ping.sql`.
2. Apply `supabase/migrations/008_keepalive_cron.sql`.
3. Apply `supabase/migrations/009_public_page_config_rpc.sql`.
4. Apply `supabase/migrations/010_keepalive_cron_refresh.sql`.
5. Apply `supabase/migrations/011_public_page_config_meta.sql`.
6. Open **Integrations → Cron** in Supabase to confirm the `supabase-keepalive-hourly` job is active and to review run history.

The refreshed cron job runs hourly at `:17 UTC` and calls `public.keepalive_touch()`, which executes the same single-response config path the website now prefers. The companion `get_public_page_config_meta()` RPC lets the web app validate cached config first and skip the heavier payload when nothing changed.

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

The Hope AI Assistant uses the existing **Supabase Edge Function proxy** (`hf-generate`) as a server-side router for multiple providers, so browser clients never see provider API keys. The proxy also injects current Hope City Highlands site/app context so the assistant can answer questions about events, giving, directions, social links, and other information already present in the app.

Recommended priority for lowest-cost fallback:
- Gemini
- DeepSeek
- Claude
- OpenAI

1. Enable the assistant in frontend env:
   ```bash
   VITE_ENABLE_AI=true
   ```
2. Deploy the edge function (JWT verification off so browser CORS preflight works; same as `supabase/config.toml`):
   ```bash
   supabase functions deploy hf-generate --no-verify-jwt
   ```
3. Set provider secrets in Supabase. Example:
   ```bash
   supabase secrets set \
     AI_PROVIDER_ORDER=gemini,deepseek,anthropic,openai \
     GEMINI_API_KEY=your_gemini_key \
     GEMINI_MODEL=gemini-2.5-flash-lite \
     DEEPSEEK_API_KEY=your_deepseek_key \
     DEEPSEEK_MODEL=deepseek-chat \
     ANTHROPIC_API_KEY=your_anthropic_key \
     ANTHROPIC_MODEL=claude-haiku-4-5 \
     OPENAI_API_KEY=your_openai_key \
     OPENAI_MODEL=gpt-5-mini
   ```
4. Ensure frontend env has:
   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```
5. Restart the dev server. Open Hope AI Assistant and submit a request.

The edge function will try providers in `AI_PROVIDER_ORDER` and fall through when a provider hits quota, billing, rate-limit, or temporary availability errors. Non-retryable provider errors stop the chain so real prompt/configuration issues are visible immediately.

If you also apply `supabase/migrations/012_ai_chat_logs.sql`, recent AI prayer requests and responses become visible in `/admin` for authenticated admins only. The UI now warns users before submission, and `supabase/migrations/013_ai_chat_log_retention.sql` purges AI prayer logs after 30 days.

---

## Scripts

| Command       | Description                |
|---------------|----------------------------|
| `npm run dev` | Start dev server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest suite |
| `npm run e2e` | Build and run Playwright mobile smoke tests |
| `npm run build` | Production build in `dist/` |
| `npm run preview` | Preview production build |
| `npm run check` | Lint, test, and build |

---

## Stack

- **React 18** + **Vite** + **React Router**
- **Tailwind CSS** + **tailwindcss-animate**
- **lucide-react** for icons
- **Supabase** (optional) for Postgres config/events and email/password admin auth

---

## License

See [LICENSE](LICENSE).

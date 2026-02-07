# Hope City Hub

Mobile-first church hub for **Hope City Highlands** — connect, give, request prayer, and see upcoming events. Includes an optional AI assistant for personalized prayers (Gemini).

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
- **Hope AI Assistant** — Floating button opens a modal; users can share a need and get a short prayer + scripture (Gemini). Optional “Listen to Prayer” (TTS can be wired later).

---

## Configuration

Use the **Admin** page (`/admin`, or “Admin” in the footer) to edit:

- Announcement banner (on/off, text, link)
- Links (connect card, prayer, giving, baptism, dream team, directions, YouTube)
- Social links (Instagram, Facebook, YouTube)
- Upcoming events (add/edit/remove)

Without a database, changes are stored in the browser (localStorage) and protected by a PIN. With Supabase (see below), data is stored in the database and admin signs in with email/password.

Brand colors stay in **`BRAND_COLORS`** in `src/App.jsx` (teal `#004E59`, lime `#A3D600`).

---

## Database (optional)

To store config and events in a **Supabase** (Postgres) database:

1. Create a project at [supabase.com](https://supabase.com).
2. In the Supabase dashboard, open **SQL Editor** and run the contents of `supabase/migrations/001_initial.sql` (creates `site_config` and `events` tables and RLS policies).
3. In **Authentication → Providers**, ensure **Email** is enabled. (Optional: turn off “Confirm email” for simpler first-time admin setup.)
4. Create the **first admin** in the dashboard: **Authentication → Users → Add user** (enter email and password). That user can log in at `/admin`.
5. Copy `.env.example` to `.env` and set:
   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```
   (Find URL and anon key under **Settings → API**.)
6. Restart the dev server. Optionally deploy the **invite-admin** Edge Function so existing admins can invite others: install [Supabase CLI](https://supabase.com/docs/guides/cli), run `supabase link` and `supabase functions deploy invite-admin`. Then use **Add admin** in `/admin` to send invite emails.

Without these env vars, the app uses localStorage and PIN-based admin as before.

---

## AI prayers (optional)

1. Get a [Gemini API key](https://aistudio.google.com/apikey).
2. Copy `.env.example` to `.env` and set:
   ```bash
   VITE_GEMINI_API_KEY=your_key_here
   ```
3. Restart the dev server. The Hope AI Assistant will use Gemini to generate prayers and scripture.

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

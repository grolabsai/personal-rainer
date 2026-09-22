# Web apps

Two web front ends over the same Supabase project (`personal-rainer`). One repo, two deployments:
the URL chooses the interface; what a user may do is decided by their role (`profiles.role`) and the
database's row-level security, never by the URL.

| Folder | Who | Live (until a custom domain) | Becomes |
|---|---|---|---|
| `admin/` | Coaches and admins: exercise catalog explorer; workout programming next | https://exercise-explorer-mu.vercel.app (password) | `admin.<domain>` |
| `app/` | Athletes: assigned workouts and the program library, run a workout set by set, history | https://personal-trainer-app-lime.vercel.app | `app.<domain>` |

## app (athlete)

Vite + React + TypeScript + supabase-js. Sign-in by email and password (Supabase Auth); every new account
is an athlete. Hash routes keep it a static site.

```bash
cd web/app
cp .env.example .env.local   # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (the publishable key)
npm install
npm run dev                   # http://127.0.0.1:5173
npm run build
vercel deploy --prod          # project: personal-trainer-app (env vars are set in Vercel)
```

A workout in progress is kept in the browser (localStorage) until it is finished or discarded, so a
reload or a dropped connection loses nothing. Finishing writes `workout_sessions` + `session_sets` and
marks the assignment completed.

Tapping an exercise (from a workout or the player) opens **`#/exercise/:variant`**: the animation, the
equipment, a body map of the muscles worked, and alternatives in three levels — same exercise with
other equipment, a close variation, a similar exercise. The athlete's own equipment (`athlete_equipment`,
edited on that screen) narrows the list to what they can actually do, and **Do this instead** swaps the
exercise for this session only: the coach's programme is untouched and the set rows record what was
really done. How the alternatives are computed: [../docs/substitutions.md](../docs/substitutions.md).

The body map and the equipment icons live in `web/shared/`, so the app and the mock pages draw from one
copy. `web/app/mock/detail-live.html?v=0047` renders the exercise screen against the live catalog
without signing in (development only).

## admin (coach)

Static page, no build tool. `python3 web/admin/build.py` for local use (reads the dataset clone next to
this repo), `--web` for the password-protected deploy in `web/admin/dist/`.

## Data model for programming (migration 0005)

`programs` → `program_workouts` → `program_workout_items` (an exercise variation with sets, reps, weight,
rest), `assignments` (a workout for an athlete on a date), `workout_sessions` + `session_sets` (what was
done). `coach_athletes` links coaches to athletes. Template programs (`is_template`) are visible to every
signed-in user; three demo templates are seeded (migration 0006).

Making someone a coach is an admin action (SQL editor or service role):
`update profiles set role = 'coach' where id = '<user id>';`

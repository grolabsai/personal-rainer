# Web apps

Two web front ends over the same Supabase project (`personal-rainer`). One repo, two deployments:
the URL chooses the interface; what a user may do is decided by their role (`profiles.role`) and the
database's row-level security, never by the URL.

| Folder | Who | Live |
|---|---|---|
| `coach/` | Coaches: athletes, places, the template library and editor, assigning, AI drafting | https://admin.flowristics.com |
| `app/` | Athletes: assigned workouts, run one set by set, history, swaps | https://app.flowristics.com |
| `admin/` | The Exercise Explorer's source (page + build script); it is served by the coach app at `/explorer/`, behind a password | https://admin.flowristics.com/explorer/ |

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

The body map and the equipment icons live in `web/app/src/shared/`, so the app and the mock pages draw
from one copy (they must sit inside the app: Vercel only uploads the project's own directory). `web/app/mock/detail-live.html?v=0047` renders the exercise screen against the live catalog
without signing in (development only).

## coach (admin.flowristics.com)

Vite + React + TypeScript, same stack and tokens as the athlete app. Sign in with a normal account;
the `coach` role decides whether the tool opens at all.

```bash
cd web/coach
cp .env.example .env.local   # same Supabase URL and publishable key as the athlete app
npm install
npm run dev                  # http://127.0.0.1:5173
npm run build
vercel deploy --prod         # project: exercise-explorer (it owns admin.flowristics.com)
```

Screens: **Athletes** (link one by the email they signed up with), **Places** (a gym or a home, with
its kit in priority order and the heaviest weight it has), **Library** (templates → the workout
editor: blocks, items, per-set rows), **Assign** (template + athlete + place → resolved plan, with
every substitution and load flag listed), **Calendar** (who is following what, from when), and
**Draft with AI**.

The **Exercise Explorer** lives on inside this app at `/explorer/`, still behind the Basic-auth
password (`web/coach/middleware.js`, `EXPLORER_PASSWORD`) because it browses the whole dataset with
no sign-in and the media is © Gym visual. Rebuild it with `python3 web/admin/build.py --web`, which
writes into `web/coach/public/explorer/` (generated, git-ignored).

`web/coach/src/shared/` is a committed copy of `web/app/src/shared/` — Vercel uploads only the
project being deployed, so the files cannot be imported across apps. `npm run sync:shared` refreshes
them; edit the originals.

## Drafting a programme with AI

`supabase/functions/draft-program/index.ts` is an edge function: it checks the caller is a coach,
gives Claude the catalog as tools (`search_exercises`, `list_vocabulary`), and takes back a draft in
the template shape — exercises and required attributes, never a specific variation, so the draft is
portable and the location resolver still chooses the kit. Every draft is validated against the real
catalog before the coach sees it, and the model never writes to the database: saving goes through
`create_program_from_json()` under the coach's own permissions. Prompts and responses are kept in
`program_drafts`.

It needs one secret before it works:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref kdvzzasgmkqdbyielxmz
```

Without it the screen says so plainly (HTTP 503) instead of failing obscurely.

## Data model for programming

`programs` → `program_workouts` → `workout_blocks` → `program_workout_items` → `item_sets`: a block is an
ordered group sharing one execution rule (`straight` or `rounds`, which is how supersets and circuits are
expressed) and one purpose (warm-up … cool-down); a set is one bout of work followed by a rest, always an
explicit row. `locations` + `location_equipment` say where an athlete trains and with what, ranked.
A template names exercises, a prescription names variations: `assign_program()` forks the template,
resolves each item for the location, enrols the athlete and generates `assignments`. `workout_sessions` +
`session_sets` record what was actually done against each prescribed set.
Full write-up: [../docs/programming-model.md](../docs/programming-model.md).

`coach_athletes` links coaches to athletes. Public templates (`is_template` + `visibility = 'public'`) are
visible to every signed-in user; three demo templates are seeded (migration 0006).

Making someone a coach is an admin action (SQL editor or service role):
`update profiles set role = 'coach' where id = '<user id>';`

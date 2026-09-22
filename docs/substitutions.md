# Exercise substitution

An athlete opens a workout and cannot do what was programmed: the bench is taken, there is no
barbell at home, a shoulder hurts. The app answers with alternatives it can justify, in three
levels, computed from the catalog — nothing is hand-listed.

Applied in migrations `…0013` – `…0022`. Design of the data underneath: [exercise-unification.md](exercise-unification.md)
and [patterns-and-emphasis.md](patterns-and-emphasis.md).

## The three levels

| Level | Means | How it is found |
|---|---|---|
| **1. Same exercise, other equipment** | The same movement, a different kit | Same exercise, same attributes, same technique — only `variant_equipment` differs |
| **2. Close variation** | The same exercise with one detail changed | Same exercise, a different attribute (grip, angle, stance, laterality…) or a named technique |
| **3. Similar exercise** | A different exercise that trains the same thing | `exercise_alternatives`, precomputed: same movement pattern, or the same muscles, or the same body region |

Level 1 and 2 are answered live from `variant_fingerprint`, so editing an attribute shows up on the
next screen. Level 3 is the only all-pairs comparison, so it is a table, rebuilt on demand.

Each row carries **why**: `basis` is `equipment`, `attributes`, `pattern`, `muscle` or `region`, in
that order of strength. A level 3 row matched only on `region` says "works the same part of the
body", not "same pattern" — the app never claims more than the data supports.

## What the app gets back

```sql
select * from substitutes_for_variant('0025', array['bodyweight','dumbbell','bench'], 5);
```

- `names`, `equipment_ids`, `level`, `basis`, `score`
- `changes` — the attributes that differ, each with both values in English and Spanish
- `muscle_delta` — `added` / `dropped` / `promoted` / `demoted`, computed from `variant_muscles_resolved`
- `notes` — the emphasis rule's own sentence ("More triceps"), tagged with the muscle it is about

Passing the athlete's equipment (`athlete_equipment`, which they edit on the exercise screen)
restricts the list to what they can actually do. Passing `null` offers everything: an empty
equipment list means *unknown*, never *nothing*.

## Ranking

The closest substitute is the one that keeps most of the setup:

- levels 1 and 2 — fewer attribute differences first, then the smaller difference between the two
  **kits** (so a barbell bench press offers "Dumbbell + Bench" before a lever machine), then the
  more ordinary equipment;
- level 3 — the alternative exercise's score, then its plainest variation (no named technique,
  fewest attributes, most ordinary kit).

Rows that differ in nothing the athlete can see — same attributes, same technique, same kit — are
collapsed into one, because the dataset holds several records of the same thing.

## Coverage

1,282 live variations: **503** have a level 1, **1,124** a level 2, **1,276** a level 3.
**Six** have nothing, and they are honest gaps — each is the only exercise of its type for that body
region (the hands bike is the only upper-body cardio machine). The screen says so rather than
offering something unrelated.

## Rebuilding

Two tables are derived. After changing the dataset, the attributes, the muscle tree or the
emphasis rules:

```sql
select public.rebuild_variant_muscles_resolved();   -- the muscle ladder per variation
select public.rebuild_exercise_alternatives();      -- level 3 pairs
```

`variant_muscles_resolved` is `variant_muscles_best` (the ladder: stated → inferred → exercise →
generalised) written down, because comparing two variations reads it twice per candidate and a
detail screen was costing ~300 ms; it now costs ~9 ms. Its `redundant` column marks a row that says
the same thing less precisely ("chest" beside "upper chest") — the athlete's screens hide those, so
an incline press shows, and paints, the upper chest alone.

## In the app

`#/exercise/:variantId` (athlete app) shows the picture, the equipment, the body map, why the
muscles are what they are, and the three levels. Opened from a workout row or from the player with
`?item=<workout item>`, each option gets **Do this instead**: the swap is kept in the athlete's
device session and saved on each set row, so what they actually did is recorded and the coach's
programme is untouched.

`web/app/mock/detail-live.html?v=0047` renders that screen against the live catalog without a
sign-in — the quickest way to review a change to the rules or the ranking. Development only.

## Deliberately not here

- **No load conversion.** A substitute never suggests a weight; the same reps on a machine are not
  the same as on a barbell, and inventing a number would be worse than saying nothing.
- **No "easier / harder".** The catalog has no difficulty data that is worth trusting.
- **No silent dropping of muscles within an exercise.** If a record simply does not list the chest
  for a partial-range bench press, that is a gap in the dataset, not a claim — the app shows it only
  when the substitute is a *different* exercise.

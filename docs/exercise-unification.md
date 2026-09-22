# Exercise unification

Status: **applied** to the `personal-rainer` Supabase project on 2026-09-22.
Migration: `supabase/migrations/20260922000004_exercise_unification.sql`.
The pre-unification catalog is backed up in `supabase/backups/catalog-2026-09-21.json`
(re-create it at any time with `python3 tools/backup_catalog.py`).

## The model

A trainer thinks **muscle → exercise → what the athlete has**. The catalog now follows that order:

| Layer | Table | Example |
|---|---|---|
| Muscle | `muscles` (tree, see `docs/muscle-taxonomy.md`) | Biceps brachii |
| Exercise | `exercises` | Biceps curl |
| Variation | `exercise_variants` (one per dataset record) | Biceps curl · Neutral (hammer) grip · Seated — Dumbbell |
| What a variation is | `variant_attributes` → `variation_values` → `variation_dimensions` | grip = neutral, position = seated |
| What it needs | `variant_equipment` → `equipment` | dumbbell (+ bench, if the name says so) |
| What it works | `exercise_muscles` / `exercise_muscle_index` (per variation) | target biceps, secondary brachialis |

**The rule:** an exercise is one joint action with one primary muscle. Anything that only changes *how*
it is done (grip, bench angle, stance, one arm, equipment) is a variation. When the joint action changes,
it is a different exercise: wrist curl and reverse wrist curl, crunch and reverse crunch, calf raise and
tibialis raise.

**Stretches, cardio and mobility** get `exercises.type` = `stretch`, `cardio` or `mobility`. They are not
split into variations: each record is its own exercise (`is_canonical = false`).

Muscles stay on the **variation**, not the exercise, because a variation can shift the target. A close-grip
bench press is a bench press variation whose dataset target is the triceps. `exercise_muscle_summary`
rolls the muscles up per exercise.

## Current numbers

| | Count |
|---|---|
| Dataset records (variations) | 1,324 |
| Exercises | 221 |
| — canonical strength exercises with variations | 78 (covering 1,180 records) |
| — strength records not grouped yet (singletons) | 20 |
| — stretch / mobility / cardio | 64 / 25 / 35 |
| Variation dimensions / values | 7 / 47 |
| Equipment items | 34 |
| Duplicate records (same movement, another camera angle or model) | 42, in 38 groups |

Largest exercises: biceps curl (143 variations), bench press (79), row (78), triceps extension (63),
overhead press (51), push-up (49), squat (49), calf raise (43).

## Trainer queries

```sql
-- 1. Exercises that target a muscle (anything under it in the tree counts)
select exercise_id, variations from exercise_muscle_summary
where muscle_id = 'biceps-brachii' and role = 'target' order by variations desc;

-- 2. Equipment an exercise can be done with
select equipment_id, variations from exercise_equipment_options where exercise_id = 'biceps-curl';

-- 3. Variations the athlete can do with what they have (include 'bodyweight' — everyone has it)
select id, names->>'en', names->>'es' from available_variants('biceps-curl', array['band', 'bodyweight']);
```

`available_variants` only returns a variation when the athlete has **every** item it needs: an incline
dumbbell curl needs a dumbbell and a bench.

## How the grouping was made, and how to change it

1. `tools/unify/classify.py` reads the dataset and applies ordered rules (first match wins) to assign each
   record an exercise, attributes and equipment. It writes `tools/unify/proposal.json`.
2. Words the rules could not map stay on the variation as `variant_label` (named techniques such as
   "kipping" or "archer", and combos such as "lunge with biceps curl"), so no information is lost.
3. `tools/unify/names_es.json` holds Spanish names for exercises that have no canonical name.
4. `tools/unify/to_sql.py` turns the proposal into `supabase/seed/unification/01..04_*.sql`, which reload
   the unification data without touching the dataset columns.

To change a grouping: edit the rules, re-run both scripts, run the four SQL files in order. For a one-off
fix, update `exercise_variants.exercise_id` or `variant_attributes` directly and run
`select rebuild_variant_names();`.

## Known gaps (the review queue)

- **76 small groups of look-alike variations** parse to the same exercise, equipment and attributes, for
  example "incline curl" / "incline biceps curl", "Scott press" / "W-press". Most are synonyms and
  should become duplicates. `proposal.json` → `indistinct` lists them.
- **20 strength records are not grouped** (rope climb, tire flip, sledgehammer, boxing hook, ...).
- **The dataset's targets do not show emphasis shifts.** It lists "pectorals" for flat, incline and decline
  bench presses alike. Rules such as *incline → clavicular head* or *hammer grip → brachialis* need to be
  added as marked inferences (not yet built).
- **Variant labels are raw leftover words** and are English only in the generated Spanish names.
- The app's `WorkoutInfoScreen` still queries tables from the original project (`exercise_sets`,
  `exercise_instructions`) and the old exercise ids; it needs updating before offline mode is turned off.

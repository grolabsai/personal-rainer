# Movement patterns and muscle emphasis

Status: **drafted, awaiting a trainer's review.** Applied to the `personal-rainer` project
(migrations `…0010`, `…0011`, `…0012`). Everything here is marked as a draft in the data itself,
so QA can see what has been checked and what has not.

## The principle: most precise first, never a dead end

Muscle information is asked for in four places (exercise detail, swap suggestions, the body map,
and later the coach's programming screen). Each asks the same question: *what does this variation work?*
The answer comes from a ladder, and every row says which rung it came from:

| `detail_level` | Where it comes from | Example |
|---|---|---|
| `stated` | The dataset's own target / secondary muscles for that variation | Flat bench press → chest, shoulders, triceps |
| `inferred` | An emphasis rule triggered by the variation's attributes | Incline bench press → **upper chest** (more precise than the dataset) |
| `exercise` | The muscles of the exercise across its other variations | A variation with no muscle data of its own |
| `generalised` | The exercise's primary target | Last resort, so the answer is never empty |

`muscles_for_variant(variant_id)` returns one row per muscle: the strongest role (primary beats
secondary) supported by the most precise source. A Romanian deadlift states "hamstrings secondary",
the style rule infers "hamstrings primary", and the function answers **primary**.

Going the other way, `muscle_at_level(muscle, level)` generalises: a screen that can only draw muscle
groups turns `rectus-abdominis-lower` into `abdominals` and still shows something true.

## 1. Movement patterns (78 of 78 canonical exercises)

`exercises.movement_pattern` + `mechanics` (compound / isolation), with 23 patterns in
`movement_patterns`: horizontal and vertical push and pull, squat, hinge, lunge, knee and hip
isolation, calf, elbow flexion and extension, shoulder isolation, scapular, trunk flexion, rotation,
side bend and brace, carry, Olympic, throw, gymnastic hold, wrist and grip.

They exist for two jobs: **level 3 substitutes** ("a different exercise that trains the same pattern")
and **scoping the emphasis rules** (a close grip means triceps on a press, biceps on a pull).

Coverage: **1,139 of 1,282 variations** have a pattern through their exercise. The other 143 are
stretches, cardio, mobility and the 20 ungrouped records; they fall back to their type.

## 2. Emphasis rules (34 drafted)

Each rule says: *on this kind of exercise, this attribute changes which muscles do the work.*
It carries a one-sentence explanation in English and Spanish, shown to the athlete as-is.

- **Bench angle:** incline → upper chest becomes primary, more front shoulder; decline → lower chest,
  less front shoulder; decline on a crunch → more lower abs.
- **Grip width:** close → more triceps, less chest (push) / more biceps (pull); wide → more chest (push),
  more lats and less biceps (pull).
- **Grip:** underhand → more biceps on pulls; neutral (hammer) → brachialis on curls, more triceps and
  an easier shoulder on presses; overhand → forearms on curls, less biceps.
- **Style:** preacher (no shoulder help), concentration (isolates), overhead (triceps long head becomes
  primary), behind the neck (more side delt), front squat (more quads, trunk works), hack (more quads),
  Romanian and stiff-leg (hamstrings become primary), push press (legs help), twisting (obliques).
- **Stance:** sumo → adductors; narrow → quads.
- **Laterality:** one arm → obliques added; single leg → gluteus medius added.
- **Position:** standing → trunk stabilisation added; hanging → lower abs become primary on trunk flexion;
  prone incline → biceps stretched.

They reach **349 variations**. The rest simply use what the dataset states, which is the point of the ladder.

## How to review (this is the QA loop)

```sql
-- What an exercise is tagged as, and whether anyone has checked it
select id, names->>'en', movement_pattern, mechanics, pattern_source from exercises
where type = 'strength' and is_canonical order by movement_pattern;

-- Every rule, in reading order
select id, dimension_id || '=' || value as trigger, muscle_id, effect,
       applies_patterns, notes->>'en', confidence from emphasis_rules order by sort_order;

-- What a given variation ends up showing
select * from muscles_for_variant('0047');     -- incline barbell bench press

-- Accept a row after reviewing it
update exercises set pattern_source = 'reviewed' where id = 'bench-press';
update emphasis_rules set confidence = 'reviewed' where id = 'incline-upper-chest';
```

To change an opinion, edit the row: `update emphasis_rules set muscle_id = …, notes = …`, then
rebuild the two derived tables so the screens pick it up:

```sql
select public.rebuild_variant_muscles_resolved();   -- the ladder, per variation
select public.rebuild_exercise_alternatives();      -- level 3 substitutes
```

## What is deliberately not here

- **No weight or rep guidance** is inferred from these rules. A substitute never converts a load.
- **Rules never remove** what the dataset states; `less` rows are advice, not deletions, so a bad rule
  cannot hide real data.
- **Level 1 and 2 substitutes don't need any of this.** They come from the exercise plus its attributes.
  Only level 3 ("similar exercise") depends on the patterns above — see [substitutions.md](substitutions.md).

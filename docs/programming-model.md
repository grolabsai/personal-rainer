# The programming model

How a coach's intent becomes an athlete's workout: places and their kit, templates, prescriptions,
and what comes back. Applied in migrations `…0024` – `…0030`.
The entity diagram is [programming-model.svg](programming-model.svg).

## Vocabulary

These five words are used precisely everywhere in the code and the UI.

| Term | Definition | Table |
|---|---|---|
| **Exercise** | The movement, equipment-free. "Bench press." | `exercises` |
| **Variation** | One concrete way to do it: attributes + equipment. "Bench press · Incline — Dumbbell + Bench." | `exercise_variants` |
| **Set** | **One bout of work followed by a rest.** The atom: reps *or* seconds, a load, a side, and the rest after it. | `item_sets` |
| **Item** | One exercise's slot inside a block, holding its ordered sets. | `program_workout_items` |
| **Block** | An ordered group of items sharing **one execution rule** and **one purpose**. | `workout_blocks` |
| **Round** | One pass through all the items of a `rounds` block. | `session_sets.round_number` |
| **Workout** → **Program** | Ordered blocks; ordered workouts. | `program_workouts`, `programs` |

A block carries two independent fields, and keeping them apart is what keeps the model small:

- `purpose` — `warmup`, `main`, `accessory`, `finisher`, `cooldown`. Editorial: headings and colour,
  and whether the block counts as training volume.
- `mode` — `straight` (all the sets of item 1, then item 2) or `rounds` (one set of each item, then
  repeat). Mechanical: the only thing the player behaves differently for.

A **superset** is a rounds block with two items; a **circuit** is one with three or more. Same
machinery, different word. So a warm-up can be a circuit and a finisher can be straight sets.

## Four rests, four owners

| Rest | Lives on |
|---|---|
| After a set | `item_sets.rest_seconds` |
| Between items inside a round | `workout_blocks.rest_between_items_s` |
| Between rounds | `workout_blocks.rest_between_rounds_s` |
| After the whole block | `workout_blocks.rest_after_s` |

**Rest is never a block.** A rest block would be a block with no items, and every reader — the
player, the resolver, the volume calculation — would have to special-case emptiness for something
that is a property of a boundary.

## Sets are always explicit rows

A uniform 3×12 writes three rows. One representation means a ramp, a warm-up set, a back-off set,
per-set loads, a drop set (`rest_seconds = 0`) and an AMRAP finisher need no special case.

Two columns carry what a variation alone cannot say:

- **`variant_id`** — a per-set override. Push-ups at shoulder width, then wide, then diamond: one
  item, one exercise, three rows.
- **`side` + `other_side`** — laterality is prescribed, not just catalogued:

| Prescription | `side` | `other_side` |
|---|---|---|
| Curl both hands | `both` | — |
| 10 one side, then 10 the other | `each` | `rest` |
| Alternate single reps, the idle arm holds | `alternating` | `hold` |
| Hold one while the other does 10, then switch | `each` | `hold` |

`reps_per_side` says whether the number is per side or in total. The default comes from the
variation's own `laterality` attribute.

## Where the columns stop and JSON begins

> **If the player has to count it, or the coach has to total it, it is a column.
> If only a human reads it, it is text.**

Columns: order, mode, rounds, work and rest seconds, reps range, duration, distance, `load_kg`,
`load_percent_1rm`, `rpe`, `tempo`, set `kind`, `side`, per-set variation.

`params jsonb` (on the block and on the set): protocols that are a *rule about* the sets rather than
sets themselves — cluster sets, rest-pause, ladders, an EMOM minute map, a complex, an AMRAP score,
a buy-in. The ten EMOM rounds are still ten real rows; only "every minute on the minute" is JSON.

Deliberately **not** built, because each makes the ordinary 3×12 screen harder: nested blocks,
auto-progression rules, and loads expressed as formulas over past sessions. Any of them can arrive
later as a layer that *writes* set rows.

## Places and their kit

```
locations            private | public · gym/home/park · owner, or forked from a public one
location_equipment   rank (0 = reach for it first) · max_load_kg · quantity
user_locations       my places, and which is the default
```

Read access is `visibility = 'public' or owner_id = auth.uid() or is_coach_of(owner_id)`: a coach
maintains an athlete's home setup with them, and nobody sees a stranger's. Adopting a public place
**forks it** (`fork_location`), so an edit by someone else never moves the ground under a plan.

`rank` is the priority: when two variations are equally ordinary, the kit you rated higher wins.

## Template → prescription

The same five tables in two states, so nothing is written twice:

| | Template | Prescription (plan) |
|---|---|---|
| `programs.is_template` | true | false |
| Owner | coach, or the public library | coach **and** `athlete_id` |
| Location | none | `location_id`, bound |
| Items say | `exercise_id` + required attributes | a concrete `variant_id` |
| Editable | yes, it is a library | frozen once assigned |
| Links back | — | `forked_from`, `source_item_id` |

`assign_program(template, athlete, location, start)` does the whole thing: fork the program, resolve
every item for the location, create the enrollment, generate the first weeks. The coach can then
adjust the copy; editing the template afterwards never reaches a prescription already handed over.

Saving a plan back to the library **un-resolves** it: `copy_workout(..., p_unresolve => true)` drops
the chosen variations unless `variant_locked`, so the template is portable again instead of
demanding the same lever machine forever.

## Resolution

`resolve_workout_for_location(workout, location)` picks the variation each item becomes:

1. candidates are variations of the item's exercise whose equipment is a subset of the location's
   kit and whose attributes satisfy the item's required ones;
2. ordered by **plainness first** (fewest extra attributes, no named technique), then the best
   equipment `rank`, then the smallest kit;
3. if nothing fits, the substitution engine answers (level 1 → 2 → 3) and the item records
   `substitution_level` and `substitution_note`;
4. if even that is empty, the item keeps what was meant and says `status: unavailable`.

Plainness must come before rank: ranking the cheapest kit first chose a *one-arm* barbell bench
press over the plain one, because a bar alone outranks bar + bench. A coach who wrote "bench press"
means the ordinary bench press; your equipment ranking decides between equally ordinary options, it
does not get to pick a different exercise.

A prescribed load heavier than the place owns is **flagged, never rewritten**:
`substitution_note.load_warning = {needs_kg, available_kg}`. Converting a 100 kg squat into a
bodyweight squat is a conversation, not an automatic substitution.

## Scheduling

| `schedule_mode` | Means | Carries the date |
|---|---|---|
| `weekly` | A cycle that rolls forward; a 2-week A/B cycle is `cycle_weeks = 2` | `day_of_week` + `week_in_cycle` |
| `dated` | Specific workouts on specific days | `scheduled_for` |
| `sequence` | Ordered but undated | `position` |

`program_enrollments` is an athlete following a plan from a date, at a place.
`expand_enrollment(enrollment, through)` writes the assignments up to a horizon (four weeks by
default) and is safe to run again — a unique index on (enrollment, workout, date), `nulls not
distinct`, makes a second run a no-op, so any screen can just call it.

Whatever the mode, **`assignments` stays the single answer to "what do I do today"**, which is why
none of this reached the athlete app's home screen.

Two rules keep a rolling programme sane: an occurrence that has not been started can be regenerated,
while anything with a session against it is frozen; and pausing (`status = 'paused'`) stops
generation without deleting what exists.

## What comes back

`session_sets` points at the set it answers, and carries what was actually done:

```
prescribed_set_id → item_sets      variant_id = what was performed (a swap shows up here)
round_number                       reps · weight_kg · rpe
status: done | partial | skipped | not_logged        deviation_reason: equipment | load | pain | time | preference
```

`track_mode` (on the program, copied to the session) decides how much the athlete logs: `full` is
reps and weight per set, `completion` is a tick per set, `none` records only the session. The
prescription is identical in all three, so turning tracking on later loses no history.

## The sample

`Upper A — sample` (tagged `sample`) exercises every feature in one workout: a warm-up circuit of
two rounds, a bench-press ramp with a back-off set, a superset whose push-up grip changes each round,
a curl item holding all four laterality cases, an EMOM finisher, and a cool-down — 6 blocks, 12
items, 38 sets. It is assigned twice, to a Gym and to a Home location, which resolves to:

| | Gym | Home |
|---|---|---|
| Bench press (flat) | Barbell + Bench | Resistance band, seated |
| Row | Kettlebell *(the only row with no named technique)* | Resistance band |
| Push-up | Bodyweight | Bodyweight |
| Biceps curl | Barbell | Dumbbell, **flagged: 14 kg prescribed, 12 kg available** |
| Jump rope | Jump rope | Burpee *(level 3 substitute)* |
| Kettlebell swing | Kettlebell | Pull-through with a band *(level 3)* |
| Scapular pull-up (`variant_locked`) | unchanged | unchanged |

Rebuild it, or a variation of it, with the SQL in the migration history; the resolver is
deterministic, so the same template and the same kit always give the same plan.

## The visual language of a name

A generated name — "Bench press · Incline · Close grip — Barbell + Bench" — is four kinds of fact in
one string. Both apps render it from its parts instead, and each kind keeps its colour everywhere
(`web/app/src/shared/variation-language.css`, synced into the coach app):

| Part | Colour | Token |
|---|---|---|
| The movement | plain, strongest weight | — |
| Equipment | teal | `--gl-probe-category` |
| Bench angle | blue | `--gl-probe-site-wide` |
| Body position | green | `--gl-success` |
| Grip | purple | `--gl-probe-homepage` |
| Grip width | pink | `--gl-probe-search` |
| Arms / legs | gold | `--gl-probe-pdp` |
| Stance | orange | `--gl-warning` |
| Style (named techniques) | grey | `--gl-text-tertiary` |

Every part carries its icon, and within a grid of variations the parts they share are dimmed while
the ones that differ keep their colour — so "these four are the same exercise, only the equipment
changes" is visible without reading. The list above each grid names the families that differ.

No new colours were invented: these are the GroLabs probe tokens, which exist for exactly this kind
of categorical coding.

# Muscle taxonomy and schema — proposal

Status: **applied** to the `personal-rainer` Supabase project on 2026-09-22 (migrations in
`supabase/migrations/`, import in `supabase/seed/import_exercises.sql`). Open decisions 1 and 2
use the safe default for now: `shoulders` → Shoulders region, `abs` → Abdominals group.
Changing one means updating a row in `muscle_aliases` and running `select rebuild_exercise_muscle_index();`.
Names are in English and Spanish only.

Source data: `exercises-dataset/data/exercises.json` (1,324 exercises). Every count below was taken from that file.

## The problem

The dataset stores muscles as free text in three fields, at mixed levels of detail:

| Field | Distinct terms | Role |
|---|---|---|
| `target` | 19 | The primary muscle. Each target belongs to exactly one `body_part`. |
| `muscle_group` | 29 | The main synergist. Always equal to `secondary_muscles[0]`. |
| `secondary_muscles` | 40 | Ordered list of other muscles involved (1–6 per exercise). |

Across the three fields there are **50 distinct terms**, and they are not all the same kind of thing:

| Kind of term | Examples |
|---|---|
| Region | `shoulders`, `back`, `chest` |
| Muscle group | `quadriceps`, `hamstrings`, `deltoids`, `pectorals`, `rotator cuff` |
| Single muscle | `soleus`, `brachialis`, `serratus anterior`, `sternocleidomastoid` |
| Part of a muscle | `rear deltoids`, `upper chest`, `lower abs` |
| Functional set (crosses anatomy) | `core`, `hip flexors`, `abductors`, `upper back`, `grip muscles` |
| Synonym of another term | `traps`/`trapezius`, `lats`/`latissimus dorsi`, `delts`/`deltoids`, `abs`/`abdominals`, `quads`/`quadriceps`, `groin`/`inner thighs`/`adductors` |
| Not a muscle | `ankles`, `wrists`, `feet`, `hands`, `cardiovascular system` |

A flat lookup table can't hold that. The terms need an anatomical tree, a place for functional sets, and a mapping from each raw term to the right node.

## The model: four parts

1. **Anatomy tree** (`muscles`). One table that refers to itself through `parent_id`. It has four levels: region → group → muscle → head. Every node has exactly one parent. This is what the app filters on.
2. **Functional sets** (`muscle_sets` + `muscle_set_members`). These are named groupings that cross the tree, such as Core, Hip flexors, Grip and Upper back. A muscle can belong to several sets. Rectus femoris, for example, is a quadriceps muscle and also a hip flexor.
3. **Aliases** (`muscle_aliases`). These map every raw dataset term to exactly one node or one set, with a confidence level. The import reads this table and never guesses.
4. **Exercise links**, in two layers:
   - `exercise_muscles` holds the facts: one row per term the dataset gives, with its role and position.
   - `exercise_muscle_index` is the denormalized copy: the same links expanded to every ancestor (and to set members), so a filter on any node is a single indexed lookup.

The dataset's `body_part` (`upper arms`, `lower legs`…) is kept as its own lookup table. It classifies **exercises**, not anatomy, and the app already uses it for browsing.

## Schema

```sql
-- 1. Anatomy tree ---------------------------------------------------------
create type muscle_level as enum ('region', 'group', 'muscle', 'head');
create type muscle_kind  as enum ('muscle', 'joint', 'area', 'system');

create table muscles (
  id          text primary key,                 -- slug, e.g. 'posterior-deltoid'
  name        text not null,                    -- 'Posterior deltoid'
  common_name text,                             -- 'Rear delts'
  level       muscle_level not null,
  kind        muscle_kind not null default 'muscle',
  parent_id   text references muscles(id),      -- null only for regions and non-muscle nodes
  sort_order  smallint not null default 0,
  names       jsonb not null default '{}'       -- translations: {"es": "Deltoides posterior", ...}
);
create index on muscles(parent_id);

-- Closure table: every (ancestor, descendant) pair, including self at depth 0.
-- Rebuilt by a trigger or by the seed script; it makes "everything under X" a join, not a recursive query.
create table muscle_paths (
  ancestor_id   text references muscles(id) on delete cascade,
  descendant_id text references muscles(id) on delete cascade,
  depth         smallint not null,
  primary key (ancestor_id, descendant_id)
);

-- 2. Functional sets -------------------------------------------------------
create table muscle_sets (
  id    text primary key,                       -- 'core', 'hip-flexors', 'grip', 'upper-back'
  name  text not null,
  names jsonb not null default '{}'
);
create table muscle_set_members (
  set_id    text references muscle_sets(id) on delete cascade,
  muscle_id text references muscles(id) on delete cascade,
  primary key (set_id, muscle_id)
);

-- 3. Raw-term aliases ------------------------------------------------------
create type alias_confidence as enum ('exact', 'synonym', 'broader', 'interpreted');

create table muscle_aliases (
  term       text primary key,                  -- raw dataset string, e.g. 'traps'
  muscle_id  text references muscles(id),
  set_id     text references muscle_sets(id),
  confidence alias_confidence not null,
  note       text,
  check ((muscle_id is null) <> (set_id is null))  -- exactly one target
);

-- 4a. Exercise links: the facts, as the dataset states them ----------------
create type muscle_role as enum ('target', 'secondary');

create table exercise_muscles (
  exercise_id text references exercises(id) on delete cascade,
  role        muscle_role not null,
  rank        smallint not null,               -- 0 for target; 1..n = position in secondary_muscles (1 = dataset's muscle_group)
  source_term text not null references muscle_aliases(term),
  primary key (exercise_id, role, rank)
);

-- 4b. Exercise links: denormalized for filtering ---------------------------
create type index_via as enum ('direct', 'rollup', 'set');

create table exercise_muscle_index (
  exercise_id text references exercises(id) on delete cascade,
  muscle_id   text references muscles(id) on delete cascade,
  role        muscle_role not null,             -- best role through which this muscle is reached
  via         index_via not null,               -- how the link was derived
  distance    smallint not null,                -- 0 = tagged directly; n = n levels up the tree
  primary key (exercise_id, muscle_id)
);
create index on exercise_muscle_index (muscle_id, role, via);
```

`exercises` drops its three muscle text columns in favour of these tables. `target` and `muscle_group` can be kept as generated columns if the app's current code still reads them.

### How the index is filled

For each row in `exercise_muscles`, resolve `source_term` through `muscle_aliases`, then:

| Alias points to | Rows written to `exercise_muscle_index` |
|---|---|
| A muscle node | That node (`via = direct`, distance 0), plus every ancestor from `muscle_paths` (`via = rollup`, distance = depth). |
| A set | Each set member (`via = set`), plus their ancestors (`via = rollup`). |

When the same muscle is reached twice, keep the strongest row: `target` over `secondary`, `direct` over `set` over `rollup`, and the smaller distance.

**It only expands upward, never downward.** An exercise tagged `posterior-deltoid` also appears under Deltoids and Shoulders. An exercise tagged with the broad region `shoulders` does **not** appear under Posterior deltoid, because the data doesn't say that.

### Filtering

```sql
-- Every exercise where the posterior deltoid is the target or a secondary muscle
select exercise_id from exercise_muscle_index where muscle_id = 'posterior-deltoid';

-- Exercises that directly target the quadriceps group or anything inside it
select exercise_id from exercise_muscle_index
where muscle_id = 'quadriceps' and role = 'target' and via in ('direct', 'rollup');
```

## Proposed anatomy tree

Regions are anatomical, which differs from the dataset's `body_part`. Nodes in *italics* have no term in the dataset today. They're there so the tree is complete, and the explorer and app can show them with a count of 0.

```
Neck (region)
  Neck muscles (group) ── sternocleidomastoid, levator scapulae, *splenius*
Shoulders (region)
  Deltoids (group) ────── anterior deltoid, lateral deltoid, posterior deltoid
  Rotator cuff (group) ── *supraspinatus, infraspinatus, teres minor, subscapularis*
Chest (region)
  Pectorals (group) ───── pectoralis major (clavicular head, sternal head), *pectoralis minor*
  Serratus anterior (muscle)
Back (region)
  Latissimus dorsi (muscle), *teres major* (muscle)
  Trapezius (muscle) ──── upper, middle, lower (heads)
  Rhomboids (muscle)
  Erector spinae (group)
Arms (region)
  Upper arm, front (group) ── biceps brachii, brachialis
  Upper arm, back (group) ─── triceps brachii (long, lateral, medial heads)
  Forearm (group) ────────── forearm flexors, forearm extensors, *brachioradialis*
Core (region)
  Abdominals (group) ──── rectus abdominis, *transversus abdominis*, Obliques (group) ── external oblique, internal oblique
Hips (region)
  Glutes (group) ──────── gluteus maximus, gluteus medius, gluteus minimus
  Adductors (group) ───── *adductor magnus, adductor longus, adductor brevis, gracilis*
  Hip flexor muscles ──── *iliopsoas, tensor fasciae latae, sartorius*
Legs (region)
  Quadriceps (group) ──── *rectus femoris, vastus lateralis, vastus medialis, vastus intermedius*
  Hamstrings (group) ──── *biceps femoris, semitendinosus, semimembranosus*
  Calves (group) ──────── *gastrocnemius*, soleus
  Shin (group) ────────── tibialis anterior

Non-muscle nodes (kind ≠ muscle, no parent): ankle (joint), wrist (joint), hand (area), foot (area), cardiovascular system (system)
```

**Functional sets:**

| Set | Members |
|---|---|
| Core | rectus abdominis, obliques, transversus abdominis, erector spinae |
| Hip flexors | iliopsoas, rectus femoris, tensor fasciae latae, sartorius |
| Hip abductors | gluteus medius, gluteus minimus, tensor fasciae latae |
| Upper back | trapezius (middle, lower), rhomboids, posterior deltoid, teres major |
| Grip | forearm flexors, hand |
| Ankle stabilizers | tibialis anterior, *peroneals*, ankle |

## How all 50 dataset terms map

`#` = the number of times the term is used across all three fields.

| Term | # | Maps to | Level | Confidence | Note |
|---|---|---|---|---|---|
| shoulders | 591 | shoulders | region | broader | Usually means the deltoids in `secondary_muscles`, but the data doesn't say which head. |
| forearms | 479 | forearm | group | exact | |
| triceps | 570 | triceps-brachii | muscle | exact | |
| biceps | 509 | biceps-brachii | muscle | exact | |
| hamstrings | 444 | hamstrings | group | exact | |
| glutes | 351 | glutes | group | exact | |
| quadriceps | 271 | quadriceps | group | exact | |
| calves | 217 | calves | group | exact | |
| abs | 169 | abdominals | group | synonym | Could be read as rectus abdominis only; mapped to the group to be safe. |
| pectorals | 158 | pectorals | group | exact | |
| hip flexors | 143 | *set* hip-flexors | set | exact | |
| delts | 143 | deltoids | group | synonym | |
| obliques | 139 | obliques | group | exact | A group inside Abdominals holding the external and internal oblique. |
| upper back | 126 | *set* upper-back | set | exact | Target of 88 exercises. |
| core | 101 | *set* core | set | exact | |
| chest | 144 | chest | region | broader | |
| trapezius | 83 | trapezius | muscle | exact | |
| lats | 83 | latissimus-dorsi | muscle | synonym | |
| lower back | 77 | erector-spinae | group | interpreted | "Lower back" is a region; erector spinae is the muscle trained. |
| traps | 80 | trapezius | muscle | synonym | |
| rhomboids | 56 | rhomboids | muscle | exact | |
| deltoids | 52 | deltoids | group | exact | |
| quads | 44 | quadriceps | group | synonym | |
| cardiovascular system | 29 | cardiovascular-system | system | exact | Target of all cardio exercises. |
| ankles | 22 | ankle | joint | exact | |
| rear deltoids | 20 | posterior-deltoid | muscle | synonym | |
| spine | 19 | erector-spinae | group | interpreted | In this dataset family, "spine" targets are back extensions. |
| brachialis | 14 | brachialis | muscle | exact | |
| back | 11 | back | region | broader | |
| rotator cuff | 10 | rotator-cuff | group | exact | |
| soleus | 8 | soleus | muscle | exact | |
| feet | 8 | foot | area | exact | |
| latissimus dorsi | 7 | latissimus-dorsi | muscle | exact | |
| adductors | 6 | adductors | group | exact | |
| abductors | 5 | *set* hip-abductors | set | exact | |
| serratus anterior | 5 | serratus-anterior | muscle | exact | |
| ankle stabilizers | 5 | *set* ankle-stabilizers | set | interpreted | |
| abdominals | 4 | abdominals | group | exact | |
| wrists | 4 | wrist | joint | exact | |
| wrist flexors | 4 | forearm-flexors | muscle | synonym | |
| wrist extensors | 3 | forearm-extensors | muscle | synonym | |
| upper chest | 3 | pectoralis-major-clavicular | head | synonym | |
| hands | 3 | hand | area | exact | |
| levator scapulae | 2 | levator-scapulae | muscle | exact | |
| sternocleidomastoid | 2 | sternocleidomastoid | muscle | exact | |
| grip muscles | 1 | *set* grip | set | exact | |
| groin | 1 | adductors | group | synonym | |
| inner thighs | 1 | adductors | group | synonym | |
| lower abs | 1 | rectus-abdominis | muscle | interpreted | "Lower" isn't a separate muscle. |
| shins | 1 | tibialis-anterior | muscle | interpreted | |


## Open decisions

1. **What `shoulders` means (591 uses, the most common term).** Map it to the Shoulders *region* (safe, but it won't show up under a filter on a specific deltoid head), or to the *Deltoids group* (closer to what the data means, but a guess)?
2. **Whether `abs` means Abdominals (group) or rectus abdominis (muscle).** 169 exercises target `abs`. Mapping them to rectus abdominis is more specific and lets a Rectus abdominis filter find them. Mapping them to the Abdominals group is safer, but then only a filter on Abdominals or Core finds them.
3. **Anatomical regions, or keep the dataset's `body_part` as the top level?** This proposal keeps both: `body_part` classifies exercises, and regions organise muscles.
4. **Where translations live.** `muscles.names` holds names in all 16 app locales. That's about 90 nodes × 16 languages to write once. It can be machine-translated and reviewed later.

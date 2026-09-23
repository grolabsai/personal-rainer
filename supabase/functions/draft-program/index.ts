// Draft a programme from a sentence the coach types.
//
// The model works at the level a template works at: exercises and required attributes, never a
// specific variation — resolution against the athlete's location happens later, which is what makes
// a draft portable. It is given the catalog as tools rather than a dump, so it composes with real
// exercise ids instead of inventing "Incline Chest Blaster".
//
// Nothing here writes to the database except the audit row: the draft goes back to the coach, who
// edits it and saves it through the ordinary tables. The API key lives in a secret, which is why
// this runs on the server at all.
//
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase functions deploy draft-program
import { createClient } from 'jsr:@supabase/supabase-js@2';

const MODEL = Deno.env.get('DRAFT_MODEL') ?? 'claude-sonnet-5';
const MAX_ROUNDS = 8;               // tool calls before we stop and say so
const MAX_TOKENS = 8000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const SYSTEM = `You draft strength and conditioning programmes for a coach, who reviews and edits
everything you produce before any athlete sees it.

Work only with exercises from the catalog: call search_exercises and use the ids it returns. Never
invent an id or a name. Prefer canonical exercises.

Say WHAT to train, not WITH WHAT. Give an exercise_id and, only when it matters, required attributes
(bench_angle=incline, grip_width=close). The app chooses the actual variation from what the
athlete's gym or home has, so naming equipment would only get in the way.

Structure:
- A workout is blocks. A block has a purpose (warmup, main, accessory, finisher, cooldown) and a
  mode: "straight" (all the sets of one exercise, then the next) or "rounds" (one set of each
  exercise, repeated — a superset with two exercises, a circuit with more; set "rounds").
- Every set is an explicit row. A ramp is four rows with different reps and loads, not a note.
- rest_seconds belongs to the set. In a rounds block use rest_between_items_s and
  rest_between_rounds_s on the block instead.
- side: "both" by default; "each" (one side at a time), "alternating", "left", "right".
  other_side: "rest", "hold" or "work" when one limb does something while the other works.
- Include a warm-up block and a cool-down block unless the coach says otherwise.

Loads: give load_kg only if the coach gave you numbers or a clear level to work from; otherwise
leave it out, or use rpe. Never invent someone's one-rep max.

Stay within programming. No medical, rehabilitation or nutrition advice: if the request needs it,
say so in the description and leave that part to the coach.

When the plan is complete, call submit_program exactly once with the whole thing.`;

const TOOLS = [
  {
    name: 'search_exercises',
    description: 'Search the exercise catalog. Returns ids to use in the programme.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words in the exercise name, e.g. "row", "squat"' },
        type: { type: 'string', enum: ['strength', 'stretch', 'mobility', 'cardio'] },
        pattern: { type: 'string', description: 'Movement pattern id, e.g. push-horizontal, hinge, squat' },
        muscle: { type: 'string', description: 'Muscle or group id, e.g. pectorals, hamstrings, abdominals' },
        limit: { type: 'integer' },
      },
    },
  },
  {
    name: 'list_vocabulary',
    description: 'The movement patterns, and the variation dimensions and values usable as required attributes.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'submit_program',
    description: 'Submit the finished draft.',
    input_schema: {
      type: 'object',
      required: ['names', 'workouts'],
      properties: {
        names: { type: 'object', properties: { en: { type: 'string' }, es: { type: 'string' } }, required: ['en'] },
        descriptions: { type: 'object', properties: { en: { type: 'string' }, es: { type: 'string' } } },
        schedule_mode: { type: 'string', enum: ['weekly', 'dated', 'sequence'] },
        cycle_weeks: { type: 'integer', minimum: 1, maximum: 12 },
        weeks: { type: 'integer', minimum: 1, maximum: 52 },
        days_per_week: { type: 'integer', minimum: 1, maximum: 14 },
        goal: { type: 'string' },
        level: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
        track_mode: { type: 'string', enum: ['full', 'completion', 'none'] },
        tags: { type: 'array', items: { type: 'string' } },
        workouts: {
          type: 'array', minItems: 1, maxItems: 14,
          items: {
            type: 'object', required: ['names', 'blocks'],
            properties: {
              names: { type: 'object', properties: { en: { type: 'string' }, es: { type: 'string' } }, required: ['en'] },
              day_of_week: { type: 'integer', minimum: 1, maximum: 7, description: '1 = Monday' },
              week_in_cycle: { type: 'integer', minimum: 1, maximum: 12 },
              blocks: {
                type: 'array', minItems: 1, maxItems: 10,
                items: {
                  type: 'object', required: ['purpose', 'mode', 'items'],
                  properties: {
                    purpose: { type: 'string', enum: ['warmup', 'main', 'accessory', 'finisher', 'cooldown'] },
                    mode: { type: 'string', enum: ['straight', 'rounds'] },
                    rounds: { type: 'integer', minimum: 1, maximum: 30 },
                    names: { type: 'object', properties: { en: { type: 'string' }, es: { type: 'string' } } },
                    rest_between_items_s: { type: 'integer', minimum: 0, maximum: 900 },
                    rest_between_rounds_s: { type: 'integer', minimum: 0, maximum: 900 },
                    rest_after_s: { type: 'integer', minimum: 0, maximum: 900 },
                    items: {
                      type: 'array', minItems: 1, maxItems: 12,
                      items: {
                        type: 'object', required: ['exercise_id', 'sets'],
                        properties: {
                          exercise_id: { type: 'string' },
                          attributes: {
                            type: 'array',
                            items: {
                              type: 'object', required: ['dimension_id', 'value'],
                              properties: { dimension_id: { type: 'string' }, value: { type: 'string' } },
                            },
                          },
                          notes: { type: 'object', properties: { en: { type: 'string' }, es: { type: 'string' } } },
                          sets: {
                            type: 'array', minItems: 1, maxItems: 30,
                            items: {
                              type: 'object',
                              properties: {
                                kind: { type: 'string', enum: ['warmup', 'working', 'backoff', 'drop', 'amrap'] },
                                reps_min: { type: 'integer', minimum: 1, maximum: 200 },
                                reps_max: { type: 'integer', minimum: 1, maximum: 200 },
                                duration_seconds: { type: 'integer', minimum: 1, maximum: 3600 },
                                reps_per_side: { type: 'boolean' },
                                load_kg: { type: 'number', minimum: 0, maximum: 500 },
                                load_percent_1rm: { type: 'integer', minimum: 1, maximum: 150 },
                                rpe: { type: 'number', minimum: 1, maximum: 10 },
                                tempo: { type: 'string' },
                                rest_seconds: { type: 'integer', minimum: 0, maximum: 900 },
                                side: { type: 'string', enum: ['both', 'left', 'right', 'each', 'alternating'] },
                                other_side: { type: 'string', enum: ['rest', 'hold', 'work'] },
                                notes: { type: 'object', properties: { en: { type: 'string' }, es: { type: 'string' } } },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
];

type Supa = ReturnType<typeof createClient>;

async function runTool(supabase: Supa, name: string, input: Record<string, unknown>) {
  if (name === 'list_vocabulary') {
    const [patterns, dims, values] = await Promise.all([
      supabase.from('movement_patterns').select('id, names->>en').order('sort_order'),
      supabase.from('variation_dimensions').select('id, names->>en').order('sort_order'),
      supabase.from('variation_values').select('dimension_id, value, names->>en').order('sort_order'),
    ]);
    return { patterns: patterns.data, dimensions: dims.data, values: values.data };
  }
  if (name === 'search_exercises') {
    let q = supabase.from('exercises')
      .select('id, names->>en, type, movement_pattern, mechanics, primary_muscle_id')
      .order('is_canonical', { ascending: false })
      .limit(Math.min(Number(input.limit) || 25, 40));
    if (input.type) q = q.eq('type', input.type);
    if (input.pattern) q = q.eq('movement_pattern', input.pattern);
    if (input.muscle) q = q.eq('primary_muscle_id', input.muscle);
    if (input.query) q = q.or(`names->>en.ilike.%${input.query}%,id.ilike.%${input.query}%`);
    const { data, error } = await q;
    return error ? { error: error.message } : { exercises: data };
  }
  return { error: `unknown tool ${name}` };
}

// Belt and braces: the JSON schema constrains shape, this checks it against the actual catalog.
async function validate(supabase: Supa, draft: Record<string, unknown>) {
  const problems: string[] = [];
  const ids = new Set<string>();
  const attrs: { dimension_id: string; value: string }[] = [];
  for (const w of (draft.workouts as Record<string, unknown>[]) ?? []) {
    for (const b of (w.blocks as Record<string, unknown>[]) ?? []) {
      if (b.mode === 'rounds' && !b.rounds) problems.push(`block "${b.purpose}" is rounds but has no rounds count`);
      for (const i of (b.items as Record<string, unknown>[]) ?? []) {
        ids.add(String(i.exercise_id));
        for (const a of (i.attributes as { dimension_id: string; value: string }[]) ?? []) attrs.push(a);
        const sets = (i.sets as Record<string, unknown>[]) ?? [];
        if (!sets.length) problems.push(`${i.exercise_id} has no sets`);
        for (const s of sets) {
          if (s.reps_min == null && s.duration_seconds == null && s.kind !== 'amrap') {
            problems.push(`a set of ${i.exercise_id} has neither reps nor seconds`);
          }
          if (s.other_side && (!s.side || s.side === 'both')) {
            problems.push(`a set of ${i.exercise_id} says what the other side does but side is "both"`);
          }
        }
      }
    }
  }
  if (ids.size) {
    const { data } = await supabase.from('exercises').select('id').in('id', [...ids]);
    const known = new Set((data ?? []).map((r: { id: string }) => r.id));
    for (const id of ids) if (!known.has(id)) problems.push(`no exercise with id "${id}"`);
  }
  if (attrs.length) {
    const { data } = await supabase.from('variation_values').select('dimension_id, value');
    const known = new Set((data ?? []).map((r: { dimension_id: string; value: string }) => `${r.dimension_id}=${r.value}`));
    for (const a of attrs) {
      if (!known.has(`${a.dimension_id}=${a.value}`)) problems.push(`no attribute "${a.dimension_id} = ${a.value}"`);
    }
  }
  return problems;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const authHeader = req.headers.get('Authorization') ?? '';
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: 'Sign in first.' }, 401);
  const { data: role } = await supabase.rpc('app_role');
  if (role !== 'coach' && role !== 'admin') return json({ error: 'Coaches only.' }, 403);

  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json({ error: 'Drafting is not switched on yet: the server has no ANTHROPIC_API_KEY.' }, 503);

  const body = await req.json().catch(() => ({}));
  const prompt = String(body.prompt ?? '').trim();
  const params = (body.params ?? {}) as Record<string, unknown>;
  if (prompt.length < 10) return json({ error: 'Describe the programme in a sentence or two.' }, 400);
  if (prompt.length > 4000) return json({ error: 'That is too long; keep it under 4000 characters.' }, 400);

  const messages: Record<string, unknown>[] = [{
    role: 'user',
    content: `${prompt}\n\nConstraints from the form: ${JSON.stringify(params)}`,
  }];

  let draft: Record<string, unknown> | null = null;
  let repaired = false;
  let usage = { input_tokens: 0, output_tokens: 0 };
  let failure: string | null = null;

  for (let round = 0; round < MAX_ROUNDS && !draft; round++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, system: SYSTEM, tools: TOOLS, messages }),
    });
    if (!res.ok) { failure = `The model service answered ${res.status}.`; break; }
    const reply = await res.json();
    usage = {
      input_tokens: usage.input_tokens + (reply.usage?.input_tokens ?? 0),
      output_tokens: usage.output_tokens + (reply.usage?.output_tokens ?? 0),
    };
    messages.push({ role: 'assistant', content: reply.content });

    const calls = (reply.content ?? []).filter((c: { type: string }) => c.type === 'tool_use');
    if (!calls.length) { failure = 'The model stopped without submitting a programme.'; break; }

    const results = [];
    for (const call of calls) {
      if (call.name === 'submit_program') {
        const problems = await validate(supabase, call.input);
        if (problems.length && !repaired) {
          repaired = true;
          results.push({
            type: 'tool_result', tool_use_id: call.id, is_error: true,
            content: `Fix these and submit again:\n- ${problems.join('\n- ')}`,
          });
        } else if (problems.length) {
          failure = `The draft still had problems: ${problems.join('; ')}`;
        } else {
          draft = call.input;
        }
      } else {
        const out = await runTool(supabase, call.name, call.input ?? {});
        results.push({ type: 'tool_result', tool_use_id: call.id, content: JSON.stringify(out) });
      }
    }
    if (draft || failure) break;
    messages.push({ role: 'user', content: results });
  }

  const { data: row } = await supabase.from('program_drafts').insert({
    coach_id: user.id, prompt, params, response: draft, model: MODEL,
    input_tokens: usage.input_tokens, output_tokens: usage.output_tokens,
    status: draft ? 'draft' : 'failed', error: failure,
  }).select('id').single();

  if (!draft) return json({ error: failure ?? 'No programme came back.', draft_id: row?.id }, 502);
  return json({ draft, draft_id: row?.id, usage });
});

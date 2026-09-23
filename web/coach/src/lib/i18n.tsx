import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'en' | 'es';
export type Names = { en?: string; es?: string } | null | undefined;

// English is the source; Spanish is a locale over it. Missing Spanish keys fall back to English.
const en = {
  app_title: 'Coach', sign_in: 'Sign in', sign_out: 'Sign out',
  email: 'Email', password: 'Password', google: 'Continue with Google',
  not_configured: 'This build has no Supabase URL or key. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  coaches_only: 'This tool is for coaches. Ask an administrator to give your account the coach role.',
  loading: 'Loading…', load_failed: 'Could not load this. Check your connection and try again.', retry: 'Try again',
  save: 'Save', saving: 'Saving…', cancel: 'Cancel', add: 'Add', remove: 'Remove', back: 'Back',
  delete: 'Delete', confirm_delete: 'Delete this? It cannot be undone.', failed: 'That did not work.',
  up: 'Move up', down: 'Move down', duplicate: 'Duplicate', explorer: 'Exercise explorer',

  // Home
  athletes: 'Athletes', places: 'Places', library: 'Library', calendar: 'Calendar',
  athletes_b: 'The people you coach, and what they have to train with.',
  places_b: 'Gyms and homes, with the kit each one has, in the order you reach for it.',
  library_b: 'Your templates. Assigning one resolves it for the athlete’s place.',
  nothing_yet: 'Nothing here yet',

  // Athletes
  add_athlete: 'Add an athlete', athlete_email: 'Their account email',
  add_athlete_b: 'They need an account in the athlete app first.',
  athlete_added: 'Added.', no_athletes: 'No athletes yet',
  their_places: (n: number) => `${n} place${n === 1 ? '' : 's'}`,
  assigned_programs: (n: number) => `${n} programme${n === 1 ? '' : 's'}`,

  // Places
  new_place: 'New place', place_name: 'Name', place_kind: 'Kind', place_city: 'City (optional)',
  kind_gym: 'Gym', kind_home: 'Home', kind_studio: 'Studio', kind_park: 'Park', kind_hotel: 'Hotel', kind_other: 'Other',
  whose_place: 'Belongs to', mine: 'Me',
  kit: 'Equipment here', kit_b: 'Tick what is here, then order it: the first one wins when two variations are both possible.',
  max_load: 'Heaviest', max_load_b: 'kg — leave empty if it does not apply',
  public_place: 'Public', public_place_b: 'A shared place anyone can start from. Adopting it makes a private copy.',
  adopt: 'Use a copy of this', kit_n: (n: number) => `${n} item${n === 1 ? '' : 's'}`,

  // Library and editor
  new_template: 'New template', template_name: 'Name', goal: 'Goal', level: 'Level',
  level_beginner: 'Beginner', level_intermediate: 'Intermediate', level_advanced: 'Advanced',
  schedule: 'Schedule', sched_weekly: 'Weekly cycle', sched_dated: 'Fixed dates', sched_sequence: 'In order, no dates',
  cycle_weeks: 'Weeks in the cycle', days_per_week: 'Days per week', tracking: 'Tracking',
  track_full: 'Reps and weight per set', track_completion: 'Tick each set', track_none: 'Nothing, just follow it',
  workouts: 'Workouts', new_workout: 'Add a workout', workout_name: 'Name', day: 'Day',
  mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun', no_day: 'No day',
  week_in_cycle: 'Week', copy_to_day: 'Copy to another day',
  blocks: 'Blocks', new_block: 'Add a block', purpose: 'Purpose', mode: 'How it runs',
  purpose_warmup: 'Warm-up', purpose_main: 'Main', purpose_accessory: 'Accessory',
  purpose_finisher: 'Finisher', purpose_cooldown: 'Cool-down',
  mode_straight: 'Straight — all the sets of one exercise, then the next',
  mode_rounds: 'Rounds — one set of each, then repeat (superset, circuit)',
  rounds: 'Rounds', rest_items: 'Rest between exercises', rest_rounds: 'Rest between rounds', rest_after: 'Rest after the block',
  exercises: 'Exercises', add_exercise: 'Add an exercise', search_exercises: 'Search the catalog',
  requires: 'Must be', any: 'Any', lock_variation: 'This exact variation',
  sets: 'Sets', add_set: 'Add a set', set_kind: 'Kind', kind_warmup: 'Warm-up', kind_working: 'Working',
  kind_backoff: 'Back-off', kind_drop: 'Drop', kind_amrap: 'AMRAP',
  reps: 'Reps', reps_to: 'to', secs: 'Seconds', load: 'kg', pct: '% 1RM', rpe: 'RPE', tempo: 'Tempo',
  rest: 'Rest (s)', side: 'Side', side_both: 'Both', side_each: 'One side at a time',
  side_alternating: 'Alternating', side_left: 'Left only', side_right: 'Right only',
  other_side: 'The other side', other_rest: 'rests', other_hold: 'holds', other_work: 'works too',
  per_side: 'per side', set_variation: 'Variation for this set',

  // Builder: the exercise list, drag and drop, variations
  extype_strength: 'Strength', extype_stretch: 'Stretch', extype_mobility: 'Mobility', extype_cardio: 'Cardio',
  nav_hint: (n: number) => `${n} exercises — drag one into a block, or click to add it to the one marked`,
  nav_row_hint: 'Drag into a block, or click to add',
  variations_n: (n: number) => `${n} variations`, one_way: 'one variation',
  drop_here: 'Adding here', drag_here: 'Drag an exercise in from the left, or click one',
  no_blocks: 'Add a block first — a warm-up, the main work, a finisher.',
  variations: 'Variations', any_variation: 'Any variation — the athlete’s place decides',
  no_variations: 'This exercise has only one way of doing it.',
  requires_b: 'Narrow it down, or leave it open and let the place decide.',
  locked_b: 'Locked to this exact variation.',
  open_b: (n: number) => `${n} variations fit. Pick one to insist on it.`,
  let_place_decide: 'Let the place decide', more_variations: (n: number) => `…and ${n} more`,
  // Workouts library and day slots
  workouts_lib: 'Workouts', workouts_lib_b: 'Workouts you build on their own, to drag into a programme’s days.',
  new_workout_lib: 'New workout', programs: 'Programmes',
  drag_workout_here: 'Drag a workout here', day_slot_empty: 'Empty',
  // AI drafting
  draft: 'Draft with AI', draft_title: 'Draft a programme',
  draft_b: 'Describe what you want. You get a draft in the same shape as any template — exercises, blocks and sets — which you then edit.',
  draft_placeholder: 'Three days a week for a club player coming back from a quiet month. Upper, lower, full body. Nothing overhead in week one.',
  draft_go: 'Draft it', drafting: 'Drafting…', draft_accept: 'Save as a template',
  draft_edit_b: 'Nothing is saved yet. Saving puts it in your library, where you edit it like anything else.',
  weeks_label: 'Weeks',
  // Assign
  assign: 'Assign', assign_to: 'Assign to an athlete', athlete: 'Athlete', place: 'Place', starts: 'Starts',
  assign_b: 'This copies the template, chooses a variation for every exercise from what that place has, and puts it on the calendar.',
  assigned_ok: 'Assigned. Here is what it became there.',
  resolved: 'What it became', swapped: 'Swapped', unavailable: 'Not available here',
  load_flag: (needs: number, has: number) => `${needs} kg prescribed, heaviest here is ${has} kg`,
  plans: 'Assigned programmes', plan_of: (a: string, p: string) => `${a} · ${p}`,
  occurrences: (n: number) => `${n} day${n === 1 ? '' : 's'} on the calendar`,
};
type Dict = typeof en;
const es: Partial<Dict> = {
  app_title: 'Entrenador', sign_in: 'Entrar', sign_out: 'Cerrar sesión',
  email: 'Correo', password: 'Contraseña', google: 'Continuar con Google',
  not_configured: 'Esta versión no tiene URL ni clave de Supabase. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.',
  coaches_only: 'Esta herramienta es para entrenadores. Pide que tu cuenta tenga el rol de entrenador.',
  loading: 'Cargando…', load_failed: 'No se pudo cargar. Revisa tu conexión e inténtalo de nuevo.', retry: 'Reintentar',
  save: 'Guardar', saving: 'Guardando…', cancel: 'Cancelar', add: 'Añadir', remove: 'Quitar', back: 'Atrás',
  delete: 'Eliminar', confirm_delete: '¿Eliminar esto? No se puede deshacer.', failed: 'No funcionó.',
  up: 'Subir', down: 'Bajar', duplicate: 'Duplicar', explorer: 'Explorador de ejercicios',

  athletes: 'Atletas', places: 'Lugares', library: 'Biblioteca', calendar: 'Calendario',
  athletes_b: 'Las personas que entrenas y con qué cuentan.',
  places_b: 'Gimnasios y casas, con el material de cada uno, en el orden en que lo usas.',
  library_b: 'Tus plantillas. Al asignar una se resuelve para el lugar del atleta.',
  nothing_yet: 'Aquí no hay nada todavía',

  add_athlete: 'Añadir atleta', athlete_email: 'Su correo de la cuenta',
  add_athlete_b: 'Primero necesitan una cuenta en la app del atleta.',
  athlete_added: 'Añadido.', no_athletes: 'Aún no hay atletas',
  their_places: (n: number) => `${n} lugar${n === 1 ? '' : 'es'}`,
  assigned_programs: (n: number) => `${n} programa${n === 1 ? '' : 's'}`,

  new_place: 'Nuevo lugar', place_name: 'Nombre', place_kind: 'Tipo', place_city: 'Ciudad (opcional)',
  kind_gym: 'Gimnasio', kind_home: 'Casa', kind_studio: 'Estudio', kind_park: 'Parque', kind_hotel: 'Hotel', kind_other: 'Otro',
  whose_place: 'Pertenece a', mine: 'Yo',
  kit: 'Material disponible', kit_b: 'Marca lo que hay y ordénalo: el primero gana cuando dos variaciones son posibles.',
  max_load: 'Más pesado', max_load_b: 'kg — déjalo vacío si no aplica',
  public_place: 'Público', public_place_b: 'Un lugar compartido del que cualquiera puede partir. Al usarlo se crea una copia privada.',
  adopt: 'Usar una copia', kit_n: (n: number) => `${n} elemento${n === 1 ? '' : 's'}`,

  new_template: 'Nueva plantilla', template_name: 'Nombre', goal: 'Objetivo', level: 'Nivel',
  level_beginner: 'Principiante', level_intermediate: 'Intermedio', level_advanced: 'Avanzado',
  schedule: 'Calendario', sched_weekly: 'Ciclo semanal', sched_dated: 'Fechas fijas', sched_sequence: 'En orden, sin fechas',
  cycle_weeks: 'Semanas del ciclo', days_per_week: 'Días por semana', tracking: 'Registro',
  track_full: 'Reps y peso por serie', track_completion: 'Marcar cada serie', track_none: 'Nada, solo seguirlo',
  workouts: 'Entrenamientos', new_workout: 'Añadir entrenamiento', workout_name: 'Nombre', day: 'Día',
  mon: 'Lun', tue: 'Mar', wed: 'Mié', thu: 'Jue', fri: 'Vie', sat: 'Sáb', sun: 'Dom', no_day: 'Sin día',
  week_in_cycle: 'Semana', copy_to_day: 'Copiar a otro día',
  blocks: 'Bloques', new_block: 'Añadir bloque', purpose: 'Propósito', mode: 'Cómo se hace',
  purpose_warmup: 'Calentamiento', purpose_main: 'Principal', purpose_accessory: 'Accesorio',
  purpose_finisher: 'Remate', purpose_cooldown: 'Vuelta a la calma',
  mode_straight: 'Seguido — todas las series de un ejercicio y luego el siguiente',
  mode_rounds: 'Rondas — una serie de cada uno y se repite (superserie, circuito)',
  rounds: 'Rondas', rest_items: 'Descanso entre ejercicios', rest_rounds: 'Descanso entre rondas', rest_after: 'Descanso al terminar el bloque',
  exercises: 'Ejercicios', add_exercise: 'Añadir ejercicio', search_exercises: 'Buscar en el catálogo',
  requires: 'Debe ser', any: 'Cualquiera', lock_variation: 'Esta variación exacta',
  sets: 'Series', add_set: 'Añadir serie', set_kind: 'Tipo', kind_warmup: 'Calentamiento', kind_working: 'De trabajo',
  kind_backoff: 'Descarga', kind_drop: 'Descendente', kind_amrap: 'Máximas',
  reps: 'Reps', reps_to: 'a', secs: 'Segundos', load: 'kg', pct: '% 1RM', rpe: 'RPE', tempo: 'Tempo',
  rest: 'Descanso (s)', side: 'Lado', side_both: 'Ambos', side_each: 'Un lado cada vez',
  side_alternating: 'Alterno', side_left: 'Solo izquierda', side_right: 'Solo derecha',
  other_side: 'El otro lado', other_rest: 'descansa', other_hold: 'sostiene', other_work: 'también trabaja',
  per_side: 'por lado', set_variation: 'Variación de esta serie',

  // Constructor: lista de ejercicios, arrastrar y soltar, variaciones
  extype_strength: 'Fuerza', extype_stretch: 'Estiramiento', extype_mobility: 'Movilidad', extype_cardio: 'Cardio',
  nav_hint: (n: number) => `${n} ejercicios — arrastra uno a un bloque o haz clic para añadirlo al marcado`,
  nav_row_hint: 'Arrastra a un bloque o haz clic para añadir',
  variations_n: (n: number) => `${n} variaciones`, one_way: 'una variación',
  drop_here: 'Se añade aquí', drag_here: 'Arrastra un ejercicio desde la izquierda o haz clic en uno',
  no_blocks: 'Añade primero un bloque: calentamiento, trabajo principal, remate.',
  variations: 'Variaciones', any_variation: 'Cualquier variación — decide el lugar del atleta',
  no_variations: 'Este ejercicio solo tiene una forma de hacerse.',
  requires_b: 'Acótalo o déjalo abierto y que lo decida el lugar.',
  locked_b: 'Fijado a esta variación exacta.',
  open_b: (n: number) => `${n} variaciones encajan. Elige una para exigirla.`,
  let_place_decide: 'Que decida el lugar', more_variations: (n: number) => `…y ${n} más`,
  workouts_lib: 'Entrenamientos', workouts_lib_b: 'Entrenamientos sueltos, para arrastrarlos a los días de un programa.',
  new_workout_lib: 'Nuevo entrenamiento', programs: 'Programas',
  drag_workout_here: 'Arrastra un entrenamiento aquí', day_slot_empty: 'Vacío',
  // Borrador con IA
  draft: 'Borrador con IA', draft_title: 'Redactar un programa',
  draft_b: 'Describe lo que quieres. Recibes un borrador con la misma forma que cualquier plantilla —ejercicios, bloques y series— y luego lo editas.',
  draft_placeholder: 'Tres días por semana para un jugador de club que vuelve tras un mes parado. Superior, inferior, cuerpo completo. Nada por encima de la cabeza la primera semana.',
  draft_go: 'Redactar', drafting: 'Redactando…', draft_accept: 'Guardar como plantilla',
  draft_edit_b: 'Todavía no se ha guardado nada. Al guardar entra en tu biblioteca y lo editas como cualquier otra.',
  weeks_label: 'Semanas',
  assign: 'Asignar', assign_to: 'Asignar a un atleta', athlete: 'Atleta', place: 'Lugar', starts: 'Empieza',
  assign_b: 'Esto copia la plantilla, elige una variación para cada ejercicio según lo que hay en ese lugar y lo pone en el calendario.',
  assigned_ok: 'Asignado. Esto es en lo que se convirtió allí.',
  resolved: 'En qué se convirtió', swapped: 'Cambiado', unavailable: 'Aquí no se puede',
  load_flag: (needs: number, has: number) => `${needs} kg prescritos, aquí lo más pesado es ${has} kg`,
  plans: 'Programas asignados', plan_of: (a: string, p: string) => `${a} · ${p}`,
  occurrences: (n: number) => `${n} día${n === 1 ? '' : 's'} en el calendario`,
};

type Key = keyof Dict;
type Args<K extends Key> = Dict[K] extends (...a: infer A) => string ? A : [];

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: <K extends Key>(k: K, ...a: Args<K>) => string;
  nm: (n: Names) => string;
};
export type Translate = Ctx['t'];
const I18n = createContext<Ctx | null>(null);

const stored = (): Lang => {
  try { return localStorage.getItem('lang') === 'es' ? 'es' : (localStorage.getItem('lang') === 'en' ? 'en' : (navigator.language.startsWith('es') ? 'es' : 'en')); }
  catch { return 'en'; }
};

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(stored);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('lang', l); } catch { /* storage unavailable */ }
    document.documentElement.lang = l;
  }, []);
  const value = useMemo<Ctx>(() => ({
    lang, setLang,
    t: (k, ...a) => {
      const v = (lang === 'es' && es[k] !== undefined ? es[k] : en[k]) as unknown;
      return typeof v === 'function' ? (v as (...x: unknown[]) => string)(...a) : (v as string);
    },
    nm: (n) => (n && (n[lang] || n.en)) || '',
  }), [lang, setLang]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export function useI18n() {
  const c = useContext(I18n);
  if (!c) throw new Error('useI18n outside I18nProvider');
  return c;
}

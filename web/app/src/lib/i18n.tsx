import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'en' | 'es';
export type Names = { en?: string; es?: string } | null | undefined;

// English is the source; Spanish is a locale over it. Missing Spanish keys fall back to English.
const en = {
  app_title: 'Personal Trainer',
  sign_in: 'Sign in', sign_up: 'Create account', sign_out: 'Sign out',
  google: 'Continue with Google', or_email: 'or with email',
  google_not_enabled: 'Google sign-in is not switched on for this project yet. Use email for now.',
  email: 'Email', password: 'Password', display_name: 'Your name',
  have_account: 'Already have an account? Sign in', no_account: 'New here? Create an account',
  check_email: 'Account created. Check your email to confirm it, then sign in.',
  not_configured: 'This build has no Supabase URL or key. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  home: 'Home', history: 'History',
  hello: (n: string) => `Hi, ${n}`,
  assigned: 'Assigned to you', no_assigned: 'Nothing assigned yet',
  no_assigned_b: 'When your coach assigns a workout it appears here. Meanwhile, try a program from the library.',
  library: 'Program library', workouts_n: (n: number) => `${n} workout${n === 1 ? '' : 's'}`,
  exercises_n: (n: number) => `${n} exercise${n === 1 ? '' : 's'}`,
  resume: 'Resume workout', resume_b: (w: string) => `${w} is in progress.`,
  scheduled: (d: string) => `Scheduled ${d}`, unscheduled: 'No date',
  start: 'Start workout', back: 'Back',
  plan: (sets: number, reps: string) => `${sets} × ${reps}`,
  rest_s: (s: number) => `rest ${s} s`, kg: 'kg', reps: 'Reps', weight: 'Weight', set: 'Set',
  exercise_of: (i: number, n: number) => `Exercise ${i} of ${n}`,
  previous: 'Previous', next: 'Next exercise', finish: 'Finish workout', discard: 'Discard workout',
  instructions: 'How to do it', target: (r: string) => `Target: ${r}`,
  resting: 'Rest', skip: 'Skip', plus15: '+15 s',
  confirm_finish: 'Finish the workout?', confirm_finish_b: (d: number, n: number) => `${d} of ${n} sets are done. Sets not ticked are saved as not done.`,
  confirm_discard: 'Discard this workout?', confirm_discard_b: 'Nothing will be saved.',
  keep_going: 'Keep going', saving: 'Saving…', save_failed: 'Could not save the workout. It is still on this device — try again.',
  done_title: 'Workout complete', duration: 'Duration', sets_done: 'Sets done', volume: 'Volume (kg)',
  back_home: 'Back to home', no_history: 'No workouts yet', no_history_b: 'Finished workouts appear here.',
  loading: 'Loading…', load_failed: 'Could not load this. Check your connection and try again.', retry: 'Try again',
  not_found: 'This workout is not available to you.',
  credit_media: 'Exercise images and animations © Gym visual —', credit_data: 'exercise data (MIT) from',
  // Blocks, rounds and prescribed sets
  purpose_warmup: 'Warm-up', purpose_main: 'Main', purpose_accessory: 'Accessory',
  purpose_finisher: 'Finisher', purpose_cooldown: 'Cool-down',
  round_of: (r: number, n: number) => `Round ${r} of ${n}`,
  step_of: (i: number, n: number) => `Step ${i} of ${n}`,
  sets_word: 'sets', amrap_short: 'AMRAP', per_side: 'per side',
  each_side: 'One side at a time', alternating: 'Alternating', left: 'Left', right: 'Right',
  other_holds: 'the other side holds', rpe_short: 'RPE', tempo_short: 'Tempo',
  kind_warmup: 'Warm-up set', kind_backoff: 'Back-off', kind_drop: 'Drop set',
  rest_between_rounds: (s: number) => `${s} s between rounds`,
  swapped_here: 'Changed to fit this place', not_available_here: 'Not available here as prescribed',
  load_warning: (needs: number, has: number) => `Prescribed ${needs} kg; the heaviest here is ${has} kg`,
  blocks_n: (n: number) => `${n} block${n === 1 ? '' : 's'}`,
  // Exercise detail and substitutes
  details: 'Details and alternatives', muscles_worked: 'Muscles worked',
  primary_m: 'Primary', secondary_m: 'Secondary', equipment: 'Equipment',
  why_inferred: 'From the way this variation is done:',
  swap_title: 'Swap this exercise',
  swap_sub: (n: number) => `${n} alternative${n === 1 ? '' : 's'}, closest first.`,
  swap_none: 'No alternative for this one in the catalog. Ask your coach.',
  l1_t: 'Same exercise, other equipment', l1_s: 'Identical movement and muscles. Only the equipment changes.',
  l2_t: 'Close variation', l2_s: 'Same exercise, one detail changes — the emphasis shifts a little.',
  l3_t: 'Similar exercise', l3_s: 'A different exercise that trains the same pattern and muscles.',
  l1_b: 'Same', l2_b: 'Close', l3_b: 'Similar',
  same_muscles: 'Same muscles as planned.', what_changes: 'What changes',
  change_to: (dim: string, to: string) => `${dim}: ${to}`,
  change_from: (dim: string, from: string, to: string) => `${dim}: ${to} instead of ${from}`,
  change_drop: (dim: string, from: string) => `${dim}: without ${from}`,
  adds_m: (m: string) => `Adds: ${m}`, drops_m: (m: string) => `Drops: ${m}`,
  promotes_m: (m: string) => `More work: ${m}`, demotes_m: (m: string) => `Less work: ${m}`,
  basis_pattern: 'Same movement pattern.', basis_muscle: 'Trains the same muscles.',
  basis_region: 'Works the same part of the body.',
  compare_body: 'Compare on the body', planned_m: 'Planned', this_option: 'This option',
  use_this: 'Do this instead', swapped_to: (n: string) => `Doing ${n} instead`, undo_swap: 'Back to the planned exercise',
  my_equipment: 'My equipment', my_equipment_sub: 'Alternatives you cannot do are left out.',
  my_equipment_none: 'Pick what you have and the list narrows to what you can actually do.',
  missing_equipment: (kit: string) => `You have not got ${kit}. Pick an alternative below.`,
};
type Dict = typeof en;
const es: Partial<Dict> = {
  app_title: 'Entrenador personal',
  sign_in: 'Entrar', sign_up: 'Crear cuenta', sign_out: 'Cerrar sesión',
  google: 'Continuar con Google', or_email: 'o con correo',
  google_not_enabled: 'El acceso con Google aún no está activado en este proyecto. Usa el correo por ahora.',
  email: 'Correo', password: 'Contraseña', display_name: 'Tu nombre',
  have_account: '¿Ya tienes cuenta? Entra', no_account: '¿Eres nuevo? Crea una cuenta',
  check_email: 'Cuenta creada. Revisa tu correo para confirmarla y luego entra.',
  not_configured: 'Esta versión no tiene URL ni clave de Supabase. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.',
  home: 'Inicio', history: 'Historial',
  hello: (n: string) => `Hola, ${n}`,
  assigned: 'Asignado para ti', no_assigned: 'Todavía no tienes nada asignado',
  no_assigned_b: 'Cuando tu entrenador te asigne un entrenamiento aparecerá aquí. Mientras tanto, prueba un programa de la biblioteca.',
  library: 'Biblioteca de programas', workouts_n: (n: number) => `${n} entrenamiento${n === 1 ? '' : 's'}`,
  exercises_n: (n: number) => `${n} ejercicio${n === 1 ? '' : 's'}`,
  resume: 'Continuar entrenamiento', resume_b: (w: string) => `${w} está en curso.`,
  scheduled: (d: string) => `Programado para ${d}`, unscheduled: 'Sin fecha',
  start: 'Empezar entrenamiento', back: 'Atrás',
  rest_s: (s: number) => `descanso ${s} s`, reps: 'Reps', weight: 'Peso', set: 'Serie',
  exercise_of: (i: number, n: number) => `Ejercicio ${i} de ${n}`,
  previous: 'Anterior', next: 'Siguiente ejercicio', finish: 'Terminar entrenamiento', discard: 'Descartar entrenamiento',
  instructions: 'Cómo hacerlo', target: (r: string) => `Objetivo: ${r}`,
  resting: 'Descanso', skip: 'Saltar', plus15: '+15 s',
  confirm_finish: '¿Terminar el entrenamiento?', confirm_finish_b: (d: number, n: number) => `Has hecho ${d} de ${n} series. Las series sin marcar se guardan como no hechas.`,
  confirm_discard: '¿Descartar este entrenamiento?', confirm_discard_b: 'No se guardará nada.',
  keep_going: 'Seguir', saving: 'Guardando…', save_failed: 'No se pudo guardar. Sigue en este dispositivo: inténtalo de nuevo.',
  done_title: 'Entrenamiento completado', duration: 'Duración', sets_done: 'Series hechas', volume: 'Volumen (kg)',
  back_home: 'Volver al inicio', no_history: 'Aún no hay entrenamientos', no_history_b: 'Los entrenamientos terminados aparecen aquí.',
  loading: 'Cargando…', load_failed: 'No se pudo cargar. Revisa tu conexión e inténtalo de nuevo.', retry: 'Reintentar',
  not_found: 'Este entrenamiento no está disponible para ti.',
  credit_media: 'Imágenes y animaciones de ejercicios © Gym visual —', credit_data: 'datos de ejercicios (MIT) de',
  // Bloques, rondas y series prescritas
  purpose_warmup: 'Calentamiento', purpose_main: 'Principal', purpose_accessory: 'Accesorio',
  purpose_finisher: 'Remate', purpose_cooldown: 'Vuelta a la calma',
  round_of: (r: number, n: number) => `Ronda ${r} de ${n}`,
  step_of: (i: number, n: number) => `Paso ${i} de ${n}`,
  sets_word: 'series', amrap_short: 'máximas', per_side: 'por lado',
  each_side: 'Un lado cada vez', alternating: 'Alterno', left: 'Izquierda', right: 'Derecha',
  other_holds: 'el otro lado sostiene', rpe_short: 'RPE', tempo_short: 'Tempo',
  kind_warmup: 'Serie de calentamiento', kind_backoff: 'Serie de descarga', kind_drop: 'Serie descendente',
  rest_between_rounds: (s: number) => `${s} s entre rondas`,
  swapped_here: 'Cambiado para este lugar', not_available_here: 'Aquí no se puede hacer como está prescrito',
  load_warning: (needs: number, has: number) => `Prescrito ${needs} kg; lo más pesado aquí es ${has} kg`,
  blocks_n: (n: number) => `${n} bloque${n === 1 ? '' : 's'}`,
  // Detalle del ejercicio y alternativas
  details: 'Detalles y alternativas', muscles_worked: 'Músculos trabajados',
  primary_m: 'Principal', secondary_m: 'Secundario', equipment: 'Material',
  why_inferred: 'Por cómo se hace esta variación:',
  swap_title: 'Cambiar este ejercicio',
  swap_sub: (n: number) => `${n} alternativa${n === 1 ? '' : 's'}, de la más parecida a la menos.`,
  swap_none: 'No hay alternativa para este ejercicio en el catálogo. Pregunta a tu entrenador.',
  l1_t: 'Mismo ejercicio, otro material', l1_s: 'Mismo movimiento y mismos músculos. Solo cambia el material.',
  l2_t: 'Variación cercana', l2_s: 'Mismo ejercicio con un detalle distinto: el énfasis cambia un poco.',
  l3_t: 'Ejercicio similar', l3_s: 'Otro ejercicio que entrena el mismo patrón y los mismos músculos.',
  l1_b: 'Igual', l2_b: 'Cercano', l3_b: 'Similar',
  same_muscles: 'Los mismos músculos que el planificado.', what_changes: 'Qué cambia',
  change_to: (dim: string, to: string) => `${dim}: ${to}`,
  change_from: (dim: string, from: string, to: string) => `${dim}: ${to} en lugar de ${from}`,
  change_drop: (dim: string, from: string) => `${dim}: sin ${from}`,
  adds_m: (m: string) => `Añade: ${m}`, drops_m: (m: string) => `Quita: ${m}`,
  promotes_m: (m: string) => `Más trabajo: ${m}`, demotes_m: (m: string) => `Menos trabajo: ${m}`,
  basis_pattern: 'Mismo patrón de movimiento.', basis_muscle: 'Entrena los mismos músculos.',
  basis_region: 'Trabaja la misma zona del cuerpo.',
  compare_body: 'Comparar en el cuerpo', planned_m: 'Planificado', this_option: 'Esta opción',
  use_this: 'Hacer este', swapped_to: (n: string) => `Harás ${n} en su lugar`, undo_swap: 'Volver al ejercicio planificado',
  my_equipment: 'Mi material', my_equipment_sub: 'Las alternativas que no puedes hacer no se muestran.',
  my_equipment_none: 'Marca lo que tienes y la lista se ajusta a lo que puedes hacer de verdad.',
  missing_equipment: (kit: string) => `No tienes ${kit}. Elige una alternativa abajo.`,
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

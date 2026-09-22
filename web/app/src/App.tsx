import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configured, supabase } from './lib/supabase';
import { useI18n, type Lang } from './lib/i18n';
import { go, useRoute } from './lib/router';
import { loadWorkout } from './lib/data';
import { newActive, readActive, writeActive } from './lib/active';
import type { ActiveSession, Variant, Workout } from './lib/types';
import { Auth } from './screens/Auth';
import { Home } from './screens/Home';
import { Program } from './screens/Program';
import { WorkoutPreview } from './screens/WorkoutPreview';
import { Player } from './screens/Player';
import { ExerciseDetail } from './screens/ExerciseDetail';
import { Done, History } from './screens/History';
import { Loading } from './components/Status';

// Follow the phone's light/dark setting; dark is the default.
function useSystemTheme() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => document.documentElement.classList.toggle('gl-light', mq.matches);
    apply(); mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
}

export default function App() {
  useSystemTheme();
  const { t, lang, setLang } = useI18n();
  const route = useRoute();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [active, setActive] = useState<ActiveSession | null>(null);
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const uid = session?.user.id;
  useEffect(() => {
    if (!uid) { setActive(null); return; }
    setActive(readActive(uid));
    supabase.from('profiles').select('display_name').eq('id', uid).maybeSingle()
      .then(({ data }) => setName(data?.display_name || session?.user.email?.split('@')[0] || ''));
  }, [uid, session?.user.email]);

  // The workout behind an in-progress session (after a reload, or when resuming).
  useEffect(() => {
    if (active && activeWorkout?.id !== active.workoutId) loadWorkout(active.workoutId).then(setActiveWorkout, () => setActiveWorkout(null));
  }, [active, activeWorkout?.id]);

  const change = useCallback((a: ActiveSession | null) => { setActive(a); writeActive(a); }, []);
  const start = (w: Workout, assignmentId: string | null) => {
    if (!uid) return;
    if (!active || active.workoutId !== w.id) { change(newActive(uid, w, assignmentId)); setActiveWorkout(w); }
    go('/play');
  };

  // An athlete who cannot do the planned exercise swaps it for the session only; the programme
  // the coach wrote is untouched, and the saved set rows record what was actually done.
  const swap = (itemId: string, variant: Variant | null) => {
    if (!active) return;
    const swaps = { ...(active.swaps || {}) };
    if (variant) swaps[itemId] = variant; else delete swaps[itemId];
    change({ ...active, swaps });
    history.back();
  };

  if (!configured) return <div className="content"><div className="error">{t('not_configured')}</div></div>;
  if (session === undefined) return <div className="content"><Loading /></div>;

  const [page, param] = route.path;
  const langSwitch = (
    <span className="seg" role="group" aria-label="Language">
      {(['en', 'es'] as Lang[]).map(l => (
        <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
      ))}
    </span>
  );

  if (!session) return (
    <div className="shell">
      <div className="topbar"><span className="title">{t('app_title')}</span>{langSwitch}</div>
      <Auth />
      <Credits />
    </div>
  );

  let body;
  if (page === 'program' && param) body = <Program id={param} />;
  else if (page === 'workout' && param) body = <WorkoutPreview id={param} assignmentId={route.query.get('a')} active={active} onStart={start} />;
  else if (page === 'play') {
    if (!active) { go('/'); body = null; }
    else if (!activeWorkout || activeWorkout.id !== active.workoutId) body = <Loading />;
    else body = <Player active={active} workout={activeWorkout} onChange={change}
      onFinished={sid => { change(null); go(`/done/${sid}`); }} onDiscard={() => { change(null); go('/'); }} />;
  }
  else if (page === 'exercise' && param) {
    const itemId = route.query.get('item');
    const inActive = !!itemId && !!activeWorkout?.items.some(it => it.id === itemId);
    body = <ExerciseDetail id={param} itemId={inActive ? itemId : null}
      onSwap={inActive ? swap : null} swapped={(itemId && active?.swaps?.[itemId]) || null} />;
  }
  else if (page === 'history') body = <History />;
  else if (page === 'done' && param) body = <Done id={param} />;
  else body = <Home name={name} active={active} />;

  const home = !page;
  return (
    <div className="shell">
      <div className="topbar">
        {!home && <button className="link" type="button" onClick={() => (page === 'play' ? go('/') : history.back())}>‹ {page === 'play' ? t('home') : t('back')}</button>}
        <span className="title">{home ? t('app_title') : ''}</span>
        {page !== 'history' && page !== 'play' && <button className="link" type="button" onClick={() => go('/history')}>{t('history')}</button>}
        {langSwitch}
        {home && <button className="link" type="button" onClick={() => supabase.auth.signOut()}>{t('sign_out')}</button>}
      </div>
      <main className="content">{body}</main>
      <Credits />
    </div>
  );
}

function Credits() {
  const { t } = useI18n();
  return (
    <footer className="credits">
      {t('credit_media')} <a href="https://gymvisual.com/" target="_blank" rel="noopener">gymvisual.com</a> · {t('credit_data')}{' '}
      <a href="https://github.com/hasaneyldrm/exercises-dataset" target="_blank" rel="noopener">hasaneyldrm/exercises-dataset</a>
    </footer>
  );
}

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { configured, supabase } from './lib/supabase';
import { useI18n, type Lang } from './lib/i18n';
import { useRoute } from './lib/router';
import { loadMe } from './lib/data';
import { Loading } from './components/Status';
import { Auth } from './screens/Auth';
import { Athletes } from './screens/Athletes';
import { Places } from './screens/Places';
import { PlaceEdit } from './screens/PlaceEdit';
import { Library } from './screens/Library';
import { ProgramEdit } from './screens/ProgramEdit';
import { WorkoutEdit } from './screens/WorkoutEdit';
import { Assign } from './screens/Assign';
import { Calendar } from './screens/Calendar';
import { Draft } from './screens/Draft';

// Follow the desktop's light/dark setting; dark is the default.
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
  const [me, setMe] = useState<Awaited<ReturnType<typeof loadMe>> | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (session) loadMe().then(setMe); else setMe(null); }, [session]);

  const langSwitch = (
    <span className="seg" role="group" aria-label="Language">
      {(['en', 'es'] as Lang[]).map(l => (
        <button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
      ))}
    </span>
  );

  if (!configured) return <div className="content"><div className="error">{t('not_configured')}</div></div>;
  if (session === undefined) return <div className="content"><Loading /></div>;
  if (!session) return (
    <div className="shell">
      <div className="topbar"><span className="title">{t('app_title')}</span>{langSwitch}</div>
      <Auth />
    </div>
  );
  if (me && me.role !== 'coach' && me.role !== 'admin') return (
    <div className="shell">
      <div className="topbar"><span className="title">{t('app_title')}</span>{langSwitch}
        <button className="link" type="button" onClick={() => supabase.auth.signOut()}>{t('sign_out')}</button></div>
      <main className="content"><div className="error">{t('coaches_only')}</div></main>
    </div>
  );

  const [page, param] = route.path;
  const here = page || 'athletes';
  let body = <Loading />;
  if (!me) body = <Loading />;
  else if (here === 'athletes') body = <Athletes />;
  else if (here === 'places' && param) body = <PlaceEdit id={param === 'new' ? null : param} me={me.id} />;
  else if (here === 'places') body = <Places me={me.id} />;
  else if (here === 'library') body = <Library me={me.id} />;
  else if (here === 'program' && param) body = <ProgramEdit id={param} />;
  else if (here === 'workout' && param) body = <WorkoutEdit id={param} />;
  else if (here === 'assign' && param) body = <Assign programId={param} />;
  else if (here === 'calendar') body = <Calendar />;
  else if (here === 'draft') body = <Draft />;
  else body = <Athletes />;

  const tab = (href: string, label: string, key: string) => (
    <a href={`#/${href}`} aria-current={here === key ? 'page' : undefined}>{label}</a>
  );

  return (
    <div className="shell">
      <div className="topbar">
        <span className="title">{t('app_title')}</span>
        {langSwitch}
        <button className="link" type="button" onClick={() => supabase.auth.signOut()}>{t('sign_out')}</button>
      </div>
      <nav className="nav">
        {tab('athletes', t('athletes'), 'athletes')}
        {tab('places', t('places'), 'places')}
        {tab('library', t('library'), 'library')}
        {tab('calendar', t('calendar'), 'calendar')}
        {tab('draft', t('draft'), 'draft')}
        <a href="/explorer/" target="_blank" rel="noopener">{t('explorer')} ↗</a>
      </nav>
      <main className="content">{body}</main>
    </div>
  );
}

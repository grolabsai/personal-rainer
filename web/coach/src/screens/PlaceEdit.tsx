import { useEffect, useState } from 'react';
import { loadPlaces, savePlace, type Place } from '../lib/data';
import { useI18n, type Names } from '../lib/i18n';
import { go } from '../lib/router';
import { useLoad } from '../lib/useLoad';
import { EquipmentIcon } from '../components/Equipment';
import { Failed, Loading } from '../components/Status';

const KINDS = ['gym', 'home', 'studio', 'park', 'hotel', 'other'] as const;

// A place is a name and an ordered kit. The order is the point: it decides which variation wins
// when several are possible, so it is edited as a list you move things up and down in.
export function PlaceEdit({ id, me }: { id: string | null; me: string }) {
  const { t, nm, lang } = useI18n();
  const { data, error, loading, reload } = useLoad(loadPlaces, []);
  const [names, setNames] = useState<Names>({ en: '', es: '' });
  const [kind, setKind] = useState<string>('gym');
  const [city, setCity] = useState('');
  const [kit, setKit] = useState<Place['kit']>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');

  const place = data?.places.find(p => p.id === id);
  useEffect(() => {
    if (!place) return;
    setNames(place.names); setKind(place.kind); setCity(place.city || ''); setKit(place.kit);
  }, [place]);

  if (loading && !data) return <Loading />;
  if (error) return <Failed onRetry={reload} />;
  const equipment = data!.equipment;
  const has = (eq: string) => kit.some(k => k.equipment_id === eq);
  const move = (i: number, by: number) => {
    const next = [...kit]; const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setKit(next);
  };

  const submit = async () => {
    setBusy(true); setFailed('');
    try {
      const saved = await savePlace({ id: id || undefined, owner_id: place?.owner_id || me, names, kind, city: city || null }, kit);
      go(`/places/${saved}`);
      reload();
    } catch (e) { setFailed((e as { message?: string }).message || t('failed')); }
    setBusy(false);
  };

  return (
    <>
      <button className="link" type="button" onClick={() => go('/places')}>‹ {t('places')}</button>
      <h1>{id ? nm(names) || t('places') : t('new_place')}</h1>

      <div className="grid2" style={{ marginTop: 12 }}>
        <div className="card">
          <div className="formrow"><label>{t('place_name')} (EN)</label>
            <input className="input" value={names?.en || ''} onChange={e => setNames({ ...names, en: e.target.value })} /></div>
          <div className="formrow"><label>{t('place_name')} (ES)</label>
            <input className="input" value={names?.es || ''} onChange={e => setNames({ ...names, es: e.target.value })} /></div>
          <div className="formrow"><label>{t('place_kind')}</label>
            <select value={kind} onChange={e => setKind(e.target.value)}>
              {KINDS.map(k => <option key={k} value={k}>{t(`kind_${k}` as 'kind_gym')}</option>)}
            </select></div>
          <div className="formrow"><label>{t('place_city')}</label>
            <input className="input" value={city} onChange={e => setCity(e.target.value)} /></div>
          {failed && <div className="error">{failed}</div>}
          <button className="btn primary block" type="button" disabled={busy} onClick={submit}>
            {busy ? t('saving') : t('save')}
          </button>
        </div>

        <div className="card">
          <h3 className="lvl" style={{ marginTop: 0 }}>{t('kit')}</h3>
          <p className="sub">{t('kit_b')}</p>
          {kit.map((k, i) => {
            const eq = equipment.find(e => e.id === k.equipment_id);
            return (
              <div key={k.equipment_id} className="kitrow">
                <span className="mono small muted">{i + 1}</span>
                <span className="inline"><EquipmentIcon id={k.equipment_id} />{nm(eq?.names) || k.equipment_id}</span>
                <input className="input" type="number" inputMode="decimal" placeholder={t('max_load')}
                  value={k.max_load_kg ?? ''} title={t('max_load_b')}
                  onChange={e => setKit(kit.map((x, j) => j === i
                    ? { ...x, max_load_kg: e.target.value === '' ? null : Number(e.target.value) } : x))} />
                <span className="inline">
                  <button className="btn mini" type="button" aria-label={t('up')} onClick={() => move(i, -1)}>↑</button>
                  <button className="btn mini" type="button" aria-label={t('down')} onClick={() => move(i, 1)}>↓</button>
                  <button className="btn mini" type="button" onClick={() => setKit(kit.filter((_, j) => j !== i))}>×</button>
                </span>
              </div>
            );
          })}
          <div className="chips" style={{ marginTop: 12 }}>
            {equipment.filter(e => !has(e.id)).map(e => (
              <button key={e.id} className="chip" type="button"
                onClick={() => setKit([...kit, { equipment_id: e.id, rank: kit.length, max_load_kg: null }])}>
                <EquipmentIcon id={e.id} />{e.names?.[lang] || e.names?.en || e.id}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

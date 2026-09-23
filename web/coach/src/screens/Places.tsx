import { adoptPlace, loadPlaces } from '../lib/data';
import { useI18n } from '../lib/i18n';
import { go } from '../lib/router';
import { useLoad } from '../lib/useLoad';
import { Failed, Loading } from '../components/Status';

export function Places({ me }: { me: string }) {
  const { t, nm } = useI18n();
  const { data, error, loading, reload } = useLoad(loadPlaces, []);
  if (loading && !data) return <Loading />;
  if (error) return <Failed onRetry={reload} />;
  const mine = data!.places.filter(p => p.owner_id === me);
  const others = data!.places.filter(p => p.owner_id !== me && p.visibility !== 'public');
  const shared = data!.places.filter(p => p.visibility === 'public');

  const card = (p: typeof mine[number], adoptable = false) => (
    <div key={p.id} className="card between">
      <span>
        <span className="name">{nm(p.names)}</span>
        <span className="muted small" style={{ display: 'block' }}>
          {t(`kind_${p.kind}` as 'kind_gym')}{p.city ? ` · ${p.city}` : ''} · {t('kit_n', p.kit.length)}
        </span>
      </span>
      {adoptable
        ? <button className="btn mini" type="button" onClick={() => adoptPlace(p.id).then(id => go(`/places/${id}`))}>{t('adopt')}</button>
        : <button className="btn mini" type="button" onClick={() => go(`/places/${p.id}`)}>{t('save') === 'Save' ? 'Edit' : 'Editar'}</button>}
    </div>
  );

  return (
    <>
      <div className="between">
        <h1>{t('places')}</h1>
        <button className="btn" type="button" onClick={() => go('/places/new')}>{t('new_place')}</button>
      </div>
      <p className="muted">{t('places_b')}</p>

      <div className="list" style={{ marginTop: 16 }}>{mine.map(p => card(p))}</div>
      {!!others.length && (
        <>
          <h3 className="lvl">{t('athletes')}</h3>
          <div className="list">{others.map(p => card(p))}</div>
        </>
      )}
      {!!shared.length && (
        <>
          <h3 className="lvl">{t('public_place')}</h3>
          <p className="sub">{t('public_place_b')}</p>
          <div className="list">{shared.map(p => card(p, p.owner_id !== me))}</div>
        </>
      )}
      {!mine.length && !shared.length && <div className="empty">{t('nothing_yet')}</div>}
    </>
  );
}

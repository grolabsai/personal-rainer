import { loadEnrollments } from '../lib/data';
import { useI18n } from '../lib/i18n';
import { go } from '../lib/router';
import { useLoad } from '../lib/useLoad';
import { Failed, Loading } from '../components/Status';

export function Calendar() {
  const { t, nm } = useI18n();
  const { data, error, loading, reload } = useLoad(loadEnrollments, []);
  if (loading && !data) return <Loading />;
  if (error) return <Failed onRetry={reload} />;
  if (!data?.length) return <><h1>{t('calendar')}</h1><div className="empty">{t('nothing_yet')}</div></>;
  return (
    <>
      <h1>{t('calendar')}</h1>
      <div className="list" style={{ marginTop: 16 }}>
        {data.map(e => (
          <div key={e.id} className="card between">
            <span>
              <span className="name">{t('plan_of', e.athlete?.display_name || e.athlete_id.slice(0, 8), nm(e.program?.names))}</span>
              <span className="muted small" style={{ display: 'block' }}>
                {nm(e.location?.names)} · {t('starts').toLowerCase()} {e.start_date} · {t('occurrences', e.assignments?.[0]?.count ?? 0)}
              </span>
            </span>
            <button className="btn mini" type="button" onClick={() => e.program && go(`/program/${e.program.id}`)}>
              {t('resolved')}
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

import { useI18n } from '../lib/i18n';

export function Loading() {
  const { t } = useI18n();
  return <div className="empty">{t('loading')}</div>;
}

export function Failed({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <div className="error">
      {t('load_failed')} <button className="btn small" type="button" onClick={onRetry}>{t('retry')}</button>
    </div>
  );
}

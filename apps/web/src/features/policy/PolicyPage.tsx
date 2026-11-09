// [2026-11-09 02:25 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W4b (S031-18 / S031-24, chữ chốt PHASE-031 · 00 §13): màn Chính sách — một trang bốn tab
/**
 * CHÍNH SÁCH (Hệ thống). Năng lực Core, không phải module nghiệp vụ (D031-11). Bốn tab đọc API đã có: sổ đăng ký (W4a), hàng việc policy_review (W2c),
 * truy vết ngược (W4a), theo dõi thực hiện (W4a). Chỉ đọc và đóng việc xem; phát hành bản đi qua module chủ / API (W3a).
 * Đường dẫn sâu: ?xem=truy-vet&chung-tu=<docKey> để màn khác (truy vết chứng từ…) mở thẳng chuỗi chính sách căn cứ.
 */
import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { useReviewItems } from './api';
import { LineageTab } from './LineageTab';
import { RegistryTab } from './RegistryTab';
import { ReviewTab } from './ReviewTab';
import { TrackingTab } from './TrackingTab';

const TABS = [
  { key: 'chinh-sach', label: 'Chính sách' },
  { key: 'cho-xem', label: 'Chờ kế toán xem' },
  { key: 'truy-vet', label: 'Truy vết' },
  { key: 'theo-doi', label: 'Theo dõi thực hiện' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

export function PolicyPage() {
  const [sp, setSp] = useSearchParams();
  const tab: TabKey = TABS.some((t) => t.key === sp.get('xem')) ? (sp.get('xem') as TabKey) : 'chinh-sach';
  const doc = sp.get('chung-tu') ?? '';
  const review = useReviewItems();
  const go = (xem: TabKey, extra: Record<string, string> = {}) => setSp({ ...(xem === 'chinh-sach' ? {} : { xem }), ...extra }, { replace: true });
  const waiting = review.data?.items.length ?? 0;
  return (
    <div>
      <PageHeader title="Chính sách" subtitle="Chính sách nghiệp vụ đã phát hành có phiên bản, chứng từ đã áp, việc chờ kế toán xem và theo dõi thực hiện — một nguồn số cho cả bốn tab" />
      <div className="tabs" role="tablist" style={{ marginBottom: 10 }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => go(t.key)}>
            {t.label}{t.key === 'cho-xem' && waiting > 0 ? <span className="badge badge-warn" style={{ marginLeft: 6 }}>{waiting}</span> : null}
          </button>
        ))}
      </div>
      {tab === 'chinh-sach' && <RegistryTab />}
      {tab === 'cho-xem' && <ReviewTab onOpenLineage={(docRef) => go('truy-vet', { 'chung-tu': docRef })} />}
      {tab === 'truy-vet' && <LineageTab key={doc} initial={doc} />}
      {tab === 'theo-doi' && <TrackingTab />}
    </div>
  );
}

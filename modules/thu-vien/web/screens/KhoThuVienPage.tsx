/**
 * Kho thư viện (HT14, PHASE-030 · 26 §3) — bản B1 chỉ đọc: Tổng quan · Danh sách · Chi tiết thư viện.
 * Đọc API Core core.library.list / get / items / validate (docs/api/16-thu-vien.md). Số liệu sử dụng (qua / cảnh báo / chặn
 * theo module) có ở B2 — tab Tổng quan nói rõ chưa có, không vẽ số giả.
 */
import { useState } from 'react';
import { PageHeader } from '@bizcity/ui-kit';
import { OverviewTab } from './OverviewTab';
import { ListTab } from './ListTab';
import { DetailView } from './DetailView';

type Tab = 'tong-quan' | 'danh-sach' | 'chi-tiet';
const TABS: { key: Tab; label: string }[] = [
  { key: 'tong-quan', label: 'Tổng quan' },
  { key: 'danh-sach', label: 'Danh sách' },
  { key: 'chi-tiet', label: 'Chi tiết thư viện' },
];

export function KhoThuVienPage() {
  const [tab, setTab] = useState<Tab>('tong-quan');
  const [libId, setLibId] = useState<string | null>(null);
  const open = (id: string) => { setLibId(id); setTab('chi-tiet'); };
  return (
    <div>
      <PageHeader
        title="Kho thư viện"
        code="HT14"
        subtitle="Dữ liệu tham chiếu chung mọi đơn vị (tham số pháp lý, ngày nghỉ, mã chuẩn…): phiên bản, giá trị theo ngày, căn cứ, luật kiểm. Đơn vị chỉ đọc."
      />
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={`tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {tab === 'tong-quan' ? <OverviewTab onOpen={open} /> : tab === 'danh-sach' ? <ListTab onOpen={open} /> : <DetailView libId={libId} onPick={setLibId} />}
    </div>
  );
}

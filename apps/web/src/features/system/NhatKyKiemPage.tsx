// [2026-11-19 Nguyễn Văn Thủy] HT19 Nhật ký kiểm khai báo (docs/nghiep-vu/25 §3.5): mỗi lần lưu danh mục / chứng từ — đạt hay bị chặn,
// quy tắc chưa đạt, mã tra cứu; lọc theo mã lỗi, đối tượng, mã bản ghi, người (đóng góp)
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/PageHeader';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ErrorBox, Loading } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { ChiTietLoi, type DongLoi } from '@/components/ChiTietLoi';

type Row = { id: string; at: string; data: { entity: string; key: string; action: string; ok: boolean; draft?: boolean; source?: 'form' | 'server'; failed: { code: string; level: string; title: string; field?: string }[]; user: string; requestId?: string } };
const ENTITY: Record<string, string> = {
  'catalog/products': 'Mặt hàng', products: 'Mặt hàng', partners: 'Đối tượng (KH / NCC / NV)', 'item-classes': 'Nhóm hàng / phân loại', 'unit-names': 'Đơn vị tính',
  'warehouse-types': 'Loại kho', warehouses: 'Kho', 'org-units': 'Cơ cấu tổ chức', branches: 'Chi nhánh', accounts: 'Hệ thống tài khoản', 'bank-accounts': 'Tài khoản ngân hàng',
  'tax-codes': 'Biểu thuế', 'catalog/price-lists': 'Bảng giá', dimensions: 'Danh mục khác (khoản mục, hợp đồng…)', 'purchase/documents': 'Chứng từ mua hàng',
};
const nhan = (e: string) => (e.startsWith('man:') ? `Màn ${e.slice(4)}` : null) ?? ENTITY[e] ?? ENTITY[Object.keys(ENTITY).find((k) => e.startsWith(`${k}/`)) ?? ''] ?? e;
const ACTION: Record<string, string> = { create: 'Thêm', update: 'Sửa', delete: 'Xoá', validate: 'Kiểm thử', form: 'Bấm Ghi / Tiếp' };
const homNayTru = (n: number) => new Date(Date.now() - n * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);

export function NhatKyKiemPage() {
  const [p] = useSearchParams();
  const [from, setFrom] = useState(homNayTru(7));
  const [entity, setEntity] = useState(p.get('entity') ?? '');
  const [code, setCode] = useState(p.get('code') ?? '');
  const [find, setFind] = useState(p.get('tim') ?? '');
  const [onlyFailed, setOnlyFailed] = useState(p.get('loi') === '1');
  const [sel, setSel] = useState<Row | null>(null);
  const q = useQuery({ queryKey: ['validation-log', from, entity, code, onlyFailed], queryFn: () => api.get<Row[]>('/api/v1/validation-log', { from, entity: entity || undefined, code: code.trim() || undefined, onlyFailed: onlyFailed ? 1 : undefined }) });
  const t = find.trim().toLowerCase();
  const rows = (q.data ?? []).filter((r) => !t || `${r.data.key} ${r.data.user} ${r.data.requestId ?? ''}`.toLowerCase().includes(t));
  const dem = new Map<string, { code: string; title: string; n: number }>();
  for (const r of rows) for (const f of r.data.failed) { const k = `${f.code}|${f.title}`; const x = dem.get(k) ?? { code: f.code, title: f.title, n: 0 }; x.n++; dem.set(k, x); }
  const hay = [...dem.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  const columns: Column<Row>[] = [
    { key: 'at', header: 'Thời gian', width: 150, value: (r) => new Date(r.at).toLocaleString('vi-VN', { hour12: false }) },
    { key: 'entity', header: 'Đối tượng', width: 150, value: (r) => nhan(r.data.entity) },
    { key: 'source', header: 'Nguồn', width: 80, title: 'Form = form tự chặn trên trình duyệt (chưa gửi); Máy chủ = máy chủ từ chối / ghi nhận khi lưu', value: (r) => (r.data.source === 'form' ? 'Form' : 'Máy chủ') },
    { key: 'key', header: 'Mã bản ghi', type: 'code', width: 130, value: (r) => r.data.key },
    { key: 'action', header: 'Thao tác', width: 80, value: (r) => ACTION[r.data.action] ?? r.data.action },
    { key: 'ok', header: 'Kết quả', width: 110, value: (r) => (r.data.source === 'form' ? 'Form chặn' : !r.data.ok ? 'Bị chặn' : r.data.draft ? 'Lưu nháp' : r.data.failed.length ? 'Lưu, có nhắc' : 'Đạt'),
      render: (r) => <span className={`badge ${!r.data.ok ? 'badge-bad' : r.data.draft ? 'badge-warn' : r.data.failed.length ? 'badge-gray' : 'badge-ok'}`}>{r.data.source === 'form' ? 'Form chặn' : !r.data.ok ? 'Bị chặn' : r.data.draft ? 'Lưu nháp' : r.data.failed.length ? 'Lưu, có nhắc' : 'Đạt'}</span> },
    { key: 'failed', header: 'Quy tắc chưa đạt', width: 420, value: (r) => r.data.failed.map((f) => `${f.code}: ${f.title}`).join(' · '),
      render: (r) => <span title={r.data.failed.map((f) => `${f.code} (${f.level}): ${f.title}`).join('\n')}>{r.data.failed.map((f) => <span key={f.code} className="mono" style={{ marginRight: 6, color: f.level === 'block' ? 'var(--bad)' : undefined }}>{f.code}</span>)}{r.data.failed[0] ? <span className="muted"> {r.data.failed[0].title}</span> : null}</span> },
    { key: 'user', header: 'Người làm', width: 140, value: (r) => r.data.user },
    { key: 'requestId', header: 'Mã tra cứu', type: 'code', width: 160, title: 'Mã tra cứu của lần lưu — trùng mã tester chép từ màn hình; dev tìm log máy chủ (Loki / Tempo) theo mã này', value: (r) => r.data.requestId ?? '' },
  ];
  return (
    <>
      <PageHeader title="Nhật ký kiểm khai báo" code="HT19" helpKey="nhat-ky-kiem" subtitle="Mỗi lần lưu danh mục / chứng từ: đạt hay bị chặn, quy tắc nào chưa đạt, ai làm, mã tra cứu" />
      <div className="card">
        <div className="filters">
          <div className="field"><label>Từ ngày</label><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="field"><label>Đối tượng</label><select className="select input" value={entity} onChange={(e) => setEntity(e.target.value)}><option value="">Tất cả</option>{Object.entries(ENTITY).filter(([k]) => k !== 'products').map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="field"><label>Mã lỗi</label><input className="input mono" style={{ width: 150 }} placeholder="vd ITEM-BLOCK-003" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></div>
          <div className="field"><label>Tìm</label><input className="input" style={{ width: 240 }} placeholder="Mã bản ghi, người làm, mã tra cứu" value={find} onChange={(e) => setFind(e.target.value)} /></div>
          <label className="checkbox" style={{ alignSelf: 'flex-end' }}><input type="checkbox" checked={onlyFailed} onChange={(e) => setOnlyFailed(e.target.checked)} /> Chỉ lượt có lỗi / nhắc</label>
        </div>
        {hay.length > 0 && <div style={{ padding: '0 12px 8px' }}>
          <b style={{ fontSize: 12.5 }}>Lỗi hay gặp</b>
          <table className="mh-mini" style={{ marginTop: 4, maxWidth: 900 }}><tbody>{hay.map((h) => <tr key={`${h.code}|${h.title}`} style={{ cursor: 'pointer' }} title="Bấm để lọc theo mã này" onClick={() => setCode(h.code)}><td style={{ width: 70 }} className="num"><b>{h.n}</b> lần</td><td style={{ width: 140 }} className="mono">{h.code}</td><td>{h.title}</td></tr>)}</tbody></table>
        </div>}
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : <DataGrid storageKey="ht19-nhat-ky-kiem" exportName="nhat-ky-kiem-khai-bao" rows={rows} rowKey={(r) => r.id} columns={columns} onSelect={setSel} emptyText="Chưa có lượt lưu nào trong khoảng này" />}
        <div style={{ padding: '8px 12px' }}>{sel ? <><b style={{ fontSize: 12.5 }}>Chi tiết lần lỗi đang chọn</b><ChiTietLoi r={sel as unknown as DongLoi} /></> : <span className="muted" style={{ fontSize: 12 }}>Bấm một dòng để xem chi tiết cho dev (API, mã HTTP, câu gốc, vì sao / cách sửa, log máy chủ).</span>}</div>
      </div>
    </>
  );
}

// [2026-11-19 Nguyễn Văn Thủy] một nút "Mã lỗi" ở mỗi danh mục → hộp thoại 3 thẻ: Mã lỗi · Cài đặt · Lịch sử lỗi (thay hai nút sang màn HT09 / HT19 khó hiểu) (đóng góp)
/**
 * <NutQuyTac entity="item" logEntity="catalog/products" ten="mặt hàng" />
 *   entity    — nhóm quy tắc (item, partner, unit, bank, branch, group, account) → thẻ Mã lỗi / Cài đặt
 *   logEntity — đường dẫn API của danh mục (vd "catalog/products", "partners") → thẻ Lịch sử lỗi (nhật ký kiểm khai báo)
 */
import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ShieldAlert } from 'lucide-react';
import { Modal } from '@/components/ui';
import { api, errorText } from '@/lib/api';
import { boKiemForm, datBoKiemForm } from '@/lib/kiemForm';
import { ChiTietLoi, type DongLoi } from './ChiTietLoi';

type Rule = {
  code: string; level: 'block' | 'warn' | 'info' | 'guide'; effectiveLevel: string; okText: string | null; field: string | null; canLower: boolean; status: string;
  preview: { title: string; why: string; howTo?: string };
};
type LogRow = { id: string; at: string; data: { key: string; action: string; ok: boolean; draft?: boolean; source?: 'form' | 'server'; screen?: string; failed: { code: string; level: string; title: string }[]; user: string; requestId?: string } };

const MUC: Record<string, { text: string; cls: string }> = {
  block: { text: 'Chặn', cls: 'badge-bad' }, warn: { text: 'Cảnh báo', cls: 'badge-warn' }, info: { text: 'Nhắc', cls: 'badge-gray' }, guide: { text: 'Hướng dẫn', cls: 'badge-gray' },
};
const ACTION: Record<string, string> = { create: 'Thêm', update: 'Sửa', delete: 'Xoá', form: 'Bấm Ghi / Tiếp' };
const ngayTru = (n: number) => new Date(Date.now() - n * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);

export function NutQuyTac({ entity, logEntity, ten }: { entity: string; logEntity: string; ten: string }) {
  const [mo, setMo] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-sm" title={`Các mã lỗi khi khai báo ${ten}, cài đặt cảnh báo, lịch sử lỗi`} onClick={() => setMo(true)}><ShieldAlert size={14} /> Mã lỗi</button>
      {mo && <QuyTacModal entity={entity} logEntity={logEntity} ten={ten} onClose={() => setMo(false)} />}
    </>
  );
}

function QuyTacModal({ entity, logEntity, ten, onClose }: { entity: string; logEntity: string; ten: string; onClose: () => void }) {
  const [the, setThe] = useState<'ma' | 'cai-dat' | 'lich-su'>('ma');
  const rules = useQuery({ queryKey: ['catalog-rules', 'full', entity], queryFn: async () => (await api.get<{ items: Rule[] }>('/api/v1/catalog-rules', { entity })).items });
  const list = rules.data ?? [];
  return (
    <Modal wide title={`Mã lỗi — ${ten}`} onClose={onClose} footer={<button className="btn" onClick={onClose}>Đóng</button>}>
      <div className="tabs full" style={{ marginBottom: 8 }}>
        <button type="button" className={`tab ${the === 'ma' ? 'active' : ''}`} onClick={() => setThe('ma')}>Mã lỗi ({list.length})</button>
        <button type="button" className={`tab ${the === 'cai-dat' ? 'active' : ''}`} onClick={() => setThe('cai-dat')}>Cài đặt</button>
        <button type="button" className={`tab ${the === 'lich-su' ? 'active' : ''}`} onClick={() => setThe('lich-su')}>Lịch sử lỗi</button>
      </div>
      {rules.error && <div className="alert alert-bad full">{errorText(rules.error)}</div>}
      {the === 'ma' && <MaLoi list={list} />}
      {the === 'cai-dat' && <CaiDat list={list} entity={entity} />}
      {the === 'lich-su' && <LichSuLoi logEntity={logEntity} />}
    </Modal>
  );
}

function MaLoi({ list }: { list: Rule[] }) {
  const [tim, setTim] = useState('');
  const t = tim.trim().toLowerCase();
  const rows = list.filter((r) => !t || `${r.code} ${r.preview.title} ${r.preview.howTo ?? ''}`.toLowerCase().includes(t));
  return (
    <div className="full">
      <input className="input" style={{ width: 300, marginBottom: 6 }} placeholder="Tìm mã lỗi hoặc nội dung (vd ITEM-BLOCK-003, tên)" value={tim} onChange={(e) => setTim(e.target.value)} />
      <div className="scroll-box" style={{ maxHeight: 460 }}>
        <table className="mh-mini">
          <thead><tr><th style={{ width: 130 }}>Mã lỗi</th><th style={{ width: 85 }}>Mức</th><th>Báo khi</th><th>Cách sửa</th></tr></thead>
          <tbody>
            {rows.map((r) => { const m = MUC[r.effectiveLevel] ?? MUC[r.level]!; return (
              <tr key={r.code}>
                <td className="mono">{r.code}</td>
                <td><span className={`badge ${m.cls}`}>{m.text}</span></td>
                <td title={r.preview.why}>{r.preview.title}</td>
                <td className="muted" style={{ fontSize: 12 }}>{r.preview.howTo ?? ''}</td>
              </tr>); })}
            {!rows.length && <tr><td colSpan={4} className="muted">Không có mã nào khớp.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 6 }}><b>Chặn</b>: không lưu được tới khi sửa. <b>Cảnh báo</b>: lưu được nhưng phải ghi lý do. <b>Nhắc</b>: chỉ báo cho biết. Rê chuột vào câu báo để xem vì sao.</div>
    </div>
  );
}

function CaiDat({ list }: { list: Rule[]; entity: string }) {
  const qc = useQueryClient();
  const [lyDo, setLyDo] = useState<Record<string, string>>({});
  const [loi, setLoi] = useState('');
  const doi = useMutation({
    mutationFn: (x: { code: string; decision: 'lower' | 'unlower'; note: string }) => api.post(`/api/v1/catalog-rules/${x.code}/review`, { decision: x.decision, note: x.note }),
    onSuccess: () => { setLoi(''); void qc.invalidateQueries({ queryKey: ['catalog-rules'] }); void qc.invalidateQueries({ queryKey: ['catalog-why'] }); },
    onError: (e) => setLoi(errorText(e)),
  });
  const [boForm, setBoForm] = useState(boKiemForm());
  const warns = list.filter((r) => r.level === 'warn');
  const blocks = list.filter((r) => r.level === 'block');
  return (
    <div className="full">
      {loi && <div className="alert alert-bad" style={{ marginBottom: 6 }}>{loi}</div>}
      <h4 className="mh-h4">Kiểm ở form (máy này)</h4>
      <label className="checkbox" style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <input type="checkbox" checked={!boForm} onChange={(e) => { datBoKiemForm(!e.target.checked); setBoForm(!e.target.checked); }} />
        <span><b>{boForm ? 'Đang tắt' : 'Đang bật'}</b> — bật: form báo thiếu / sai ngay trên màn, chưa gửi đi. Tắt: form gửi thẳng, <b>máy chủ tự kiểm</b> và trả mã lỗi đầy đủ (dùng khi test). Chỉ áp cho trình duyệt trên máy này; lỗi dù ở form hay máy chủ đều ghi vào Lịch sử lỗi.</span>
      </label>
      <h4 className="mh-h4">Cảnh báo — bật thì khi lưu phải ghi lý do, tắt thì chỉ nhắc</h4>
      <table className="mh-mini" style={{ marginBottom: 12 }}>
        <thead><tr><th style={{ width: 130 }}>Mã lỗi</th><th>Báo khi</th><th style={{ width: 110 }}>Bắt ghi lý do</th><th style={{ width: 260 }} /></tr></thead>
        <tbody>
          {warns.map((r) => { const bat = r.effectiveLevel === 'warn'; return (
            <tr key={r.code}>
              <td className="mono">{r.code}</td><td>{r.preview.title}</td>
              <td><label className="checkbox"><input type="checkbox" checked={bat} disabled={doi.isPending}
                onChange={() => { if (bat && (lyDo[r.code] ?? '').trim().length < 5) { setLoi(`Muốn tắt ${r.code}: ghi lý do (ít nhất 5 ký tự) ở ô bên cạnh rồi bỏ tích.`); return; } doi.mutate({ code: r.code, decision: bat ? 'lower' : 'unlower', note: bat ? lyDo[r.code]!.trim() : 'Bật lại cảnh báo' }); }} /> {bat ? 'Bật' : 'Tắt'}</label></td>
              <td>{bat && <input className="input" style={{ height: 26 }} placeholder="Muốn tắt: ghi lý do (≥ 5 ký tự)" value={lyDo[r.code] ?? ''} onChange={(e) => setLyDo({ ...lyDo, [r.code]: e.target.value })} />}</td>
            </tr>); })}
          {!warns.length && <tr><td colSpan={4} className="muted">Danh mục này không có cảnh báo nào.</td></tr>}
        </tbody>
      </table>
      <h4 className="mh-h4">Chặn — luôn bật (giữ đúng sổ sách, không tắt được)</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '2px 16px', fontSize: 12.5 }}>{blocks.map((r) => <div key={r.code}><span className="mono muted">{r.code}</span> {r.okText ?? r.preview.title}</div>)}</div>
      <div className="muted" style={{ fontSize: 12, marginTop: 10 }}>Mỗi lần bật / tắt đều ghi nhật ký. Sửa câu chữ của từng mã: Hệ thống › Quy định dữ liệu danh mục (HT09).</div>
    </div>
  );
}

function LichSuLoi({ logEntity }: { logEntity: string }) {
  const [tu, setTu] = useState(ngayTru(30));
  const [chiLoi, setChiLoi] = useState(true);
  const [daChep, setDaChep] = useState('');
  const [xem, setXem] = useState('');
  const entities = `${logEntity},man:${window.location.pathname}`;
  const q = useQuery({ queryKey: ['validation-log', entities, tu, chiLoi], queryFn: () => api.get<LogRow[]>('/api/v1/validation-log', { entity: entities, from: tu, onlyFailed: chiLoi ? 1 : undefined, limit: 2000 }) });
  const chep = (r: LogRow) => {
    const text = [`Màn: ${document.title}`, `Lúc: ${new Date(r.at).toLocaleString('vi-VN', { hour12: false })}`, `Bản ghi: ${r.data.key} (${ACTION[r.data.action] ?? r.data.action})`,
      ...r.data.failed.map((f) => `- ${f.code}: ${f.title}`), r.data.requestId ? `Mã tra cứu: ${r.data.requestId}` : ''].filter(Boolean).join('\n');
    void navigator.clipboard?.writeText(text); setDaChep(r.id); setTimeout(() => setDaChep(''), 1500);
  };
  const rows = q.data ?? [];
  // Lỗi hay gặp: đếm theo mã + câu báo trong khoảng đang xem.
  const dem = new Map<string, { code: string; title: string; n: number }>();
  for (const r of rows) for (const f of r.data.failed) { const k = `${f.code}|${f.title}`; const x = dem.get(k) ?? { code: f.code, title: f.title, n: 0 }; x.n++; dem.set(k, x); }
  const hay = [...dem.values()].sort((a, b) => b.n - a.n).slice(0, 5);
  return (
    <div className="full">
      <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 6 }}>
        <label>Từ ngày <input className="input" type="date" style={{ width: 150 }} value={tu} onChange={(e) => setTu(e.target.value)} /></label>
        <label className="checkbox"><input type="checkbox" checked={chiLoi} onChange={(e) => setChiLoi(e.target.checked)} /> Chỉ lần có lỗi</label>
        <span className="muted" style={{ fontSize: 12 }}>{rows.length} lần</span>
      </div>
      {hay.length > 0 && <div style={{ marginBottom: 8 }}>
        <b style={{ fontSize: 12.5 }}>Lỗi hay gặp</b>
        <table className="mh-mini" style={{ marginTop: 4 }}><tbody>{hay.map((h) => <tr key={`${h.code}|${h.title}`}><td style={{ width: 60 }} className="num"><b>{h.n}</b> lần</td><td style={{ width: 130 }} className="mono">{h.code}</td><td>{h.title}</td></tr>)}</tbody></table>
      </div>}
      <div className="scroll-box" style={{ maxHeight: 400 }}>
        <table className="mh-mini">
          <thead><tr><th style={{ width: 140 }}>Lúc</th><th style={{ width: 70 }}>Nguồn</th><th style={{ width: 110 }}>Bản ghi</th><th style={{ width: 60 }}>Việc</th><th style={{ width: 90 }}>Kết quả</th><th>Lỗi</th><th style={{ width: 110 }}>Người làm</th><th style={{ width: 120 }} /></tr></thead>
          <tbody>
            {rows.map((r) => (<Fragment key={r.id}>
              <tr>
                <td style={{ fontSize: 12 }}>{new Date(r.at).toLocaleString('vi-VN', { hour12: false })}</td>
                <td style={{ fontSize: 12 }} title={r.data.source === 'form' ? 'Form tự chặn trên trình duyệt, chưa gửi máy chủ' : 'Máy chủ từ chối khi lưu'}>{r.data.source === 'form' ? 'Form' : 'Máy chủ'}</td>
                <td className="mono">{r.data.key}</td>
                <td>{ACTION[r.data.action] ?? r.data.action}</td>
                <td><span className={`badge ${!r.data.ok ? 'badge-bad' : r.data.draft ? 'badge-warn' : r.data.failed.length ? 'badge-gray' : 'badge-ok'}`}>{r.data.source === 'form' ? 'Form chặn' : !r.data.ok ? 'Không lưu được' : r.data.draft ? 'Lưu nháp' : r.data.failed.length ? 'Lưu, có nhắc' : 'Đạt'}</span></td>
                <td style={{ fontSize: 12.5 }}>{r.data.failed.map((f, i) => <div key={i}><span className="mono" style={{ color: f.level === 'block' ? 'var(--bad)' : undefined }}>{f.code}</span> {f.title}</div>)}</td>
                <td style={{ fontSize: 12 }}>{r.data.user}</td>
                <td style={{ whiteSpace: 'nowrap' }}><button type="button" className="btn btn-xs" title="Xem chi tiết cho dev: API, mã HTTP, câu gốc, vì sao / cách sửa, log máy chủ" onClick={() => setXem(xem === r.id ? '' : r.id)}>{xem === r.id ? 'Ẩn' : 'Xem'}</button>{' '}
                  <button type="button" className="btn btn-xs" title={`Chép để báo lỗi (mã tra cứu ${r.data.requestId ?? ''})`} onClick={() => chep(r)}><Copy size={12} /> {daChep === r.id ? 'Đã chép' : 'Chép'}</button></td>
              </tr>
              {xem === r.id && <tr><td colSpan={8}><ChiTietLoi r={r as unknown as DongLoi} /></td></tr>}
            </Fragment>))}
            {!q.isLoading && !rows.length && <tr><td colSpan={8} className="muted">Chưa có lần lưu nào bị lỗi trong khoảng này.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

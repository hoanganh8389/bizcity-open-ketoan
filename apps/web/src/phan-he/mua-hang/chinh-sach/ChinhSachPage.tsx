/**
 * CHÍNH SÁCH MUA HÀNG (MH04) — BẢNG TỔNG mọi chính sách của mọi NCC: STT, NCC, loại, nội dung bằng chữ, phạm vi, hiệu lực,
 * trạng thái, người tạo / ngày giờ tạo, người sửa / ngày giờ sửa. Lọc, sắp xếp từng cột, xuất Excel; mới nhất lên đầu, dòng
 * vừa ghi tô sáng. Khai báo thường ngày làm ở Hồ sơ nhà cung cấp (mỗi NCC một nơi); bảng này để rà soát và xuất báo cáo
 * Báo cáo trải từng dòng ưu đãi (từng mã, từng bậc, từng chi nhánh) là màn riêng MH14 — ChiTietChinhSachPage.
 * Bộ máy: MỘT bảng purchase_policies — phiếu tự chọn chính sách khớp nhất (phạm vi hẹp hơn thắng, rồi tới ưu tiên).
 */
import { useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { POLICY_LABEL, STACK_KINDS, canRepeat, giftFlags, isRepeat, type Policy, type PolicyKind } from '@ketoan/contracts/mua-hang';
import { PageHeader } from '@/components/PageHeader';
import { Loading } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { PartnerPicker } from '@/components/pickers';
import { useQuery } from '@tanstack/react-query';
import { KIND_HINT, ruleText } from './quyTac';
import { logSummary } from '../thanh-phan/LichSu';
import { ALL_KINDS, PolicyForm, newPolicy } from './PolicyForm';
import { purchaseApi, today, useMuaHang, useNames, type LogRow } from '../du-lieu';
import { dmy } from '../chung';
import '../mua-hang.css';

type Row = Policy & { stt: number; state: string };
/** Cách áp / cộng dồn của một chính sách: ô tích (chỉ đọc) cho quen mắt; loại không có lựa chọn này thì gạch ngang. */
// Mua X tặng Y nhiều dòng: tất cả dòng / không dòng nào / "theo dòng" (một số dòng).
const flagOf = (n: number, rows: number, all: string, none: string) => (!rows ? '' : n === rows ? all : !n ? none : 'Theo dòng');
const apRieng = (p: Policy) => (p.kind === 'promo_gift' ? flagOf(giftFlags(p).exclusive, giftFlags(p).rows, 'Áp riêng', 'Áp đồng thời') : STACK_KINDS.includes(p.kind) ? (p.rule.apply === 'exclusive' ? 'Áp riêng' : 'Áp đồng thời') : '');
const congDon = (p: Policy) => (p.kind === 'promo_gift' ? flagOf(giftFlags(p).repeat, giftFlags(p).rows, 'Cộng dồn', 'Một lần') : canRepeat(p) ? (isRepeat(p) ? 'Cộng dồn' : 'Một lần') : '');
const Tick = ({ v, on, title }: { v: string; on: string; title: string }) => (!v ? <span className="muted" title="Loại chính sách này không có lựa chọn này">—</span>
  : v === 'Theo dòng' ? <span title="Một số dòng có, một số không — mở chính sách xem từng dòng" style={{ fontSize: 11.5 }}>◪ theo dòng</span>
  : <input type="checkbox" checked={v === on} readOnly tabIndex={-1} title={title} style={{ pointerEvents: 'none' }} />);
const stamp = (iso?: string) => (iso ? new Date(iso).toLocaleString('vi-VN', { hour12: false }) : '');

export function ChinhSachPage() {
  const { data, isLoading, refresh } = useMuaHang();
  const names = useNames();
  const [params, setParams] = useSearchParams();
  const [kind, setKind] = useState<PolicyKind | ''>((params.get('loai') as PolicyKind) ?? '');
  const [partner, setPartner] = useState(params.get('ncc') ?? '');
  const [state, setState] = useState('');
  const [apply, setApply] = useState('');
  const [repeat, setRepeat] = useState('');
  const [hint, setHint] = useState(false);
  const [editing, setEditing] = useState<Policy | null>(null);
  const [justSaved, setJustSaved] = useState('');
  const now = today();
  // Thay đổi gần nhất của từng chính sách (nhật ký: ai, lúc nào, đổi gì).
  const logs = useQuery({ queryKey: ['mua-hang', 'history', 'policies'], queryFn: () => purchaseApi.history({}) });
  const lastLog = useMemo(() => { const m = new Map<string, LogRow>(); for (const l of logs.data ?? []) if ((l.event === 'policy_changed' || l.event === 'policy_created') && !m.has(l.docNo)) m.set(l.docNo, l); return m; }, [logs.data]);
  const stateOf = (p: Policy) => (!p.isActive ? 'Tắt' : p.validTo && p.validTo < now ? 'Hết hiệu lực' : p.validFrom && p.validFrom > now ? 'Chưa tới hiệu lực' : 'Đang áp');
  const rows: Row[] = useMemo(() => (data?.policies ?? [])
    .filter((p) => (!kind || p.kind === kind) && (!partner || p.scope.partnerCode === partner) && (!state || stateOf(p) === state)
      && (!apply || apRieng(p) === apply) && (!repeat || congDon(p) === repeat))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || b.code.localeCompare(a.code))
    .map((p, i) => ({ ...p, stt: i + 1, state: stateOf(p) })), [data, kind, partner, state, apply, repeat]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns: Column<Row>[] = [
    { key: 'stt', header: 'STT', type: 'number', width: 50 },
    { key: 'apRieng', header: 'Áp riêng', width: 72, value: apRieng, render: (r) => <Tick v={apRieng(r)} on="Áp riêng" title={apRieng(r) === 'Áp riêng' ? 'Áp riêng: mã nhận chương trình này thì không nhận chương trình khác' : 'Áp đồng thời: cộng với các chương trình khác'} /> },
    { key: 'congDon', header: 'Cộng dồn', width: 76, value: congDon, render: (r) => <Tick v={congDon(r)} on="Cộng dồn" title={congDon(r) === 'Cộng dồn' ? 'Cộng dồn: đủ điều kiện mấy lần hưởng mấy lần' : 'Chỉ hưởng một lần'} /> },
    { key: 'partnerCode', header: 'Mã NCC', type: 'code', width: 100, value: (r) => r.scope.partnerCode ?? '', render: (r) => r.scope.partnerCode ? <Link to={`/mua-hang/nha-cung-cap/${encodeURIComponent(r.scope.partnerCode)}`}>{r.scope.partnerCode}</Link> : <span className="muted">Mọi NCC</span> },
    { key: 'partnerName', header: 'Tên NCC', width: 230, value: (r) => (r.scope.partnerCode ? names.partnerName(r.scope.partnerCode) : ''), render: (r) => (r.scope.partnerCode ? <span title={names.partnerName(r.scope.partnerCode)}>{names.partnerName(r.scope.partnerCode)}</span> : null) },
    { key: 'partnerTax', header: 'MST NCC', type: 'code', width: 110, value: (r) => (r.scope.partnerCode ? names.partner(r.scope.partnerCode)?.taxCode ?? '' : '') },
    { key: 'partnerPhone', header: 'SĐT NCC', type: 'code', width: 110, value: (r) => (r.scope.partnerCode ? names.partner(r.scope.partnerCode)?.phone ?? '' : '') },
    { key: 'partnerAddress', header: 'Địa chỉ NCC', width: 220, value: (r) => (r.scope.partnerCode ? names.partner(r.scope.partnerCode)?.address ?? '' : ''), render: (r) => <span title={r.scope.partnerCode ? names.partner(r.scope.partnerCode)?.address ?? '' : ''}>{r.scope.partnerCode ? names.partner(r.scope.partnerCode)?.address : ''}</span> },
    { key: 'kind', header: 'Loại chính sách', width: 170, value: (r) => POLICY_LABEL[r.kind] },
    { key: 'content', header: 'Nội dung', width: 360, value: (r) => ruleText(r) },
    { key: 'scope', header: 'Phạm vi khác', width: 150, value: (r) => [r.scope.brandCode && `Nhãn ${r.scope.brandCode}`, r.scope.sku && `Mã ${r.scope.sku}`, r.scope.branchCode && names.branchName(r.scope.branchCode)].filter(Boolean).join(' · ') },
    { key: 'validFrom', header: 'Hiệu lực từ', width: 90, value: (r) => dmy(r.validFrom) },
    { key: 'validTo', header: 'Đến', width: 90, value: (r) => dmy(r.validTo) },
    { key: 'state', header: 'Trạng thái', width: 110, render: (r) => <span className={`badge ${r.state === 'Đang áp' ? 'badge-ok' : r.state === 'Hết hiệu lực' ? 'badge-warn' : 'badge-gray'}`}>{r.state}</span>, value: (r) => r.state },
    { key: 'code', header: 'Mã chính sách', type: 'code', width: 150 },
    { key: 'name', header: 'Tên', width: 260 },
    { key: 'createdBy', header: 'Người tạo', width: 110 },
    { key: 'createdAt', header: 'Ngày giờ tạo', width: 140, value: (r) => stamp(r.createdAt) },
    { key: 'updatedBy', header: 'Người sửa', width: 110 },
    { key: 'updatedAt', header: 'Ngày giờ sửa', width: 140, value: (r) => stamp(r.updatedAt) },
    { key: 'lastChange', header: 'Thay đổi gần nhất (đổi gì)', width: 360, value: (r) => { const l = lastLog.get(r.code); return l ? `${l.event === 'policy_created' ? 'Tạo' : 'Sửa'} bởi ${l.user} ${stamp(l.ts)}: ${logSummary(l)}` : ''; } },
  ];

  // Đường dẫn cũ ?xem=bao-cao → màn báo cáo chi tiết riêng (MH14).
  if (params.get('xem') === 'bao-cao') return <Navigate to="/mua-hang/chi-tiet-chinh-sach" replace />;
  return (
    <>
      <PageHeader title="Chính sách mua hàng" code="MH04" helpKey="mua-hang-chinh-sach"
        subtitle="Bảng tổng mọi chính sách của mọi nhà cung cấp (mỗi chính sách một dòng) — khai báo thường ngày làm ở Hồ sơ nhà cung cấp; xem từng dòng ưu đãi ở Báo cáo chi tiết (MH14)" />
      <div className="card">
        <div className="row" style={{ gap: 8, padding: '8px 12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ width: 260 }}><PartnerPicker value={partner} onChange={(c) => { setPartner(c); setParams((x) => { const n = new URLSearchParams(x); if (c) n.set('ncc', c); else n.delete('ncc'); return n; }, { replace: true }); }} placeholder="Lọc theo nhà cung cấp" /></div>
          <select className="select input" style={{ width: 230 }} value={kind} onChange={(e) => setKind(e.target.value as PolicyKind | '')}><option value="">Mọi loại chính sách</option>{ALL_KINDS.map((k) => <option key={k} value={k}>{POLICY_LABEL[k]}</option>)}</select>
          <select className="select input" style={{ width: 215 }} value={apply} onChange={(e) => setApply(e.target.value)} title="Áp riêng: mã nhận chương trình thì không nhận chương trình khác; áp đồng thời: cộng với các chương trình khác"><option value="">Áp riêng / đồng thời: tất cả</option><option value="Áp riêng">☑ Áp riêng</option><option value="Áp đồng thời">☐ Áp đồng thời</option><option value="Theo dòng">◪ Theo dòng</option></select>
          <select className="select input" style={{ width: 175 }} value={repeat} onChange={(e) => setRepeat(e.target.value)} title="Cộng dồn: đủ điều kiện mấy lần hưởng mấy lần (mua X tặng Y, CK số tiền có mức tổng đơn)"><option value="">Cộng dồn: tất cả</option><option value="Cộng dồn">☑ Cộng dồn</option><option value="Một lần">☐ Chỉ một lần</option><option value="Theo dòng">◪ Theo dòng</option></select>
          <select className="select input" style={{ width: 170 }} value={state} onChange={(e) => setState(e.target.value)}><option value="">Mọi trạng thái</option><option>Đang áp</option><option>Hết hiệu lực</option><option>Chưa tới hiệu lực</option><option>Tắt</option></select>
          {<button className="btn btn-sm btn-primary" onClick={() => setEditing(newPolicy(kind || 'trade_discount', partner ? { partnerCode: partner } : {}))}>+ Thêm chính sách</button>}
          <span className="muted" style={{ fontSize: 12 }}>{rows.length} chính sách · mới nhất ở trên · bấm đúp để xem / sửa</span>
          {partner && <Link className="btn btn-sm" to={`/mua-hang/nha-cung-cap/${encodeURIComponent(partner)}`}>Mở hồ sơ NCC →</Link>}
          <Link className="btn btn-sm" to="/mua-hang/chi-tiet-chinh-sach" title="Trải từng dòng ưu đãi: từng mã hàng, từng bậc, từng chi nhánh">Xem chi tiết từng dòng (MH14) →</Link>
          <button type="button" className="btn btn-sm" onClick={() => setHint(!hint)}>{hint ? 'Ẩn' : 'Xem'} ý nghĩa các loại</button>
        </div>
        {kind && !hint && <div className="alert alert-info" style={{ margin: '0 12px 8px', fontSize: 12.5 }}><b>{POLICY_LABEL[kind]}:</b> {KIND_HINT[kind]}</div>}
        {hint && <YNghia counts={data?.policies ?? []} onPick={(k) => { setKind(k); setHint(false); }} />}
        {isLoading || !data ? <Loading /> : (
          <DataGrid storageKey="mh-chinh-sach-v3" exportName="chinh-sach-mua-hang" exportTitle="CHÍNH SÁCH MUA HÀNG"
            rows={rows} rowKey={(r) => r.id} columns={columns} onRowDoubleClick={(r) => setEditing(r)}
            rowClassName={(r) => `${r.code === justSaved ? 'mh-row-new' : ''} ${r.state === 'Đang áp' ? '' : 'muted'}`} footerLabel={false} emptyText="Chưa có chính sách khớp bộ lọc" />
        )}
      </div>
      {editing && <PolicyForm value={editing} all={data?.policies ?? []} onClose={() => setEditing(null)} onSaved={(code, stay) => { if (!stay) setEditing(null); setJustSaved(code); void refresh(); }} />}
    </>
  );
}

/** Bảng ý nghĩa từng loại chính sách + hai ô tích Áp riêng / Cộng dồn; bấm một loại là lọc theo loại đó. */
function YNghia({ counts, onPick }: { counts: Policy[]; onPick: (k: PolicyKind) => void }) {
  return (
    <div className="card" style={{ margin: '0 12px 8px', padding: 10 }}>
      <table className="mh-mini" style={{ width: '100%' }}>
        <thead><tr><th style={{ width: 200 }}>Loại chính sách</th><th>Ý nghĩa</th><th style={{ width: 80 }} title="Có ô tích Áp riêng không">Áp riêng</th><th style={{ width: 150 }} title="Có ô tích Cộng dồn không">Cộng dồn</th><th className="num" style={{ width: 70 }}>Số CS</th></tr></thead>
        <tbody>
          {ALL_KINDS.map((k) => (
            <tr key={k} style={{ cursor: 'pointer' }} onClick={() => onPick(k)} title="Bấm để lọc theo loại này">
              <td><b>{POLICY_LABEL[k]}</b></td><td style={{ fontSize: 12.5 }}>{KIND_HINT[k]}</td>
              <td>{STACK_KINDS.includes(k) ? 'có' : <span className="muted">—</span>}</td>
              <td>{k === 'promo_gift' ? 'có (mặc định tích)' : k === 'trade_discount' ? 'CK số tiền có mức tổng đơn' : <span className="muted">—</span>}</td>
              <td className="num">{counts.filter((p) => p.kind === k).length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
        <b>☑ Áp riêng</b>: mã hàng nhận chương trình này thì không nhận chương trình chiết khấu / khuyến mại nào khác (mã khác vẫn áp). <b>☐</b> = áp đồng thời, cộng với các chương trình khác.<br />
        <b>☑ Cộng dồn</b>: đủ điều kiện mấy lần hưởng mấy lần — mua 2 tặng 1 thì mua 4 tặng 2; giảm 2 triệu khi đơn từ 50 triệu thì đơn 100 triệu giảm 4 triệu. <b>☐</b> = chỉ hưởng một lần.<br />
        "—": loại đó không có lựa chọn này (CK %, bậc SL, CK theo mã vốn tính theo tiền / từng ĐVT; thưởng, hạn mức… không tính trên từng phiếu).
      </div>
    </div>
  );
}

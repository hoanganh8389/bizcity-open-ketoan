// [2026-11-21 Nguyễn Văn Thủy] Báo cáo theo hợp đồng / chính sách mua hàng: MH32 thực hiện chính sách, MH33 chính sách theo hợp đồng,
// MH34 đối chiếu giá theo hợp đồng, MH35 thực hiện hợp đồng — hợp đồng xuyên suốt, "không theo hợp đồng" là một nhóm riêng (đóng góp)
/**
 * Bốn báo cáo dùng chung bảng tham số (FilterLayout — như các sổ / báo cáo khác: ngăn kéo "Chọn tham số" hoặc ghim bên trái, bộ tham số đã lưu):
 *   kỳ (từ – đến), nhà cung cấp, hợp đồng (mọi / không theo hợp đồng / từng hợp đồng), chi nhánh (danh sách / cây) + mã kho; MH34 thêm nhóm hàng.
 *   Mọi tham số nằm trên địa chỉ trang (from, to, ncc, hd, cn, kho) nên chuyển sang báo cáo liên kết giữ nguyên.
 *   MH32  Tình hình thực hiện chính sách: tổng theo NCC · hợp đồng → từng chính sách (doanh số đủ điều kiện, được hưởng, đã nhận, còn nhận)
 *         → bấm một chính sách xem cách tính và từng chứng từ (mở được phiếu).
 *   MH33  Tổng hợp chính sách theo hợp đồng: hợp đồng nào có chính sách gì, phạm vi, điều kiện kích hoạt, hiệu lực.
 *   MH34  Đối chiếu giá mua theo hợp đồng: giá thoả thuận ↔ giá trên phiếu nhập (chưa thuế), chỉ dòng lệch hoặc tất cả.
 *   MH35  Tình hình thực hiện hợp đồng: giá trị, đã đặt, đã nhận, đã trả, còn nợ, tiến độ.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { POLICY_LABEL, scopeBranches, type Policy } from '@bizcity/mua-hang-domain';
import { PageHeader } from '@/components/PageHeader';
import { DataGrid, type Column } from '@/components/DataGrid';
import { BranchSelect } from '@/components/filters';
import { FilterLayout, SideField, SideKy } from '@/components/ReportPanel';
import { ChonNhomHang, useLocNhomHang } from '@/components/CayNhomHang';
import { ErrorBox, Loading } from '@/components/ui';
import { ListPicker, PartnerPicker } from '@/components/pickers';
import { api, errorText } from '@/lib/api';
import { P, purchaseApi, today, useMuaHang, useNames, vnd, type ContractRow } from '../du-lieu';
import { ruleText } from '../chinh-sach/quyTac';
import { dmy } from '../chung';
import '../mua-hang.css';

/** Giá trị ô hợp đồng: '' = mọi hợp đồng, '-' = không theo hợp đồng, còn lại = số hợp đồng. */
const KHONG_HD = '-';
const hdParam = (hd: string) => (hd === KHONG_HD ? '' : hd || undefined);
const hdText = (c?: string) => (c ? c : 'Không theo HĐ');
const hdCell = (c?: string): ReactNode => (c ? <span className="mono">{c}</span> : <span className="muted">không theo HĐ</span>);

/** Các báo cáo liên kết — chuyển qua lại giữ nguyên bộ lọc (kỳ, NCC, hợp đồng) trên địa chỉ trang. */
const LIEN_KET: [string, string, string][] = [
  ['/mua-hang/thuc-hien-hop-dong', 'MH35', 'Thực hiện hợp đồng'], ['/mua-hang/thuc-hien-chinh-sach', 'MH32', 'Thực hiện chính sách'],
  ['/mua-hang/chinh-sach-theo-hop-dong', 'MH33', 'Chính sách theo hợp đồng'], ['/mua-hang/doi-chieu-gia-hop-dong', 'MH34', 'Đối chiếu giá'], ['/mua-hang/cong-no-hop-dong', 'MH30', 'Công nợ theo hợp đồng'],
];
function useBoLoc(defaultFrom = `${today().slice(0, 4)}-01-01`) {
  const [sp, setSp] = useSearchParams();
  const from = sp.get('from') || defaultFrom, to = sp.get('to') || today(), ncc = sp.get('ncc') ?? '', hd = sp.has('hd') ? (sp.get('hd') || KHONG_HD) : '';
  const cn = sp.get('cn') ?? '', kho = sp.get('kho') ?? '', nhom = sp.get('nhom') ?? '';
  const dat = (x: Record<string, string>) => { const n = new URLSearchParams(sp); for (const [k, v] of Object.entries(x)) { if (v) n.set(k, v); else n.delete(k); } setSp(n, { replace: true }); };
  const setNcc = (v: string) => dat({ ncc: v, hd: '' });
  const setHd = (v: string) => { const n = new URLSearchParams(sp); if (!v) n.delete('hd'); else n.set('hd', v === KHONG_HD ? '' : v); setSp(n, { replace: true }); };
  const contracts = useQuery({ queryKey: ['mua-hang', 'contracts', ''], queryFn: () => purchaseApi.contracts(), staleTime: 60_000 }).data ?? [];
  const here = typeof window !== 'undefined' ? window.location.pathname : '';
  const qs = () => { const n = new URLSearchParams(); if (from) n.set('from', from); if (to) n.set('to', to); if (ncc) n.set('ncc', ncc); if (hd) n.set('hd', hd === KHONG_HD ? '' : hd); if (cn) n.set('cn', cn); if (kho) n.set('kho', kho); if (nhom) n.set('nhom', nhom); return n.toString(); };
  const lienKet = (
    <div className="row" style={{ gap: 4, padding: '6px 12px 0', flexWrap: 'wrap', alignItems: 'center', fontSize: 12.5 }} title="Chuyển sang báo cáo khác, giữ nguyên kỳ / NCC / hợp đồng đang lọc">
      <span className="muted">Xem cùng bộ lọc:</span>
      {LIEN_KET.filter(([path]) => !here.endsWith(path)).map(([path, code, label]) => <Link key={path} className="btn btn-xs" to={`${path}?${path.endsWith('cong-no-hop-dong') ? (hd && hd !== KHONG_HD ? `hd=${encodeURIComponent(hd)}` : '') : qs()}`}>{label} <span className="muted mono" style={{ fontSize: 10 }}>{code}</span></Link>)}
    </div>
  );
  /** Thanh trên báo cáo: liên kết sang báo cáo khác + các nút lọc nhanh của riêng màn (tình trạng, chỉ dòng lệch…). */
  const bar = (extra?: ReactNode) => (
    <>{lienKet}{extra && <div className="row" style={{ gap: 8, padding: '8px 12px', alignItems: 'center', flexWrap: 'wrap' }}>{extra}</div>}</>
  );
  /** Bảng tham số chung (ngăn kéo / ghim trái): kỳ · NCC · hợp đồng · chi nhánh (danh sách / cây) + mã kho · nhóm hàng (tuỳ màn). */
  const khung = (o: { coKy?: boolean; coNhom?: boolean; coKho?: boolean }, children: ReactNode) => (
    <FilterLayout filters={<>
      {o.coKy !== false && <SideKy from={from} to={to} onChange={(a, b) => dat({ from: a, to: b })} />}
      <SideField label="Nhà cung cấp"><PartnerPicker value={ncc} kind="supplier" onChange={(c) => { const n = new URLSearchParams(sp); if (c) n.set('ncc', c); else n.delete('ncc'); n.delete('hd'); setSp(n, { replace: true }); }} placeholder="Tất cả nhà cung cấp" /></SideField>
      <SideField label="Hợp đồng">
        <span title="Hợp đồng xuyên suốt: chọn một hợp đồng, hoặc 'Không theo hợp đồng' để xem riêng phần ngoài hợp đồng" style={{ display: 'block' }}>
          <ListPicker items={[{ code: KHONG_HD, name: 'Không theo hợp đồng' }, ...contracts.filter((c) => !ncc || c.partnerCode === ncc).map((c) => ({ code: c.code, name: `${c.partnerName} · ${c.statusText}` }))]} value={hd} onChange={setHd} placeholder="Mọi hợp đồng" />
        </span>
      </SideField>
      <BranchSelect value={cn} onChange={(v) => dat({ cn: v })} warehouses={o.coKho === false ? undefined : { value: kho, onChange: (v) => dat({ kho: v }) }} />
      {o.coNhom && <ChonNhomHang value={nhom} onChange={(v) => dat({ nhom: v })} />}
    </>}>{children}</FilterLayout>
  );
  /** Tham số gửi máy chủ. */
  const thamSo = { from, to, partnerCode: ncc || undefined, contractCode: hdParam(hd), branchCodes: cn || undefined, warehouseCodes: kho || undefined };
  return { from, to, ncc, hd, cn, kho, nhom, contracts, bar, khung, thamSo };
}

/* ------------------------------------------------------------------ MH32 */
interface ExecDoc { docNo: string; docId: string; docDate: string; branchCode: string; kind: string; base: number; amount: number; note: string }
interface ExecRow { policy: string; name: string; kind: string; partnerCode: string; contractCode: string; brandCode: string; validFrom: string; validTo: string; base: number; entitled: number; expected: number; confirmed: number; received: number; remaining: number; method: string; status: 'du' | 'con' | 'du-kien' | 'chua-dat'; docs: ExecDoc[] }
const TT: Record<ExecRow['status'], [string, string]> = { du: ['Đã nhận / đối trừ đủ', 'badge-ok'], con: ['Đã xác nhận, còn phải nhận', 'badge-warn'], 'du-kien': ['Dự kiến (chưa xác nhận)', 'badge-info'], 'chua-dat': ['Chưa phát sinh / chưa đạt', 'badge-gray'] };

export function ThucHienChinhSachPage() {
  const navigate = useNavigate();
  const names = useNames();
  const { data: mh } = useMuaHang();
  const f = useBoLoc();
  const [tt, setTt] = useState<'' | ExecRow['status']>('');
  const [nhom, setNhom] = useState('');
  const [chon, setChon] = useState<ExecRow | null>(null);
  const q = useQuery({ queryKey: ['mua-hang', 'policy-execution', f.thamSo], queryFn: () => api.get<ExecRow[]>(`${P}/policy-execution`, f.thamSo) });
  const all = q.data ?? [];
  const keyOf = (r: ExecRow) => `${r.partnerCode}|${r.contractCode}`;
  const nhomRows = useMemo(() => [...new Map(all.map((r) => [keyOf(r), r])).keys()].map((k) => {
    const rs = all.filter((r) => keyOf(r) === k);
    return { key: k, partnerCode: rs[0]!.partnerCode, contractCode: rs[0]!.contractCode, policies: rs.length, dat: rs.filter((r) => r.status !== 'chua-dat').length,
      entitled: rs.reduce((t, r) => t + r.entitled, 0), expected: rs.reduce((t, r) => t + r.expected, 0), confirmed: rs.reduce((t, r) => t + r.confirmed, 0), received: rs.reduce((t, r) => t + r.received, 0), remaining: rs.reduce((t, r) => t + r.remaining, 0) };
  }), [all]);
  const rows = all.filter((r) => (!tt || r.status === tt) && (!nhom || keyOf(r) === nhom));
  const sum = (k: 'entitled' | 'expected' | 'confirmed' | 'received' | 'remaining') => all.reduce((t, r) => t + r[k], 0);
  const pol = (code: string): Policy | undefined => mh?.policies.find((p) => p.code === code);
  const cols: Column<ExecRow>[] = [
    { key: 'partnerCode', header: 'Nhà cung cấp', width: 200, value: (r) => names.partnerName(r.partnerCode) || 'Mọi NCC' },
    { key: 'contractCode', header: 'Hợp đồng', width: 130, value: (r) => hdText(r.contractCode), render: (r) => hdCell(r.contractCode) },
    { key: 'policy', header: 'Chính sách', width: 260, value: (r) => `${r.policy} ${r.name}`, render: (r) => <span title={pol(r.policy) ? ruleText(pol(r.policy)!) : r.name}><b className="mono" style={{ fontSize: 11.5 }}>{r.policy}</b> {r.name}</span> },
    { key: 'kind', header: 'Loại', width: 160, value: (r) => POLICY_LABEL[r.kind as Policy['kind']] ?? r.kind, hidden: true },
    { key: 'method', header: 'Cách nhận', width: 190, hidden: true, title: 'Trừ thẳng trên hoá đơn / trừ khi thanh toán đúng hạn / phiếu thưởng cuối kỳ / hàng tặng' },
    { key: 'base', header: 'Doanh số đủ ĐK', type: 'money', width: 130, sum: true, title: 'Doanh số trước thuế của các phiếu được áp (thưởng: doanh số kỳ tính thưởng)' },
    { key: 'expected', header: 'Dự kiến', type: 'money', width: 110, sum: true, title: 'Tạm tính theo doanh số hiện tại, chưa xác nhận: thưởng chưa lập phiếu; CKTT của phiếu chưa thanh toán (chỉ hưởng khi trả đúng hạn)' },
    { key: 'confirmed', header: 'Đã xác nhận', type: 'money', width: 120, sum: true, title: 'Số hai bên đã chốt: chiết khấu / tặng thể hiện trên hoá đơn; phiếu thưởng đã lập (số NCC chốt); CKTT đã trừ khi trả tiền' },
    { key: 'received', header: 'Đã nhận / đối trừ', type: 'money', width: 130, sum: true, title: 'Đã trừ trên hoá đơn / đã trừ khi thanh toán / phiếu thưởng đã hạch toán (giảm công nợ)' },
    { key: 'remaining', header: 'Còn phải nhận', type: 'money', width: 120, sum: true, title: 'Phần ĐÃ XÁC NHẬN nhưng chưa nhận / đối trừ. Chiết khấu trên hoá đơn đã trừ ngay — không cộng trùng vào khoản NCC còn phải trả', render: (r) => (r.remaining > 0 ? <b className="mh-warn">{vnd(r.remaining)}</b> : <span className="muted">0</span>) },
    { key: 'status', header: 'Tình trạng', width: 190, value: (r) => TT[r.status][0], render: (r) => <span className={`badge ${TT[r.status][1]}`}>{TT[r.status][0]}</span> },
  ];
  return (
    <>
      <PageHeader title="Tình hình thực hiện chính sách mua hàng" code="MH32" helpKey="mua-hang-bao-cao-hop-dong" subtitle="Doanh số đủ điều kiện, ưu đãi được hưởng, đã nhận, còn phải nhận — theo NCC / hợp đồng → chính sách → chứng từ" />
      {f.khung({}, <div className="card">
        {f.bar(<div className="row" style={{ gap: 4, alignItems: 'center' }}>{([['', 'Tất cả'], ['con', 'Còn phải nhận'], ['du-kien', 'Dự kiến'], ['du', 'Đã nhận đủ'], ['chua-dat', 'Chưa đạt']] as const).map(([k, l]) => <button key={k} type="button" className={`btn btn-sm${tt === k ? ' btn-primary' : ''}`} onClick={() => setTt(k)}>{l}</button>)}</div>)}
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : <>
          <div className="kpis" style={{ padding: '0 12px' }}>
            <div className="card kpi"><div className="label">Dự kiến (chưa xác nhận)</div><div className="value">{vnd(sum('expected'))}</div><div className="hint">{all.filter((r) => r.status !== 'chua-dat').length} / {all.length} chính sách có phát sinh</div></div>
            <div className="card kpi"><div className="label">Đã xác nhận</div><div className="value">{vnd(sum('confirmed'))}</div></div>
            <div className="card kpi"><div className="label">Đã nhận / đối trừ</div><div className="value mh-ok">{vnd(sum('received'))}</div></div>
            <div className="card kpi"><div className="label">Còn phải nhận</div><div className={`value ${sum('remaining') ? 'mh-warn' : ''}`}>{vnd(sum('remaining'))}</div><div className="hint">{all.filter((r) => r.status === 'con').length} chính sách</div></div>
          </div>
          <div style={{ padding: '0 12px 8px' }}>
            <h4 className="mh-h4" style={{ margin: '6px 0' }}>Theo nhà cung cấp · hợp đồng <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>(bấm một dòng để xem chính sách của nhóm đó)</span></h4>
            <DataGrid storageKey="mh32-nhom" rows={nhomRows} rowKey={(r) => r.key} maxHeight="30vh" exportName="thuc-hien-chinh-sach-theo-hop-dong"
              onRowClick={(r) => setNhom(nhom === r.key ? '' : r.key)}
              columns={[
                { key: 'partnerCode', header: 'Nhà cung cấp', width: 220, value: (r) => names.partnerName(r.partnerCode) || 'Mọi NCC', render: (r) => <span>{nhom === r.key ? '▸ ' : ''}{names.partnerName(r.partnerCode) || 'Mọi NCC'}</span> },
                { key: 'contractCode', header: 'Hợp đồng', width: 140, value: (r) => hdText(r.contractCode), render: (r) => hdCell(r.contractCode) },
                { key: 'policies', header: 'Chính sách', type: 'number', width: 90, value: (r) => r.policies },
                { key: 'dat', header: 'Có phát sinh', type: 'number', width: 100 },
                { key: 'expected', header: 'Dự kiến', type: 'money', width: 120, sum: true },
                { key: 'confirmed', header: 'Đã xác nhận', type: 'money', width: 130, sum: true },
                { key: 'received', header: 'Đã nhận / đối trừ', type: 'money', width: 130, sum: true },
                { key: 'remaining', header: 'Còn phải nhận', type: 'money', width: 130, sum: true },
              ]} />
          </div>
          <div style={{ padding: '0 12px 8px' }}>
            <h4 className="mh-h4" style={{ margin: '6px 0' }}>Từng chính sách {nhom && <button type="button" className="btn btn-xs" onClick={() => setNhom('')}>Bỏ lọc nhóm</button>} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>(bấm một dòng để xem cách tính và chứng từ)</span></h4>
            <DataGrid storageKey="mh32-chinh-sach" rows={rows} rowKey={(r) => r.policy} columns={cols} maxHeight="40vh" footerLabel="Cộng" exportName="tinh-hinh-thuc-hien-chinh-sach" exportTitle="TÌNH HÌNH THỰC HIỆN CHÍNH SÁCH MUA HÀNG"
              onRowClick={(r) => setChon(r)} emptyText="Không có chính sách khớp bộ lọc" />
          </div>
          {chon && <div className="card card-body" style={{ margin: '0 12px 12px' }}>
            <div className="row" style={{ gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <h4 className="mh-h4" style={{ margin: 0 }}>{chon.policy} — {chon.name}</h4>
              <span className="muted">{names.partnerName(chon.partnerCode)} · {hdText(chon.contractCode)} · hiệu lực {dmy(chon.validFrom) || '—'} → {dmy(chon.validTo) || '…'}</span>
              <button type="button" className="btn btn-xs" style={{ marginLeft: 'auto' }} onClick={() => setChon(null)}>Đóng</button>
            </div>
            {pol(chon.policy) && <div className="mh-check info" style={{ margin: '6px 0' }}>{ruleText(pol(chon.policy)!)}</div>}
            <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Cách nhận: {chon.method}. Dự kiến {vnd(chon.expected)} · đã xác nhận {vnd(chon.confirmed)} · đã nhận / đối trừ {vnd(chon.received)} · còn phải nhận {vnd(chon.remaining)}.</div>
            <table className="mh-mini"><thead><tr><th>Chứng từ</th><th>Ngày</th><th>Chi nhánh</th><th className="num">Doanh số</th><th className="num">Ưu đãi</th><th>Ghi chú</th></tr></thead><tbody>
              {chon.docs.map((d, i) => <tr key={i}><td>{d.docId ? <a href="#" onClick={(e) => { e.preventDefault(); navigate(`/mua-hang/tong-hop?mo=${encodeURIComponent(d.docId)}`); }} className="mono">{d.docNo}</a> : <span className="muted">—</span>}</td><td>{dmy(d.docDate)}</td><td>{d.branchCode}</td><td className="num">{vnd(d.base)}</td><td className="num"><b>{vnd(d.amount)}</b></td><td style={{ fontSize: 12 }}>{d.note}</td></tr>)}
              {!chon.docs.length && <tr><td colSpan={6} className="muted">Kỳ này chưa có chứng từ nào được áp chính sách.</td></tr>}
            </tbody></table>
          </div>}
        </>}
      </div>)}
    </>
  );
}

/* ------------------------------------------------------------------ MH33 */
export function ChinhSachTheoHopDongPage() {
  const names = useNames();
  const { data: mh, isLoading } = useMuaHang();
  const f = useBoLoc();
  const [loai, setLoai] = useState('');
  const [chiDangAp, setChiDangAp] = useState(true);
  const now = today();
  const cnSet = f.cn ? new Set(f.cn.split(',')) : null;
  const rows = (mh?.policies ?? []).filter((p) => (!f.ncc || p.scope.partnerCode === f.ncc) && (!f.hd || (f.hd === KHONG_HD ? !p.scope.contractCode : p.scope.contractCode === f.hd))
    && (!loai || p.kind === loai) && (!chiDangAp || (p.isActive && (!p.validTo || p.validTo >= now)))
    // Chi nhánh: chính sách áp mọi chi nhánh luôn hiện; chính sách giới hạn chi nhánh hiện khi có ít nhất một chi nhánh đang chọn.
    && (!cnSet || !scopeBranches(p.scope).length || scopeBranches(p.scope).some((b) => cnSet.has(b))));
  const tenHd = (c?: string) => f.contracts.find((x) => x.code === c)?.name ?? '';
  const cols: Column<Policy>[] = [
    { key: 'contract', header: 'Hợp đồng', width: 150, value: (p) => hdText(p.scope.contractCode), render: (p) => <span title={tenHd(p.scope.contractCode)}>{hdCell(p.scope.contractCode)}</span> },
    { key: 'partner', header: 'Nhà cung cấp', width: 200, value: (p) => (p.scope.partnerCode ? names.partnerName(p.scope.partnerCode) : 'Mọi NCC') },
    { key: 'code', header: 'Mã', type: 'code', width: 130 },
    { key: 'kind', header: 'Loại', width: 170, value: (p) => POLICY_LABEL[p.kind] },
    { key: 'rule', header: 'Nội dung (kèm điều kiện kích hoạt)', width: 380, value: (p) => ruleText(p) },
    { key: 'scope', header: 'Phạm vi', width: 200, value: (p) => [p.scope.sku && `Mã ${p.scope.sku}`, p.scope.brandCode && `Nhãn ${p.scope.brandCode}`, scopeBranches(p.scope).length ? `CN ${scopeBranches(p.scope).join(', ')}` : ''].filter(Boolean).join(' · ') || 'Mọi mã, mọi chi nhánh' },
    { key: 'valid', header: 'Hiệu lực', width: 170, value: (p) => `${dmy(p.validFrom) || '—'} → ${dmy(p.validTo) || '…'}` },
    { key: 'state', header: 'Trạng thái', width: 110, value: (p) => (!p.isActive ? 'Tắt' : p.validTo && p.validTo < now ? 'Hết hiệu lực' : 'Đang áp'), render: (p) => { const s = !p.isActive ? 'Tắt' : p.validTo && p.validTo < now ? 'Hết hiệu lực' : 'Đang áp'; return <span className={`badge ${s === 'Đang áp' ? 'badge-ok' : 'badge-gray'}`}>{s}</span>; } },
  ];
  return (
    <>
      <PageHeader title="Tổng hợp chính sách theo hợp đồng" code="MH33" helpKey="mua-hang-bao-cao-hop-dong" subtitle="Hợp đồng nào có chính sách gì: nội dung, phạm vi, điều kiện kích hoạt, hiệu lực — phần không theo hợp đồng xem riêng" />
      {f.khung({ coKy: false, coKho: false }, <div className="card">
        {f.bar(<>
          <select className="select input" style={{ width: 220 }} value={loai} onChange={(e) => setLoai(e.target.value)}><option value="">Mọi loại chính sách</option>{Object.entries(POLICY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <label className="row" style={{ gap: 4, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={chiDangAp} onChange={(e) => setChiDangAp(e.target.checked)} /> Chỉ chính sách đang áp</label>
        </>)}
        {isLoading ? <Loading /> : <DataGrid storageKey="mh33" rows={rows} rowKey={(p) => p.id} columns={cols} exportName="chinh-sach-theo-hop-dong" exportTitle="TỔNG HỢP CHÍNH SÁCH MUA HÀNG THEO HỢP ĐỒNG" emptyText="Không có chính sách khớp bộ lọc" />}
      </div>)}
    </>
  );
}

/* ------------------------------------------------------------------ MH34 */
interface PriceRow { docId: string; docNo: string; docDate: string; branchCode: string; partnerCode: string; contractCode: string; sku: string; name: string; unit: string; qty: number; agreed: number | null; actual: number; diff: number | null; diffPct: number | null; diffAmount: number | null; source: string; actualFrom: 'hoa-don' | 'phieu-nhap'; invoiceNos: string }
export function DoiChieuGiaHopDongPage() {
  const navigate = useNavigate();
  const names = useNames();
  const f = useBoLoc();
  const [chiLech, setChiLech] = useState(true);
  const q = useQuery({ queryKey: ['mua-hang', 'contract-prices', f.thamSo], queryFn: () => api.get<PriceRow[]>(`${P}/contract-prices`, f.thamSo) });
  const ln = useLocNhomHang(f.nhom);
  const all = ln.loc(q.data ?? []);
  const lech = (r: PriceRow) => r.diff !== null && Math.abs(r.diff) >= 0.5;
  const rows = chiLech ? all.filter((r) => lech(r) || r.agreed === null) : all;
  const tang = all.filter((r) => (r.diffAmount ?? 0) > 0).reduce((t, r) => t + r.diffAmount!, 0);
  const giam = all.filter((r) => (r.diffAmount ?? 0) < 0).reduce((t, r) => t + r.diffAmount!, 0);
  const cols: Column<PriceRow>[] = [
    { key: 'docNo', header: 'Phiếu nhập', type: 'code', width: 120, render: (r) => <a href="#" className="mono" onClick={(e) => { e.preventDefault(); navigate(`/mua-hang/tong-hop?mo=${encodeURIComponent(r.docId)}`); }}>{r.docNo}</a> },
    { key: 'docDate', header: 'Ngày', width: 90, value: (r) => dmy(r.docDate) },
    { key: 'branchCode', header: 'Chi nhánh', width: 90 },
    { key: 'partnerCode', header: 'Nhà cung cấp', width: 190, value: (r) => names.partnerName(r.partnerCode) },
    { key: 'contractCode', header: 'Hợp đồng', width: 120, value: (r) => hdText(r.contractCode), render: (r) => hdCell(r.contractCode) },
    { key: 'sku', header: 'Mã hàng', type: 'code', width: 110 },
    { key: 'name', header: 'Tên hàng', width: 220 },
    { key: 'unit', header: 'ĐVT', width: 60 },
    { key: 'qty', header: 'SL', type: 'number', width: 70 },
    { key: 'agreed', header: 'Giá thoả thuận', type: 'money', width: 120, title: 'Giá theo hợp đồng của phiếu (phiếu không theo hợp đồng: giá NCC ngoài hợp đồng), quy chưa thuế, đúng ĐVT', value: (r) => r.agreed ?? '', render: (r) => (r.agreed === null ? <span className="muted">chưa khai</span> : vnd(r.agreed)) },
    { key: 'actual', header: 'Giá thực tế', type: 'money', width: 120, title: 'Giá SAU chiết khấu, TRƯỚC VAT, cùng ĐVT với dòng: theo hoá đơn NCC (chính thức); chưa có hoá đơn thì tạm theo phiếu nhập' },
    { key: 'actualFrom', header: 'Theo', width: 120, title: 'Giá thực tế lấy từ hoá đơn NCC (chính thức) hay phiếu nhập (tạm — chưa có hoá đơn)', value: (r) => (r.actualFrom === 'hoa-don' ? `Hoá đơn ${r.invoiceNos}` : 'Phiếu nhập (tạm)'), render: (r) => (r.actualFrom === 'hoa-don' ? <span title={r.invoiceNos}>Hoá đơn <span className="mono" style={{ fontSize: 11 }}>{r.invoiceNos}</span></span> : <span className="badge badge-warn">Phiếu nhập (tạm)</span>) },
    { key: 'diff', header: 'Chênh / ĐVT', type: 'money', width: 110, value: (r) => r.diff ?? '', render: (r) => (r.diff === null ? '' : <span className={r.diff > 0 ? 'mh-bad' : r.diff < 0 ? 'mh-ok' : 'muted'}>{r.diff > 0 ? '+' : ''}{vnd(r.diff)}</span>) },
    { key: 'diffPct', header: '%', width: 70, value: (r) => (r.diffPct === null ? '' : `${r.diffPct > 0 ? '+' : ''}${r.diffPct.toLocaleString('vi-VN')}%`) },
    { key: 'diffAmount', header: 'Tiền chênh', type: 'money', width: 120, sum: true, value: (r) => r.diffAmount ?? 0 },
    { key: 'source', header: 'Giá thoả thuận lấy từ', width: 190 },
  ];
  return (
    <>
      <PageHeader title="Đối chiếu giá mua theo hợp đồng" code="MH34" helpKey="mua-hang-bao-cao-hop-dong" subtitle="Giá thoả thuận (hợp đồng / giá NCC ngoài hợp đồng) so với giá thực tế sau chiết khấu, trước VAT — theo hoá đơn NCC, chưa có thì tạm theo phiếu nhập" />
      {f.khung({ coNhom: true }, <div className="card">
        {f.bar(<label className="row" style={{ gap: 4, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={chiLech} onChange={(e) => setChiLech(e.target.checked)} /> Chỉ dòng lệch / chưa khai giá</label>)}
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : <>
          <div className="kpis" style={{ padding: '0 12px' }}>
            <div className="card kpi"><div className="label">Dòng lệch giá</div><div className={`value ${all.some(lech) ? 'mh-warn' : ''}`}>{all.filter(lech).length}</div><div className="hint">trên {all.length} dòng hàng · {all.filter((r) => r.agreed === null).length} dòng chưa khai giá · {all.filter((r) => r.actualFrom === 'phieu-nhap').length} dòng so tạm (chưa có hoá đơn)</div></div>
            <div className="card kpi"><div className="label">Mua cao hơn thoả thuận</div><div className={`value ${tang ? 'mh-bad' : ''}`}>{vnd(tang)}</div></div>
            <div className="card kpi"><div className="label">Mua thấp hơn thoả thuận</div><div className="value mh-ok">{vnd(-giam)}</div></div>
          </div>
          <DataGrid storageKey="mh34" rows={rows} rowKey={(r, i) => `${r.docId}-${r.sku}-${i}`} columns={cols} footerLabel="Cộng" exportName="doi-chieu-gia-theo-hop-dong" exportTitle="ĐỐI CHIẾU GIÁ MUA THEO HỢP ĐỒNG" emptyText={chiLech ? 'Không có dòng lệch giá trong kỳ' : 'Không có phiếu nhập trong kỳ'} />
        </>}
      </div>)}
    </>
  );
}

/* ------------------------------------------------------------------ MH35 */
interface HdRow { code: string; name: string; partnerCode: string; startDate: string; endDate: string; status: string; value: number | null; ordered: number; received: number; invoiced: number; paid: number; debt: number; progress: number | null; remainingValue: number | null; receipts: number; invoices: number }
export function ThucHienHopDongPage() {
  const navigate = useNavigate();
  const names = useNames();
  const f = useBoLoc();
  const q = useQuery({ queryKey: ['mua-hang', 'contract-execution', f.thamSo], queryFn: () => api.get<HdRow[]>(`${P}/contract-execution`, f.thamSo) });
  const ten = (r: HdRow) => f.contracts.find((c) => c.code === r.code)?.statusText ?? '';
  const cols: Column<HdRow>[] = [
    { key: 'code', header: 'Hợp đồng', width: 160, value: (r) => hdText(r.code), render: (r) => (r.code ? <a href="#" className="mono" onClick={(e) => { e.preventDefault(); navigate(`/mua-hang/hop-dong/chi-tiet?so=${encodeURIComponent(r.code)}`); }}>{r.code}</a> : <span className="muted">không theo HĐ</span>) },
    { key: 'name', header: 'Tên hợp đồng', width: 200 },
    { key: 'partnerCode', header: 'Nhà cung cấp', width: 200, value: (r) => names.partnerName(r.partnerCode) },
    { key: 'term', header: 'Hiệu lực', width: 170, value: (r) => (r.code ? `${dmy(r.startDate) || '—'} → ${dmy(r.endDate) || '…'}` : ''), hidden: true },
    { key: 'status', header: 'Trạng thái', width: 110, value: (r) => ten(r), hidden: true },
    { key: 'value', header: 'Giá trị HĐ', type: 'money', width: 130, sum: true, value: (r) => r.value ?? '' },
    { key: 'ordered', header: 'Đã đặt', type: 'money', width: 125, sum: true, title: 'Theo đơn đặt hàng đã duyệt trong kỳ (gồm thuế)' },
    { key: 'received', header: 'Đã nhận', type: 'money', width: 125, sum: true, title: 'Theo phiếu nhập đã duyệt trừ phiếu trả hàng, trong kỳ (gồm thuế)' },
    { key: 'invoiced', header: 'Đã nhận hoá đơn', type: 'money', width: 130, sum: true, title: 'Tổng các hoá đơn NCC (MH22) đính vào phiếu nhập của hợp đồng — mỗi hoá đơn tính một lần. Không cộng với phiếu nhập (không phải hai lần mua)' },
    { key: 'progress', header: 'Tiến độ', width: 80, value: (r) => (r.progress === null ? '' : `${r.progress.toLocaleString('vi-VN')}%`), title: 'Đã nhận / giá trị hợp đồng' },
    { key: 'remainingValue', header: 'Còn lại theo giá trị', type: 'money', width: 140, value: (r) => r.remainingValue ?? '', hidden: true },
    { key: 'paid', header: 'Đã thanh toán', type: 'money', width: 125, sum: true, title: 'Phiếu trả tiền / ứng trước NCC đã duyệt trong kỳ (gồm chiết khấu thanh toán được trừ)' },
    { key: 'debt', header: 'Còn phải trả', type: 'money', width: 125, sum: true, title: 'Theo sổ công nợ thực tế đến ngày cuối kỳ: nợ còn mở của các phiếu thuộc hợp đồng (NCC chỉ một hợp đồng: gồm cả số dư đầu kỳ)' },
    { key: 'receipts', header: 'Số phiếu nhập', type: 'number', width: 90, hidden: true },
    { key: 'invoices', header: 'Số hoá đơn', type: 'number', width: 90, hidden: true },
  ];
  return (
    <>
      <PageHeader title="Tình hình thực hiện hợp đồng mua hàng" code="MH35" helpKey="mua-hang-bao-cao-hop-dong" subtitle="Giá trị hợp đồng · đã đặt (đơn) · đã nhận (phiếu nhập) · đã nhận hoá đơn · đã thanh toán · còn phải trả (sổ công nợ) — kèm phần không theo hợp đồng của từng NCC" />
      {f.khung({}, <div className="card">
        {f.bar()}
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : <DataGrid storageKey="mh35" rows={q.data ?? []} rowKey={(r) => `${r.code}|${r.partnerCode}`} columns={cols} footerLabel="Cộng" exportName="thuc-hien-hop-dong-mua" exportTitle="TÌNH HÌNH THỰC HIỆN HỢP ĐỒNG MUA HÀNG" emptyText="Chưa có hợp đồng / chứng từ khớp bộ lọc trong kỳ" />}
      </div>)}
    </>
  );
}

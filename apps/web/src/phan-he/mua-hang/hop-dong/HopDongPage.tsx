// [2026-11-18 Nguyễn Văn Thủy] Hợp đồng mua hàng (MH29) — gốc của luồng mua: hợp đồng → giá mua, chính sách → đơn đặt → nhập → hoá đơn → thanh toán (đóng góp)
/**
 * HỢP ĐỒNG MUA HÀNG (MH29). Hợp đồng là cái vỏ gom — không khai lại giá hay %:
 *   - đầu hợp đồng: số hợp đồng, nhà cung cấp, ngày ký, hiệu lực, chi nhánh áp dụng, nhãn / mặt hàng theo hợp đồng;
 *   - Giá mua: dòng giá của NCC "thuộc hợp đồng" (cùng bảng giá mua ở hồ sơ NCC);
 *   - Chính sách: chiết khấu, thưởng, quà, hạn mức, hạn thanh toán "thuộc hợp đồng" (cùng bảng chính sách MH04);
 *   - Chứng từ: đơn đặt / phiếu nhập / trả hàng / thanh toán lập theo hợp đồng; Công nợ: số dư TK 331 theo hợp đồng;
 *   - Bản scan: tệp đính kèm của hợp đồng.
 * Lưu ở Danh mục hợp đồng (loại "Nhà cung cấp hàng hoá"); sửa sau khi ký = phụ lục (Sổ chứng từ giữ từng bản).
 */
import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, Plus, X } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ErrorBox, Field, Loading, NumInput } from '@/components/ui';
import { ItemPicker, PartnerPicker } from '@/components/pickers';
import { BranchMultiSelect, useBranches } from '@/components/filters';
import { api, errorText } from '@/lib/api';
import { useThaoTac } from '@/lib/manHinh';
import { CONTRACT_STATUS_LABEL, KIND_LABEL, STATUS_LABEL, purchaseApi, today, useBrands, useMuaHang, useNames, useSupplierBrands, vnd, type ContractInput, type ContractRow, type ContractStatus, type StoredDoc } from '../du-lieu';
import { BrandInput, dmy, statusBadge } from '../chung';
import { TepDinhKem } from '../dinh-kem/TepDinhKem';
import { GiaVaChinhSach } from './GiaVaChinhSach';
import { LichSu } from '../thanh-phan/LichSu';
import '../mua-hang.css';

const badge = (c: ContractRow) => <span className={`badge ${c.statusText === 'Đang hiệu lực' ? 'badge-ok' : c.statusText === 'Hết hạn' ? 'badge-warn' : 'badge-gray'}`}>{c.statusText}</span>;

// [2026-11-19 Nguyễn Văn Thủy] embedded: danh sách hợp đồng là một thẻ của MH11 Chứng từ mua hàng (không ghi sổ) (đóng góp)
export function HopDongMuaPage({ embedded, partner }: { embedded?: boolean; partner?: string } = {}) {
  const tt = useThaoTac('mua-hang.hop-dong');
  const [sel, setSel] = useState<ContractRow | null>(null);
  const [ncc, setNcc] = useState(partner ?? '');
  const navigate = useNavigate();
  const [find, setFind] = useState('');
  const q = useQuery({ queryKey: ['mua-hang', 'contracts', ''], queryFn: () => purchaseApi.contracts() });
  const all = q.data ?? [];
  const rows = all.filter((c) => (!ncc || c.partnerCode === ncc) && (!find || `${c.code} ${c.name} ${c.partnerCode} ${c.partnerName}`.toLowerCase().includes(find.toLowerCase())));
  const columns: Column<ContractRow>[] = [
    { key: 'code', header: 'Số hợp đồng', type: 'code', width: 170, bold: true, title: 'Số hợp đồng ký với nhà cung cấp — cũng là mã hợp đồng trên mọi chứng từ, bút toán' },
    { key: 'partnerCode', header: 'Mã NCC', type: 'code', width: 100 },
    { key: 'partnerName', header: 'Nhà cung cấp', width: 240 },
    { key: 'name', header: 'Tên hợp đồng', width: 240 },
    { key: 'signedDate', header: 'Ngày ký', width: 90, value: (r) => dmy(r.signedDate ?? undefined) },
    { key: 'startDate', header: 'Hiệu lực từ', width: 95, value: (r) => dmy(r.startDate ?? undefined) },
    { key: 'endDate', header: 'Đến', width: 95, value: (r) => dmy(r.endDate ?? undefined) || 'không thời hạn' },
    { key: 'statusText', header: 'Trạng thái', width: 110, render: badge },
    { key: 'scope', header: 'Hàng theo hợp đồng', width: 180, title: 'Nhãn / mặt hàng ghi trong hợp đồng; trống = mọi hàng của NCC', value: (r) => [r.brandCodes.length && `${r.brandCodes.length} nhãn`, r.skus.length && `${r.skus.length} mã`].filter(Boolean).join(', ') || 'mọi hàng của NCC' },
    { key: 'branches', header: 'Chi nhánh', width: 120, value: (r) => (r.branchCodes.length ? r.branchCodes.join(', ') : 'mọi chi nhánh') },
    { key: 'prices', header: 'Giá mua', width: 80, title: 'Số mã đã có giá mua / số mã ghi trong hợp đồng (hợp đồng không ghi mã: số mã đã có giá)', value: (r) => (r.skus.length ? `${r.pricedItems}/${r.skus.length}` : r.pricedItems ? String(r.pricedItems) : '—'), render: (r) => <span className={r.pricedItems === 0 ? 'mh-warn' : ''}>{r.skus.length ? `${r.pricedItems}/${r.skus.length}` : r.pricedItems || 'chưa khai'}</span> },
    { key: 'policies', header: 'Chính sách', type: 'number', width: 80, title: 'Số chính sách (chiết khấu, thưởng, quà, hạn mức…) thuộc hợp đồng' },
    { key: 'documents', header: 'Chứng từ', type: 'number', width: 75, title: 'Số chứng từ mua lập theo hợp đồng (trừ phiếu huỷ)' },
    { key: 'purchased', header: 'Đã mua', type: 'money', width: 120, sum: true, title: 'Tiền hàng trước thuế: phiếu nhập đã duyệt − trả hàng đã duyệt, theo hợp đồng' },
    { key: 'debt', header: 'Còn phải trả', type: 'money', width: 120, sum: true, title: 'Số dư Có TK 331 có mã hợp đồng (theo sổ)' },
    { key: 'createdBy', header: 'Người tạo', width: 110 },
    { key: 'createdAt', header: 'Thời gian tạo', width: 140, value: (r) => (r.createdAt ? new Date(r.createdAt).toLocaleString('vi-VN', { hour12: false }) : '') },
    { key: 'updatedBy', header: 'Người sửa', width: 110, title: 'Người ghi hợp đồng lần cuối — xem đủ ở Nhật ký (bước 6 của hợp đồng)' },
    { key: 'updatedAt', header: 'Sửa lần cuối', width: 140, value: (r) => (r.updatedAt ? new Date(r.updatedAt).toLocaleString('vi-VN', { hour12: false }) : '') },
  ];
  const body = (
      <div className={embedded ? '' : 'card'}>
        <div className="row" style={{ gap: 8, padding: '8px 12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 260 }}><PartnerPicker value={ncc} onChange={setNcc} kind="supplier" placeholder="Lọc theo nhà cung cấp" /></div>
          <input className="input" style={{ width: 240 }} placeholder="Tìm số hợp đồng, tên, NCC…" value={find} onChange={(e) => setFind(e.target.value)} />
          {tt.sua && <button className="btn btn-sm btn-primary" onClick={() => navigate(hopDongMoiPath(ncc || undefined))}><Plus size={14} /> Thêm hợp đồng</button>}
          {/* [2026-11-19 Nguyễn Văn Thủy] nhân bản hợp đồng đang chọn: chép thông tin, hàng hoá, điều khoản sang hợp đồng mới (đóng góp) */}
          {tt.sua && <button className="btn btn-sm" disabled={!sel} title={sel ? `Nhân bản hợp đồng ${sel.code}: chép thông tin, hàng hoá, điều khoản — nhập số hợp đồng mới rồi Ghi` : 'Chọn một hợp đồng để nhân bản'} onClick={() => sel && navigate(hopDongNhanBanPath(sel.code))}><Copy size={13} /> Nhân bản</button>}
          <span className="muted" style={{ fontSize: 12 }}>Bấm đúp một dòng để mở hợp đồng</span>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid storageKey="mh-hop-dong" rows={rows} rowKey={(r) => r.code} columns={columns} exportName="hop-dong-mua-hang" exportTitle="HỢP ĐỒNG MUA HÀNG"
            onSelect={setSel} onRowDoubleClick={(r) => navigate(hopDongPath(r.code))} footerLabel="Cộng" rowClassName={(r) => (r.statusText === 'Hết hạn' ? 'mh-row-warn' : r.status !== 'active' ? 'muted' : '')}
            emptyText={all.length ? 'Không có hợp đồng khớp bộ lọc' : 'Chưa có hợp đồng mua — bấm "Thêm hợp đồng"'} />
        )}
      </div>
  );
  if (embedded) return body;
  return (
    <>
      <PageHeader title="Hợp đồng mua hàng" code="MH29" helpKey="mua-hang-hop-dong" subtitle="Ký hợp đồng với NCC → khai giá mua, chính sách thuộc hợp đồng → đơn đặt hàng tự lấy theo hợp đồng" />
      {body}
    </>
  );
}

const empty = (partnerCode = ''): ContractInput & { code: string } => ({ code: '', name: '', partnerCode, status: 'active', branchCodes: [], brandCodes: [], skus: [], note: '', signedDate: today(), startDate: today(), endDate: null, value: null,
  signerSeller: '', signerBuyer: '', deliveryPlace: '', freightBy: '', returnTerms: '', penaltyPct: null, lateInterestPct: null, liquidatedDate: null, liquidationNote: '' });
const fromRow = (c: ContractRow): ContractInput & { code: string } => ({ code: c.code, name: c.name, partnerCode: c.partnerCode, status: c.status, branchCodes: c.branchCodes, brandCodes: c.brandCodes, skus: c.skus, note: c.note,
  signedDate: c.signedDate, startDate: c.startDate, endDate: c.endDate, value: c.value, signerSeller: c.signerSeller, signerBuyer: c.signerBuyer, deliveryPlace: c.deliveryPlace, freightBy: c.freightBy as ContractInput['freightBy'],
  returnTerms: c.returnTerms, penaltyPct: c.penaltyPct, lateInterestPct: c.lateInterestPct, liquidatedDate: c.liquidatedDate, liquidationNote: c.liquidationNote });

/** Đường dẫn trang một hợp đồng (số hợp đồng có "/" nên để ở tham số). */
export const hopDongPath = (code: string, buoc?: Buoc) => `/mua-hang/hop-dong/chi-tiet?so=${encodeURIComponent(code)}${buoc ? `&buoc=${buoc}` : ''}`;
/** Nhân bản: hợp đồng mới chép từ hợp đồng <code>. */
export const hopDongNhanBanPath = (code: string) => `/mua-hang/hop-dong/chi-tiet?moi=1&nhan-ban=${encodeURIComponent(code)}`;
export const hopDongMoiPath = (ncc?: string) => `/mua-hang/hop-dong/chi-tiet?moi=1${ncc ? `&ncc=${encodeURIComponent(ncc)}` : ''}`;

type Buoc = 'thong-tin' | 'hang-hoa' | 'dieu-khoan' | 'gia' | 'scan' | 'chung-tu';
const BUOC: [Buoc, string][] = [['thong-tin', 'Thông tin hợp đồng'], ['hang-hoa', 'Hàng hoá theo hợp đồng'], ['dieu-khoan', 'Điều khoản hợp đồng'], ['gia', 'Giá mua và chính sách'], ['scan', 'Tệp, thanh lý và nhật ký'], ['chung-tu', 'Chứng từ và công nợ']];
/** Bước ghi cùng nút Ghi (thông tin hợp đồng); các bước còn lại tự ghi tại chỗ. */
const FORM_BUOC: Buoc[] = ['thong-tin', 'hang-hoa', 'dieu-khoan', 'scan'];

// [2026-11-19 Nguyễn Văn Thủy] trang một hợp đồng mua — menu bước bên trái, mỗi bước một việc; thay hộp thoại nhiều thẻ (đóng góp)
/**
 * TRANG HỢP ĐỒNG MUA HÀNG (mở từ MH29, hồ sơ NCC): /mua-hang/hop-dong/chi-tiet?so=<số> | ?moi=1&ncc=<mã NCC>.
 *   1 Thông tin · 2 Hàng hoá · 3 Điều khoản · 4 Giá mua và chính sách · 5 Bản scan và thanh lý · 6 Chứng từ và công nợ.
 * Bước 1, 2, 3, 5 (phần thanh lý): xem trước, bấm Sửa → Ghi một lần. Bước 4, 6 dùng bảng có sẵn, ghi tại chỗ (cần ghi hợp đồng trước).
 */
export function HopDongChiTietPage() {
  // Đổi hợp đồng / sang nhân bản trên cùng trang: dựng lại từ đầu (trạng thái sửa, dữ liệu nạp).
  const [params] = useSearchParams();
  return <ChiTietHopDong key={params.get('so') ?? `moi|${params.get('nhan-ban') ?? ''}|${params.get('ncc') ?? ''}`} />;
}

function ChiTietHopDong() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const tt = useThaoTac('mua-hang.hop-dong');
  const qc = useQueryClient();
  const names = useNames();
  const code = params.get('so') ?? '';
  const isNew = !code;
  const buoc = ((params.get('buoc') as Buoc) || 'thong-tin');
  const setBuoc = (b: Buoc) => setParams((x) => { const n = new URLSearchParams(x); n.set('buoc', b); return n; }, { replace: true });
  const det = useQuery({ queryKey: ['mua-hang', 'contract', code], enabled: Boolean(code), queryFn: () => purchaseApi.contract(code) });
  const [v, setV] = useState<(ContractInput & { code: string }) | null>(null);
  const [editing, setEditing] = useState(isNew);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const branchList = useBranches().data ?? [];
  // Nạp lại khi đổi hợp đồng / sau khi ghi.
  const loadedFor = useRef('');
  const nhanBan = isNew ? params.get('nhan-ban') ?? '' : '';
  const goc = useQuery({ queryKey: ['mua-hang', 'contract', nhanBan], enabled: Boolean(nhanBan), queryFn: () => purchaseApi.contract(nhanBan) });
  if (isNew && !nhanBan && loadedFor.current !== 'moi') { loadedFor.current = 'moi'; setV(empty(params.get('ncc') ?? '')); }
  // Nhân bản: chép thông tin, hàng hoá, điều khoản; số hợp đồng để trống, ngày ký / hiệu lực = hôm nay, bỏ thanh lý. Giá mua, chính sách, tệp không chép.
  if (isNew && nhanBan && goc.data && loadedFor.current !== `nb|${nhanBan}`) { loadedFor.current = `nb|${nhanBan}`; setV({ ...fromRow(goc.data.contract), code: '', name: '', signedDate: today(), startDate: today(), endDate: null, status: 'active', liquidatedDate: null, liquidationNote: '' }); }
  if (!isNew && det.data && loadedFor.current !== `${code}|${det.dataUpdatedAt}` && !editing) { loadedFor.current = `${code}|${det.dataUpdatedAt}`; setV(fromRow(det.data.contract)); }
  const skuInfo = useQuery({ queryKey: ['mua-hang', 'lookup', (v?.skus ?? []).join(',')], enabled: Boolean(v?.skus.length), staleTime: 60_000, queryFn: () => purchaseApi.lookupProducts(v!.skus) });
  const set = (p: Partial<ContractInput & { code: string }>) => setV((x) => (x ? { ...x, ...p } : x));
  if (!v) return <><PageHeader title="Hợp đồng mua hàng" code="MH29" helpKey="mua-hang-hop-dong" />{det.error || goc.error ? <ErrorBox error={errorText(det.error ?? goc.error)} /> : <Loading />}</>;
  const c = det.data?.contract;
  const phatLoi = (v.penaltyPct ?? 0) > 8 ? 'Phạt vi phạm tối đa 8% giá trị phần nghĩa vụ bị vi phạm (Điều 301 Luật Thương mại)' : null;
  const lechNhan = v.brandCodes.length > 0 && (skuInfo.data ?? []).some((i) => v.skus.includes(i.sku) && !v.brandCodes.includes(i.brandCode ?? ''));
  const thieu = !v.code.trim() ? 'Nhập số hợp đồng' : !v.partnerCode ? 'Chọn nhà cung cấp' : !v.signedDate ? 'Nhập ngày ký' : !v.startDate ? 'Nhập ngày hiệu lực từ'
    : phatLoi ?? (lechNhan ? 'Có mặt hàng không thuộc nhãn đã chọn — bỏ mã đó hoặc thêm nhãn' : null);
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const { code: so, ...body } = v;
      await purchaseApi.saveContract(so.trim(), isNew, { ...body, signedDate: body.signedDate || null, startDate: body.startDate || null, endDate: body.endDate || null, liquidatedDate: body.liquidatedDate || null });
      void qc.invalidateQueries({ queryKey: ['mua-hang', 'contracts'] });
      await qc.invalidateQueries({ queryKey: ['mua-hang', 'contract'] });
      setEditing(false);
      if (isNew) navigate(hopDongPath(so.trim(), 'hang-hoa'), { replace: true });
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const cancel = () => { setErr(''); if (isNew) navigate(-1); else { setEditing(false); if (c) setV(fromRow(c)); } };
  // Bước tiếp gợi ý: chưa có giá → khai giá; đủ → lập đơn.
  const nextHint = isNew ? 'Ghi thông tin hợp đồng để khai giá mua, chính sách.'
    : !c ? '' : c.status === 'liquidated' ? 'Hợp đồng đã thanh lý — chỉ xem.'
    : c.pricedItems === 0 ? 'Bước tiếp: khai giá mua (bước 4).'
    : c.status === 'active' ? 'Hợp đồng đã đủ thông tin, có thể lập đơn đặt hàng.' : 'Chuyển trạng thái "Đang hiệu lực" để đơn đặt hàng tự lấy hợp đồng này.';
  const giaText = c ? (c.skus.length ? `${c.pricedItems}/${c.skus.length}` : String(c.pricedItems)) : '';
  const daXong = (b: Buoc) => !c ? false : b === 'thong-tin' ? true : b === 'hang-hoa' ? c.skus.length > 0 || c.brandCodes.length > 0 : b === 'dieu-khoan' ? Boolean(c.deliveryPlace || c.returnTerms || c.penaltyPct || c.freightBy) : b === 'gia' ? c.pricedItems > 0 : b === 'scan' ? c.status === 'liquidated' : c.documents > 0;
  const form = FORM_BUOC.includes(buoc);
  return (
    <>
      <PageHeader title="Hợp đồng mua hàng" code="MH29" helpKey="mua-hang-hop-dong" subtitle="Thông tin → hàng hoá → điều khoản → giá mua và chính sách → bản scan, thanh lý" />
      <div className="hd-head">
        <button className="btn btn-sm btn-ghost" title="Quay lại" onClick={() => navigate(-1)}><ArrowLeft size={15} /></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="hd-title">{isNew ? (nhanBan ? `Hợp đồng mới — nhân bản từ ${nhanBan}` : 'Hợp đồng mua hàng mới') : <>Hợp đồng số: <span className="mono">{code}</span> — {names.partnerName(v.partnerCode)}</>}
            {c && <span style={{ marginLeft: 8 }}>{badge(c)}</span>}{!isNew && editing && <span className="badge badge-warn" style={{ marginLeft: 6 }}>Đang sửa</span>}</div>
          {c && <div className="muted" style={{ fontSize: 11.5 }} title="Nhật ký đầy đủ (ai sửa gì, lúc nào): bước 6">Tạo: {c.createdBy || '—'}{c.createdAt ? ` · ${new Date(c.createdAt).toLocaleString('vi-VN', { hour12: false })}` : ''} · Sửa lần cuối: {c.updatedBy || '—'}{c.updatedAt ? ` · ${new Date(c.updatedAt).toLocaleString('vi-VN', { hour12: false })}` : ''}</div>}
          {nextHint && <div className="muted" style={{ fontSize: 12.5 }}>{nextHint}
            {c?.status === 'active' && c.pricedItems > 0 && <button className="btn btn-xs btn-primary" style={{ marginLeft: 8 }} onClick={() => navigate(`/mua-hang/tong-hop?moi=order&ncc=${encodeURIComponent(v.partnerCode)}&hd=${encodeURIComponent(code)}`)}>Lập đơn đặt hàng</button>}</div>}
        </div>
        {form && tt.sua && (editing
          ? <><button className="btn btn-primary" disabled={busy || Boolean(thieu)} title={thieu ?? 'Ghi hợp đồng (Ctrl + S)'} onClick={() => void save()}>Ghi</button><button className="btn" onClick={cancel}>Huỷ</button></>
          : <><button className="btn btn-primary" onClick={() => setEditing(true)}>Sửa</button><button className="btn" title="Hợp đồng mới chép thông tin, hàng hoá, điều khoản của hợp đồng này (giá, chính sách, tệp không chép)" onClick={() => navigate(hopDongNhanBanPath(code))}><Copy size={13} /> Nhân bản</button></>)}
      </div>
      <ErrorBox error={err || null} />
      <div className="hd-page">
        <nav className="hd-nav">
          {BUOC.map(([k, l], i) => {
            const off = isNew && !FORM_BUOC.includes(k);
            return (
              <button key={k} type="button" className={`hd-step ${buoc === k ? 'active' : ''}`} disabled={off} title={off ? 'Ghi thông tin hợp đồng trước' : undefined} onClick={() => setBuoc(k)}>
                <span className={`hd-so ${daXong(k) ? 'xong' : ''}`}>{daXong(k) ? '✓' : i + 1}</span>
                <span>{l}{k === 'hang-hoa' && v.skus.length ? ` (${v.skus.length})` : ''}{k === 'gia' && c ? ` (${giaText})` : ''}</span>
              </button>
            );
          })}
        </nav>
        <div className="card hd-body">
          {/* [2026-11-19 Nguyễn Văn Thủy] bước 5 = Tệp & nhật ký như hồ sơ NCC: tệp đã có thì hiện, kéo thả / chọn để tải thêm; thanh lý; nhật ký (đóng góp) */}
          {buoc === 'scan' && !isNew && <div style={{ marginBottom: 14 }}><h4 className="mh-h4">Tệp hợp đồng, phụ lục</h4><TepDinhKem ownerType="contract" ownerId={code} defaultKind="hop_dong" simple /></div>}
          {form ? (
            <fieldset disabled={!editing} className={editing ? '' : 'view-plain'} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} onDoubleClick={() => !editing && tt.sua && setEditing(true)}>
              {buoc === 'thong-tin' && <div className="hd-grid">
                <Field label="Số hợp đồng (*)" tip="Số in trên hợp đồng / phụ lục, vd 05/2026/HĐMB-VC — là mã hợp đồng trên đơn đặt, phiếu nhập, bút toán; không đổi sau khi ghi">
                  <input className="input mono" value={v.code} disabled={!isNew} autoFocus={isNew} placeholder="vd 05/2026/HĐMB-VC" onChange={(e) => set({ code: e.target.value.replace(/\s+/g, '') })} />
                </Field>
                <Field label="Tên hợp đồng" tip="Trống = tự đặt 'Hợp đồng mua <tên NCC>'"><input className="input" value={v.name} placeholder={v.partnerCode ? `Hợp đồng mua ${names.partnerName(v.partnerCode)}` : ''} onChange={(e) => set({ name: e.target.value })} /></Field>
                <Field label="Nhà cung cấp (*)">
                  {isNew && !params.get('ncc') ? <PartnerPicker value={v.partnerCode} onChange={(p) => set({ partnerCode: p })} activeOnly kind="supplier" addKind="supplier" />
                    : <div className="input" style={{ background: 'var(--surface-2, #f4f6f9)' }}><b className="mono">{v.partnerCode}</b> {names.partnerName(v.partnerCode)}</div>}
                </Field>
                <Field label="Ngày ký (*)"><input className="input" type="date" value={v.signedDate ?? ''} onChange={(e) => set({ signedDate: e.target.value || null })} /></Field>
                <Field label="Hiệu lực từ (*)"><input className="input" type="date" value={v.startDate ?? ''} onChange={(e) => set({ startDate: e.target.value || null })} /></Field>
                <Field label="Hiệu lực đến" tip="Trống = không thời hạn"><input className="input" type="date" value={v.endDate ?? ''} onChange={(e) => set({ endDate: e.target.value || null })} /></Field>
                <BranchMultiSelect label="Chi nhánh áp dụng" value={v.branchCodes.join(',')} onChange={(x) => set({ branchCodes: x ? x.split(',') : [] })} branches={branchList} />
                <Field label="Người ký bên bán" tip="Họ tên, chức vụ người đại diện ký của NCC"><input className="input" value={v.signerSeller} placeholder="vd Nguyễn Văn A — Giám đốc" onChange={(e) => set({ signerSeller: e.target.value })} /></Field>
                <Field label="Người ký bên mua" tip="Họ tên, chức vụ người đại diện ký bên mình"><input className="input" value={v.signerBuyer} onChange={(e) => set({ signerBuyer: e.target.value })} /></Field>
                <Field label="Trạng thái" tip="Nháp: đang thương lượng. Đang hiệu lực: đơn đặt hàng tự lấy hợp đồng này. Thanh lý ở bước 5">
                  <select className="select input" value={v.status === 'liquidated' ? 'liquidated' : v.status} disabled={v.status === 'liquidated'} onChange={(e) => set({ status: e.target.value as ContractStatus })}>
                    <option value="draft">Nháp</option><option value="active">Đang hiệu lực</option>{v.status === 'liquidated' && <option value="liquidated">Đã thanh lý</option>}
                  </select>
                </Field>
                <Field label="Giá trị hợp đồng" tip="Tổng giá trị cam kết (nếu có), để theo dõi; không dùng để tính"><NumInput value={v.value ?? 0} decimals={0} onChange={(n) => set({ value: n || null })} /></Field>
                <Field label="Ghi chú"><input className="input" value={v.note} placeholder="Phạm vi, hồ sơ kèm theo…" onChange={(e) => set({ note: e.target.value })} /></Field>
              </div>}
              {buoc === 'hang-hoa' && <HangTheoHopDong v={v} set={set} />}
              {buoc === 'dieu-khoan' && <div className="hd-grid">
                <Field label="Địa điểm giao hàng"><input className="input" value={v.deliveryPlace} placeholder="vd Kho chi nhánh Nghệ An" onChange={(e) => set({ deliveryPlace: e.target.value })} /></Field>
                <Field label="Chi phí vận chuyển">
                  <select className="select input" value={v.freightBy} onChange={(e) => set({ freightBy: e.target.value as ContractInput['freightBy'] })}><option value="">— không ghi —</option><option value="seller">Bên bán chịu</option><option value="buyer">Bên mua chịu</option></select>
                </Field>
                <Field label="Phạt vi phạm (%)" tip="Tối đa 8% giá trị phần nghĩa vụ bị vi phạm (Điều 301 Luật Thương mại 2005)" error={phatLoi}><NumInput value={v.penaltyPct ?? 0} decimals={2} onChange={(n) => set({ penaltyPct: n || null })} /></Field>
                <Field label="Lãi chậm thanh toán (%/năm)" tip="Lãi trên số tiền chậm trả (Điều 306 Luật Thương mại 2005)"><NumInput value={v.lateInterestPct ?? 0} decimals={2} onChange={(n) => set({ lateInterestPct: n || null })} /></Field>
                <Field label="Đổi trả" full><input className="input" value={v.returnTerms} placeholder="vd Đổi hàng lỗi, móp; trả hàng còn hạn dưới 60 ngày" onChange={(e) => set({ returnTerms: e.target.value })} /></Field>
                <div className="muted full" style={{ fontSize: 12 }}>Hạn thanh toán, hạn mức công nợ, chiết khấu, thưởng: khai ở bước 4 (Giá mua và chính sách) — phiếu tự áp.</div>
              </div>}
              {buoc === 'scan' && <>
                <h4 className="mh-h4">Thanh lý hợp đồng <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>(bấm Sửa để tích thanh lý)</span></h4>
                <div className="hd-grid">
                  <Field label="Thanh lý">
                    <label className="checkbox"><input type="checkbox" checked={v.status === 'liquidated'} onChange={(e) => set({ status: e.target.checked ? 'liquidated' : 'active', liquidatedDate: e.target.checked ? (v.liquidatedDate ?? today()) : null })} /> Đã thanh lý — không lập chứng từ mới theo hợp đồng này</label>
                  </Field>
                  {v.status === 'liquidated' && <>
                    <Field label="Ngày thanh lý"><input className="input" type="date" value={v.liquidatedDate ?? ''} onChange={(e) => set({ liquidatedDate: e.target.value || null })} /></Field>
                    <Field label="Ghi chú thanh lý" full><input className="input" value={v.liquidationNote} placeholder="vd Đã đối chiếu công nợ, quyết toán thưởng" onChange={(e) => set({ liquidationNote: e.target.value })} /></Field>
                  </>}
                </div>
              </>}
            </fieldset>
          ) : buoc === 'gia' && c ? (
            <GiaVaChinhSach partnerCode={c.partnerCode} contractCode={code} brands={c.brandCodes} skus={c.skus} start={c.startDate ?? undefined} end={c.endDate ?? undefined} readOnly={c.status === 'liquidated'} />
          ) : buoc === 'chung-tu' && det.data ? (
            <ChungTuHopDong code={code} partnerCode={det.data.contract.partnerCode} active={det.data.contract.status === 'active'} docs={det.data.documents} start={det.data.contract.startDate ?? undefined} />
          ) : <Loading />}
          {buoc === 'scan' && !isNew && <div style={{ marginTop: 16 }}><LichSu contractCode={code} title="Nhật ký hợp đồng — ghi hợp đồng, giá mua, chính sách, tệp (ai làm, lúc nào, đổi gì)" empty="Chưa có thay đổi nào được ghi." /></div>}
        </div>
      </div>
    </>
  );
}

/** Nhãn hàng + mặt hàng ghi trong hợp đồng (trống cả hai = mọi hàng của NCC). Mã hàng hiện kèm nhãn của mã. */
function HangTheoHopDong({ v, set }: { v: ContractInput; set: (p: Partial<ContractInput>) => void }) {
  const brands = useBrands();
  const nccBrands = useSupplierBrands(v.partnerCode || undefined);
  const brandName = (b: string) => brands.find((x) => x.code === b)?.name ?? b;
  const info = useQuery({ queryKey: ['mua-hang', 'lookup', v.skus.join(',')], enabled: v.skus.length > 0, staleTime: 60_000, queryFn: () => purchaseApi.lookupProducts(v.skus) });
  const prod = new Map((info.data ?? []).map((p) => [p.sku, p]));
  const [busy, setBusy] = useState('');
  const addBrandItems = async () => {
    setBusy('Đang lấy mã…');
    try {
      const lists = await Promise.all(v.brandCodes.map((b) => api.get<{ sku: string }[]>('/api/v1/products', { brand: b, status: 'active', pageSize: 5000 })));
      const add = lists.flat().map((p) => p.sku).filter((s) => !v.skus.includes(s));
      set({ skus: [...v.skus, ...add] });
      setBusy(add.length ? '' : 'Không có mã mới');
    } catch (e) { setBusy(errorText(e)); }
  };
  return (
    <fieldset className="fgroup full">
      <legend>Hàng theo hợp đồng <span className="muted" style={{ fontWeight: 400 }}>— để trống = mọi hàng của nhà cung cấp</span></legend>
      <div className="field full">
        <label>Nhãn hàng ({v.brandCodes.length})</label>
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {v.brandCodes.map((b) => <span key={b} className="mh-brand-chip">{brandName(b)} <span className="mono muted">{b}</span> <button type="button" className="btn btn-xs btn-ghost" title="Bỏ nhãn này" onClick={() => set({ brandCodes: v.brandCodes.filter((x) => x !== b) })}><X size={11} /></button></span>)}
          <div style={{ width: 260 }}><BrandInput key={v.brandCodes.length} value="" brands={brands.filter((b) => !v.brandCodes.includes(b.code))} prefer={nccBrands} onChange={(b) => b && set({ brandCodes: [...v.brandCodes, b] })} /></div>
          {v.brandCodes.length > 0 && <button type="button" className="btn btn-sm" onClick={() => void addBrandItems()} title="Thêm vào danh sách mặt hàng mọi mã đang dùng của các nhãn đã chọn">Lấy mọi mã của nhãn đã chọn</button>}
          {busy && <span className="muted" style={{ fontSize: 12 }}>{busy}</span>}
        </div>
      </div>
      <div className="field full">
        <label>Mặt hàng ({v.skus.length})</label>
        <div style={{ width: 380, marginBottom: 6 }}><ItemPicker key={v.skus.length} brands={v.brandCodes} value="" onChange={(s) => s && !v.skus.includes(s) && set({ skus: [...v.skus, s] })} placeholder={v.brandCodes.length ? 'Thêm mã thuộc nhãn đã chọn: gõ mã hoặc tên' : 'Thêm mã: gõ mã hoặc tên mặt hàng'} /></div>
        {v.skus.length > 0 && (
          <div className="scroll-box" style={{ maxHeight: 220 }}>
            <table className="mh-mini">
              <thead><tr><th>STT</th><th>Mã hàng</th><th>Tên hàng</th><th title="Nhãn của mặt hàng theo danh mục (cây nhóm hàng)">Nhãn hàng</th><th /></tr></thead>
              <tbody>{v.skus.map((s, i) => { const p = prod.get(s); return (
                <tr key={s}><td>{i + 1}</td><td className="mono">{s}</td><td>{p?.name ?? ''}</td><td>{p?.brandCode ? `${brandName(p.brandCode)} (${p.brandCode})` : <span className="muted">chưa có nhãn</span>}{p && v.brandCodes.length > 0 && !v.brandCodes.includes(p.brandCode ?? '') && <span className="mh-bad" style={{ marginLeft: 6 }}>không thuộc nhãn đã chọn — bỏ mã hoặc thêm nhãn</span>}</td>
                  <td><button type="button" className="btn btn-xs btn-ghost" title="Bỏ mã này" onClick={() => set({ skus: v.skus.filter((x) => x !== s) })}><X size={11} /></button></td></tr>); })}</tbody>
            </table>
          </div>
        )}
      </div>
    </fieldset>
  );
}

/** Chứng từ lập theo hợp đồng + công nợ của hợp đồng. */
function ChungTuHopDong({ code, partnerCode, active, docs, start }: { code: string; partnerCode: string; active: boolean; docs: StoredDoc[]; start?: string }) {
  const navigate = useNavigate();
  return (
    <>
      <div className="row" style={{ gap: 6, marginBottom: 6 }}>
        <button type="button" className="btn btn-sm btn-primary" disabled={!active} title={active ? 'Đơn đặt điền sẵn NCC + hợp đồng; giá, chiết khấu tự lấy theo hợp đồng' : 'Chỉ lập đơn theo hợp đồng đang hiệu lực'}
          onClick={() => navigate(`/mua-hang/tong-hop?moi=order&ncc=${encodeURIComponent(partnerCode)}&hd=${encodeURIComponent(code)}`)}><Plus size={13} /> Lập đơn đặt hàng theo hợp đồng</button>
      </div>
      <table className="mh-mini"><thead><tr><th>Ngày</th><th>Số phiếu</th><th>Loại</th><th>Chi nhánh</th><th className="num">Tổng tiền</th><th>Trạng thái</th></tr></thead>
        <tbody>{[...docs].sort((a, b) => b.docDate.localeCompare(a.docDate)).map((x) => (
          <tr key={x.id} style={{ cursor: 'pointer' }} title="Bấm đúp để mở phiếu" onDoubleClick={() => navigate(`/mua-hang/tong-hop?mo=${encodeURIComponent(x.docNo)}`)}>
            <td>{dmy(x.docDate)}</td><td className="mono">{x.docNo}</td><td>{KIND_LABEL[x.kind]}</td><td>{x.branchCode}</td><td className="num">{vnd(x.totals.total)}</td><td><span className={`badge ${statusBadge(x.status)}`}>{STATUS_LABEL[x.status]}</span></td></tr>))}
          {!docs.length && <tr><td colSpan={6} className="muted">Chưa có chứng từ lập theo hợp đồng.</td></tr>}</tbody></table>
      <h4 className="mh-h4" style={{ marginTop: 14 }}>Công nợ theo hợp đồng</h4>
      <CongNoHopDong code={code} from={start} />

    </>
  );
}

/** Công nợ của một hợp đồng: số dư đầu, phát sinh, còn phải trả + từng bút toán. */
function CongNoHopDong({ code, from }: { code: string; from?: string }) {
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['mua-hang', 'contract-debts', code], queryFn: () => purchaseApi.contractDebts({ from: from || '2000-01-01', to: today(), contractCode: code, detail: true }) });
  if (!q.data) return q.error ? <ErrorBox error={errorText(q.error)} /> : <Loading />;
  const r = q.data.rows[0];
  return (
    <>
      <div className="row" style={{ gap: 16, marginBottom: 6, alignItems: 'center' }}>
        <span>Phát sinh nợ: <b>{vnd(r?.debit)}</b></span><span>Phát sinh có: <b>{vnd(r?.credit)}</b></span>
        <span>Còn phải trả: <b>{vnd((r?.closeCredit ?? 0) - (r?.closeDebit ?? 0))}</b></span>
        <button type="button" className="btn btn-sm" onClick={() => navigate(`/mua-hang/cong-no-hop-dong?hd=${encodeURIComponent(code)}`)}>Mở sổ công nợ theo hợp đồng (MH30)</button>
      </div>
      <table className="mh-mini"><thead><tr><th>Ngày</th><th>Số chứng từ</th><th>Diễn giải</th><th>TK</th><th className="num">Nợ</th><th className="num">Có</th><th className="num">Còn phải trả</th></tr></thead>
        <tbody>{q.data.lines.map((l, i) => <tr key={i}><td>{dmy(l.date)}</td><td className="mono">{l.docNo}</td><td>{l.description}</td><td className="mono">{l.account}</td><td className="num">{vnd(l.debit)}</td><td className="num">{vnd(l.credit)}</td><td className="num">{vnd(l.balance)}</td></tr>)}
          {!q.data.lines.length && <tr><td colSpan={7} className="muted">Chưa có bút toán công nợ theo hợp đồng (phiếu nhập / trả tiền thuộc hợp đồng đã duyệt mới lên sổ).</td></tr>}</tbody></table>
    </>
  );
}

/**
 * HỒ SƠ NHÀ CUNG CẤP — một NCC, mọi thứ ở một nơi (mua hàng đi từ NCC):
 *   đầu trang: thông tin NCC + nợ, quá hạn, hạn mức đã dùng, mua tháng này, đơn đang mở + nút lập chứng từ cho NCC này
 *   Tổng quan · Hợp đồng & giá (mỗi hợp đồng + "Không theo hợp đồng": giá, chiết khấu, thưởng, hạn mức) ·
 *   Hoá đơn NCC · Tệp & nhật ký
 * Giá và chính sách khai trong khung hợp đồng (HopDongForm, dùng lại BangGiaMua / PolicyBlock / PolicyForm) — vẫn lưu bảng giá, bảng chính sách chung.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ClipboardList, FileSpreadsheet, HandCoins, PackageCheck, Pencil, Plus, RotateCcw } from 'lucide-react';
import { orderProgress, type Policy } from '@bizcity/mua-hang-domain';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { nhapNgoaiDon, KIND_LABEL, P, STATUS_LABEL, purchaseApi, today, useMuaHang, useNames, vnd, type ContractRow, type MhData, type StoredDoc } from '../du-lieu';
import { UsageBar, dmy, statusBadge } from '../chung';
import { HoaDonNccPage } from '../hoa-don/HoaDonNccPage';
import { TepDinhKem } from '../dinh-kem/TepDinhKem';
import { LichSu } from '../thanh-phan/LichSu';
import { PartnerEditor } from '../../../features/catalog/PartnersPage';
import { ChungTuPage, NEW_KINDS } from '../chung-tu/ChungTuPage';
import { NhanHangNcc } from './NhanHangNcc';
import { hopDongMoiPath, hopDongPath } from '../hop-dong/HopDongPage';
import { GiaVaChinhSach } from '../hop-dong/GiaVaChinhSach';
import '../mua-hang.css';

// [2026-11-18 Nguyễn Văn Thủy] gọn còn 4 thẻ: giá, chiết khấu, thưởng, hạn mức… đều trong "Hợp đồng & giá" (mở hợp đồng hoặc "Không theo hợp đồng") (đóng góp)
type Tab = 'tong-quan' | 'hop-dong' | 'ngoai-hd' | 'tong-hop' | 'bao-cao' | 'hoa-don' | 'tep';
// [2026-11-17 12:00 PM kiennt] MH01 — bỏ hai thẻ liên kết Tổng hợp mua hàng / Báo cáo mua hàng (LINK_TABS vẫn dùng cho số liệu ở Tổng quan) (đóng góp)
// [2026-11-19 Nguyễn Văn Thủy] thẻ "Không theo hợp đồng" tách riêng (giá + chính sách của NCC chưa ký hợp đồng) (đóng góp)
const TABS: [Tab, string][] = [['tong-quan', 'Tổng quan'], ['hop-dong', 'Hợp đồng'], ['ngoai-hd', 'Không theo hợp đồng'], ['hoa-don', 'Hoá đơn NCC'], ['tep', 'Tệp & nhật ký']];
/** Thẻ cũ (đường dẫn đã lưu) → thẻ mới. */
const OLD_TAB: Record<string, Tab> = { 'chiet-khau': 'ngoai-hd', thuong: 'ngoai-hd', 'mat-hang': 'ngoai-hd', 'nhat-ky': 'tep' };

const LINK_TABS: Record<string, string> = { 'tong-hop': '/mua-hang/tong-hop', 'bao-cao': '/mua-hang/bao-cao' };

export function HoSoNccPage() {
  const { code = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('the');
  // Thẻ Chứng từ cũ (đã bỏ) → Tổng quan; hai thẻ Tổng hợp / Báo cáo mua hàng là liên kết sang MH11 / MH23 (lọc sẵn NCC), không vẽ trong hồ sơ.
  const tab = (rawTab && OLD_TAB[rawTab] ? OLD_TAB[rawTab] : rawTab && TABS.some(([k]) => k === rawTab) ? rawTab : 'tong-quan') as Tab;
  const setTab = (t: Tab) => setParams((x) => { const n = new URLSearchParams(x); n.set('the', t); return n; }, { replace: true });
  const navigate = useNavigate();
  const names = useNames();
  const { data, refresh } = useMuaHang();
  const prof = useQuery({ queryKey: ['mua-hang', 'supplier', code], queryFn: () => purchaseApi.supplier(code) });
  const [editInfo, setEditInfo] = useState(false);
  const policies = useMemo(() => (data?.policies ?? []).filter((p) => p.scope.partnerCode === code), [data, code]);
  const docs = useMemo(() => (data?.docs ?? []).filter((d) => d.partnerCode === code).sort((a, b) => b.docDate.localeCompare(a.docDate) || b.docNo.localeCompare(a.docNo)), [data, code]);
  const s = prof.data?.summary;
  const p = prof.data?.partner;
  // Lập mới / mở / nhập Excel / lập phiếu nhập từ đơn làm NGAY TRONG hồ sơ NCC (ChungTuPage formsOnly nhận lệnh, chỉ mở hộp phiếu);
  // "loai=…" = xem danh sách → mở MH11 Tổng hợp mua hàng lọc sẵn NCC + loại phiếu (thẻ mới).
  const [ctCmd, setCtCmd] = useState<{ q: string; n: number } | undefined>(undefined);
  const go = (q: string) => {
    if (q.startsWith('loai=')) { navigate(`${LINK_TABS['tong-hop']}?ncc=${encodeURIComponent(code)}&${q}`); return; }
    setCtCmd((c) => ({ q, n: (c?.n ?? 0) + 1 }));
  };
  // Đơn đặt đã duyệt còn hàng chưa giao — lập phiếu nhập từ đơn ngay ở menu nút Phiếu nhập.
  const openOrders = useMemo(() => docs.filter((d) => d.kind === 'order' && d.status === 'approved' && !orderProgress(d, data?.docs ?? [], undefined, data?.units).done), [docs, data]);
  const reload = () => { void refresh(); void prof.refetch(); };
  const hds = useQuery({ queryKey: ['mua-hang', 'contracts', code], queryFn: () => purchaseApi.contracts(code) }).data ?? [];
  const nHd = hds.length;
  const giaNcc = useQuery({ queryKey: ['mua-hang', 'supplier-products', code, ''], queryFn: () => purchaseApi.supplierProducts({ partnerCode: code }) }).data?.rows.filter((r) => r.partnerCode === code && r.isActive) ?? [];

  const header = (
    <div className="mh-ncc-head">
      <div className="mh-ncc-id">
        <Link to="/mua-hang/nha-cung-cap" className="btn btn-sm btn-ghost" title="Về danh sách NCC"><ArrowLeft size={14} /></Link>
        <div>
          <div className="mh-ncc-name">{p?.name ?? names.partnerName(code)} <span className="mono muted" style={{ fontSize: 13 }}>{code}</span></div>
          <div className="muted" style={{ fontSize: 12 }}>{[p?.taxCode && `MST ${p.taxCode}`, p?.address, p?.phone && `ĐT ${p.phone}`, p?.contactName && `Liên hệ ${p.contactName}`, p?.bankAccount && `TK ${p.bankAccount} ${p.bankName}`].filter(Boolean).join(' · ') || 'Chưa có thông tin liên hệ'}</div>
          <div style={{ fontSize: 12.5, marginTop: 2 }}>Điều khoản thanh toán: <b>{s?.term || 'chưa khai'}</b> <button className="btn btn-xs" style={{ marginLeft: 6 }} onClick={() => setEditInfo(true)} title="Sửa tên, MST, địa chỉ, nhóm NCC, tài khoản ngân hàng… (một form chung cho cả phần mềm)"><Pencil size={11} /> Sửa thông tin NCC</button></div>
          <NhanHangNcc code={code} />
        </div>
      </div>
      <div className="mh-ncc-actions">
        {/* Mỗi nút mở menu nhỏ: lập mới · xem danh sách của NCC này (kèm việc hay làm: phiếu nhập từ đơn đang mở…). */}
        <NutChungTu kind="order" primary icon={<ClipboardList size={14} />} label="Đơn đặt hàng" docs={docs} go={go} />
        <NutChungTu kind="receipt" icon={<PackageCheck size={14} />} label="Phiếu nhập" docs={docs} go={go}
          extra={openOrders.slice(0, 6).map((o) => ({ label: `Lập phiếu nhập từ đơn ${o.docNo} (${dmy(o.docDate)})`, q: `nhan-tu=${encodeURIComponent(o.id)}` }))} />
        <NutChungTu kind="return" icon={<RotateCcw size={14} />} label="Trả hàng" docs={docs} go={go} />
        <NutChungTu kind="payment" icon={<HandCoins size={14} />} label="Trả tiền" docs={docs} go={go} />
        <ChungTuKhac docs={docs} go={go} />
        <button className="btn btn-sm" onClick={() => go('nhap-excel=1')}><FileSpreadsheet size={14} /> Nhập Excel</button>
      </div>
    </div>
  );
  // 4 ô số theo việc khai báo: hợp đồng đang hiệu lực · nợ phải trả · giá mua đã khai · chính sách đã khai.
  const kpis = s && (
    <div className="kpis" style={{ marginBottom: 10 }}>
      <div className="card kpi" style={{ cursor: 'pointer' }} onClick={() => setTab('hop-dong')}><div className="label">Hợp đồng đang hiệu lực</div><div className="value">{hds.filter((c) => c.statusText === 'Đang hiệu lực').length}</div><div className="hint">{nHd ? `${nHd} hợp đồng · ${hds.filter((c) => c.statusText === 'Hết hạn').length} hết hạn` : 'Chưa có — thẻ Hợp đồng › Thêm hợp đồng'}</div></div>
      <div className="card kpi"><div className="label">Công nợ phải trả</div><div className="value">{vnd(s.debt)}</div><div className="hint">{s.overdue > 0 ? <span className="mh-bad">Quá hạn {vnd(s.overdue)}</span> : 'Không có khoản quá hạn'}{s.advance > 0 ? ` · ứng trước chờ đối trừ ${vnd(s.advance)}` : ''}{s.creditLimit ? ` · hạn mức ${vnd(s.creditLimit)} (đã dùng ${Math.round((s.creditUsed / s.creditLimit) * 100)}%)` : ''}</div></div>
      <div className="card kpi"><div className="label">Giá mua đã khai</div><div className="value">{new Set(giaNcc.filter((r) => r.price !== null && r.price !== undefined).map((r) => r.sku)).size}</div><div className="hint">mã có giá · {giaNcc.filter((r) => r.contractCode).length} dòng theo hợp đồng</div></div>
      <div className="card kpi"><div className="label">Chính sách đã khai</div><div className="value">{policies.filter((x) => x.isActive).length}</div><div className="hint">{policies.filter((x) => x.scope.contractCode).length} theo hợp đồng · {policies.filter((x) => !x.scope.contractCode).length} ngoài hợp đồng</div></div>
    </div>
  );

  return (
    <>
      <PageHeader title="Hồ sơ nhà cung cấp" code="MH01" helpKey="mua-hang-nha-cung-cap" subtitle="Mọi thứ của một nhà cung cấp ở một nơi" />
      <ErrorBox error={prof.error ? errorText(prof.error) : null} />
      {header}
      {/* Lệnh lập / mở phiếu từ các nút ở đầu hồ sơ: chỉ mở hộp phiếu tại chỗ (không vẽ danh sách). */}
      <ChungTuPage embedPartner={code} command={ctCmd} formsOnly />
      {kpis}
      <div className="card">
        <div className="tabs" style={{ marginBottom: 0 }}>{TABS.map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => (LINK_TABS[k] ? navigate(`${LINK_TABS[k]}?ncc=${encodeURIComponent(code)}`) : setTab(k))} title={LINK_TABS[k] ? `Mở ${l} (thẻ mới), lọc sẵn NCC này` : undefined}>{l}{k === 'hop-dong' ? ` (${nHd})` : ''}</button>)}</div>
        <div style={{ padding: 12 }}>
          {!data || prof.isLoading ? <Loading /> : <>
            {tab === 'tong-quan' && <TongQuan code={code} credit={prof.data?.credit} months={prof.data?.months ?? []} docs={docs} allDocs={data.docs} units={data.units} onOpen={(d) => go(`mo=${encodeURIComponent(d.docNo)}`)} onReceipt={(d) => go(`nhan-tu=${d.id}`)} />}
            {tab === 'hop-dong' && <HopDongNcc code={code} list={hds} />}
            {tab === 'ngoai-hd' && <>
              <div className="alert alert-info" style={{ marginBottom: 10 }}>Dành cho giao dịch với NCC chưa có hợp đồng, hoặc chương trình ngoài hợp đồng: giá mua và chính sách khai ở đây, không gắn số hợp đồng. NCC có hợp đồng thì khai trong hợp đồng (thẻ Hợp đồng).</div>
              <GiaVaChinhSach partnerCode={code} contractCode="" />
            </>}
            {tab === 'hoa-don' && <HoaDonNccPage embedPartner={code} />}
            {tab === 'tep' && <>
              <TepDinhKem ownerType="partner" ownerId={code} defaultKind="hop_dong" />
              <div style={{ marginTop: 14 }}><LichSu rows={prof.data?.logs ?? []} partnerCode={code} title="Nhật ký của NCC: hợp đồng, chính sách, giá, tệp, chứng từ — ai làm, lúc nào, đổi gì" /></div>
            </>}
          </>}
        </div>
      </div>
      {editInfo && <PartnerEditor code={code} onClose={() => { setEditInfo(false); void prof.refetch(); }} />}
    </>
  );
}

function TongQuan({ code, credit, months, docs, allDocs, units, onOpen, onReceipt }: { code: string; units?: MhData["units"]; credit?: import('@bizcity/mua-hang-domain').CreditStatus; months: { month: string; amount: number }[]; docs: StoredDoc[]; allDocs: StoredDoc[]; onOpen: (d: StoredDoc) => void; onReceipt: (d: StoredDoc) => void }) {
  const due = useQuery({ queryKey: ['mua-hang', 'due', code], queryFn: () => api.get<{ rows: { docNo: string; dueDate: string; remaining: number; daysOverdue: number; seq?: number; docDate: string }[] }>(`${P}/due`, { partnerCode: code }) });
  const openOrders = docs.filter((d) => d.kind === 'order' && d.status !== 'cancelled' && d.status !== 'draft').map((d) => ({ d, pr: orderProgress(d, allDocs, undefined, units) })).filter((x) => !x.pr.done);
  const max = Math.max(1, ...months.map((m) => m.amount));
  return (
    <div className="mh-grid2">
      <div>
        <h4 className="mh-h4">Đơn đặt hàng đang chờ giao</h4>
        {openOrders.length ? (
          <table className="mh-mini"><thead><tr><th>Đơn</th><th>Ngày</th><th>Chi nhánh</th><th>Đã nhận / đặt</th><th /></tr></thead><tbody>
            {openOrders.map(({ d, pr }) => (
              <tr key={d.id}><td><button className="btn btn-xs btn-ghost mono" onClick={() => onOpen(d)}>{d.docNo}</button></td><td>{dmy(d.docDate)}</td><td>{d.branchCode}</td>
                <td><div className="mh-progress"><span style={{ width: `${pr.ordered ? (pr.received / pr.ordered) * 100 : 0}%` }} /></div><span style={{ fontSize: 11 }}>{pr.received} / {pr.ordered}{pr.receipts.length ? ` · ${pr.receipts.join(', ')}` : ''}</span></td>
                <td><button className="btn btn-xs btn-primary" onClick={() => onReceipt(d)}>Lập phiếu nhập</button></td></tr>
            ))}
          </tbody></table>
        ) : <div className="muted" style={{ fontSize: 12 }}>Không có đơn đang chờ giao.</div>}
        <h4 className="mh-h4" style={{ marginTop: 14 }}>Hạn mức công nợ</h4>
        {credit ? <UsageBar s={credit} /> : <div className="muted" style={{ fontSize: 12 }}>Chưa khai hạn mức — mở hợp đồng › Giá mua và chính sách (hoặc thẻ "Không theo hợp đồng") › + Thêm chính sách › Hạn mức công nợ.</div>}
        <h4 className="mh-h4" style={{ marginTop: 14 }}>Mua theo tháng (trước thuế)</h4>
        {months.length ? <div className="mh-bars">{months.map((m) => <div key={m.month} title={`${m.month}: ${vnd(m.amount)}`}><span style={{ height: `${(m.amount / max) * 100}%` }} /><small>{m.month.slice(5)}/{m.month.slice(2, 4)}</small></div>)}</div> : <div className="muted" style={{ fontSize: 12 }}>Chưa có phiếu nhập đã duyệt.</div>}
      </div>
      <div>
        <h4 className="mh-h4">Khoản phải trả đang mở (theo hạn)</h4>
        <table className="mh-mini"><thead><tr><th>Chứng từ</th><th>Ngày</th><th>Hạn trả</th><th className="num">Còn phải trả</th><th>Tình trạng</th></tr></thead><tbody>
          {(due.data?.rows ?? []).map((r, i) => <tr key={i} className={r.daysOverdue > 0 ? 'mh-row-warn' : ''}><td className="mono">{r.docNo}{r.seq ? ` (đợt ${r.seq})` : ''}</td><td>{dmy(r.docDate)}</td><td>{dmy(r.dueDate)}</td><td className="num">{vnd(r.remaining)}</td><td>{r.daysOverdue > 0 ? <span className="mh-bad">quá {r.daysOverdue} ngày</span> : r.dueDate <= today() ? <span className="mh-warn">đến hạn</span> : 'trong hạn'}</td></tr>)}
          {!due.isLoading && !(due.data?.rows ?? []).length && <tr><td colSpan={5} className="muted">Không còn khoản phải trả.</td></tr>}
        </tbody></table>
      </div>
    </div>
  );
}

/** Nút chứng từ ở đầu hồ sơ NCC: bấm hiện menu nhỏ — Lập mới · Xem danh sách của NCC này (số phiếu) · việc thêm. */
function NutChungTu({ kind, label, icon, primary, docs, go, extra = [] }: { kind: StoredDoc['kind']; label: string; icon: ReactNode; primary?: boolean; docs: StoredDoc[]; go: (q: string) => void; extra?: { label: string; q: string }[] }) {
  const [open, setOpen] = useState(false);
  // Canh menu theo chỗ trống: nút gần mép phải màn hình thì canh phải, còn lại canh trái (không tràn ra ngoài).
  const [right, setRight] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  const mine = docs.filter((d) => d.kind === kind);
  const drafts = mine.filter((d) => d.status === 'draft' || d.status === 'pending_approval').length;
  const pick = (q: string) => { setOpen(false); go(q); };
  return (
    <div ref={ref} className="ncc-act">
      <button className={`btn btn-sm ${primary ? 'btn-primary' : ''}`} aria-expanded={open} onClick={() => { const r = ref.current?.getBoundingClientRect(); setRight(Boolean(r && r.left + 320 > window.innerWidth)); setOpen(!open); }}>{icon} {label} <span style={{ fontSize: 10, opacity: 0.7 }}>▾</span></button>
      {open && (
        <div className="ncc-act-menu" role="menu" style={right ? { right: 0 } : { left: 0 }}>
          <button type="button" role="menuitem" onClick={() => pick(`moi=${kind}`)}><Plus size={13} /> Lập {label.toLowerCase()} mới</button>
          <button type="button" role="menuitem" onClick={() => pick(`loai=${kind}`)}>Xem danh sách {label.toLowerCase()} của NCC này <span className="muted">({mine.length}{drafts ? ` · ${drafts} chưa duyệt` : ''})</span></button>
          {extra.length > 0 && <div className="ncc-act-sep" />}
          {extra.map((x) => <button type="button" role="menuitem" key={x.q} onClick={() => pick(x.q)}>{x.label}</button>)}
        </div>
      )}
    </div>
  );
}

/** "Chứng từ khác ▾": các loại phiếu còn lại như ô "+ Thêm chứng từ…" (đổi hàng, nhận quà, xuất quà, ứng trước, chi phí, CK sau mua) — lập mới hoặc xem danh sách. */
function ChungTuKhac({ docs, go }: { docs: StoredDoc[]; go: (q: string) => void }) {
  const [open, setOpen] = useState(false);
  const [right, setRight] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  const kinds = NEW_KINDS.filter((k) => !['order', 'receipt', 'return', 'payment'].includes(k));
  const label = (k: StoredDoc['kind']) => (k === 'rebate' ? 'Chiết khấu / giảm giá sau mua' : KIND_LABEL[k]);
  const pick = (q: string) => { setOpen(false); go(q); };
  return (
    <div ref={ref} className="ncc-act">
      <button className="btn btn-sm" aria-expanded={open} onClick={() => { const r = ref.current?.getBoundingClientRect(); setRight(Boolean(r && r.left + 380 > window.innerWidth)); setOpen(!open); }}><Plus size={14} /> Chứng từ khác <span style={{ fontSize: 10, opacity: 0.7 }}>▾</span></button>
      {open && (
        <div className="ncc-act-menu" role="menu" style={right ? { right: 0, minWidth: 360 } : { left: 0, minWidth: 360 }}>
          {kinds.map((k) => { const n = docs.filter((d) => d.kind === k).length; return (
            <div key={k} className="row" style={{ alignItems: 'center' }}>
              <button type="button" role="menuitem" style={{ flex: 1 }} onClick={() => pick(`moi=${k}`)}><Plus size={13} /> {label(k)}</button>
              <button type="button" role="menuitem" className="muted" style={{ fontSize: 12 }} title={`Xem danh sách ${label(k).toLowerCase()} của NCC này`} onClick={() => pick(`loai=${k}`)}>xem ({n})</button>
            </div>); })}
        </div>
      )}
    </div>
  );
}

// [2026-11-18 Nguyễn Văn Thủy] hợp đồng mua của NCC (Danh mục hợp đồng, 0163): xem, thêm, mở giá / chính sách / chứng từ theo hợp đồng (đóng góp)
function HopDongNcc({ code, list }: { code: string; list: ContractRow[] }) {
  const navigate = useNavigate();
  const ready = list.filter((c) => c.status === 'active' && c.statusText === 'Đang hiệu lực');
  const nhac = !list.length ? 'NCC chưa có hợp đồng — bấm "Thêm hợp đồng", hoặc khai giá ở thẻ "Không theo hợp đồng".'
    : ready.some((c) => c.pricedItems > 0) ? `Hợp đồng ${ready.filter((c) => c.pricedItems > 0).map((c) => c.code).join(', ')} đã đủ thông tin, có thể lập đơn đặt hàng.`
    : ready.length ? `Hợp đồng ${ready.map((c) => c.code).join(', ')} chưa có giá mua — mở hợp đồng › bước 4 Giá mua và chính sách.`
    : 'Chưa có hợp đồng đang hiệu lực.';
  const khai = (n: number, tong?: number) => (n > 0 ? <span className="badge badge-ok">{tong ? `${n}/${tong}` : 'Đã khai'}</span> : <span className="badge badge-warn">Chưa khai</span>);
  return (
    <div>
      <div className="row" style={{ gap: 6, alignItems: 'center', marginBottom: 6 }}>
        <button className="btn btn-sm btn-primary" onClick={() => navigate(hopDongMoiPath(code))}><Plus size={13} /> Thêm hợp đồng</button>
      </div>
      <table className="mh-mini">
        <thead><tr><th>Số hợp đồng</th><th>Tên hợp đồng</th><th>Hiệu lực từ – đến</th><th>Giá mua</th><th>Chính sách</th><th>Trạng thái</th><th className="num">Còn phải trả</th><th /></tr></thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.code} style={{ cursor: 'pointer' }} onDoubleClick={() => navigate(hopDongPath(c.code))}>
              <td className="mono"><b>{c.code}</b></td><td>{c.name}</td><td>{dmy(c.startDate ?? undefined) || '—'} → {dmy(c.endDate ?? undefined) || '…'}</td>
              <td title="Số mã đã có giá / số mã ghi trong hợp đồng">{khai(c.pricedItems, c.skus.length || undefined)}</td><td>{khai(c.policies)}</td>
              <td><span className={`badge ${c.statusText === 'Đang hiệu lực' ? 'badge-ok' : c.statusText === 'Hết hạn' ? 'badge-warn' : 'badge-gray'}`}>{c.statusText}</span></td>
              <td className="num">{vnd(c.debt)}</td>
              <td><button className="btn btn-xs" onClick={() => navigate(hopDongPath(c.code))}>Mở</button></td>
            </tr>
          ))}
          {!list.length && <tr><td colSpan={8} className="muted">Chưa có hợp đồng mua với NCC này.</td></tr>}
        </tbody>
      </table>
      <div className="alert alert-info" style={{ marginTop: 8, fontSize: 12.5 }}>{nhac}</div>
    </div>
  );
}

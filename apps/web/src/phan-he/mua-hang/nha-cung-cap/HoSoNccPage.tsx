/**
 * HỒ SƠ NHÀ CUNG CẤP — một NCC, mọi thứ ở một nơi (mua hàng đi từ NCC):
 *   đầu trang: thông tin NCC + nợ, quá hạn, hạn mức đã dùng, mua tháng này, đơn đang mở + nút lập chứng từ cho NCC này
 *   Tổng quan · Hợp đồng & điều khoản · Chiết khấu & khuyến mại · Thưởng · Mặt hàng & giá mua ·
 *   Chứng từ · Tệp đính kèm · Nhật ký
 * Chính sách khai ở từng thẻ (NCC khoá sẵn, mẫu nhanh, mã tự đặt <mã NCC>-<loại>) — vẫn lưu một bảng chính sách chung.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ClipboardList, FileSpreadsheet, HandCoins, PackageCheck, Pencil, Plus, RotateCcw } from 'lucide-react';
import { orderProgress, POLICY_LABEL, type Policy, type PolicyKind } from '@ketoan/contracts/mua-hang';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ruleText } from '../chinh-sach/quyTac';
import { PolicyForm, newPolicy } from '../chinh-sach/PolicyForm';
import { nhapNgoaiDon, KIND_LABEL, P, STATUS_LABEL, purchaseApi, today, useMuaHang, useNames, vnd, type MhData, type StoredDoc } from '../du-lieu';
import { UsageBar, dmy, statusBadge } from '../chung';
import { HoaDonNccPage } from '../hoa-don/HoaDonNccPage';
import { TepDinhKem } from '../dinh-kem/TepDinhKem';
import { LichSu } from '../thanh-phan/LichSu';
import { PartnerEditor } from '../../../features/catalog/PartnersPage';
import { MatHangNcc } from './MatHangNcc';
import { ChungTuPage, NEW_KINDS } from '../chung-tu/ChungTuPage';
import { NhanHangNcc } from './NhanHangNcc';
import '../mua-hang.css';

type Tab = 'tong-quan' | 'hop-dong' | 'chiet-khau' | 'thuong' | 'mat-hang' | 'tong-hop' | 'bao-cao' | 'hoa-don' | 'tep' | 'nhat-ky';
const TABS: [Tab, string][] = [['tong-quan', 'Tổng quan'], ['hop-dong', 'Hợp đồng & điều khoản'], ['chiet-khau', 'Chiết khấu & khuyến mại'], ['thuong', 'Thưởng'], ['mat-hang', 'Mặt hàng & giá mua'], ['tong-hop', 'Tổng hợp mua hàng'], ['bao-cao', 'Báo cáo mua hàng'], ['hoa-don', 'Hoá đơn NCC'], ['tep', 'Tệp đính kèm'], ['nhat-ky', 'Nhật ký']];
const KINDS_OF: Partial<Record<Tab, PolicyKind[]>> = {
  'hop-dong': ['contract', 'credit_limit', 'payment_term', 'lot_tracking'],
  'chiet-khau': ['trade_discount', 'item_discount', 'qty_tier', 'payment_discount', 'promo_gift', 'gift_budget'],
  thuong: ['period_rebate', 'target_rebate', 'stage_rebate', 'supply_target'],
};

const LINK_TABS: Record<string, string> = { 'tong-hop': '/mua-hang/tong-hop', 'bao-cao': '/mua-hang/bao-cao' };

export function HoSoNccPage() {
  const { code = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('the');
  // Thẻ Chứng từ cũ (đã bỏ) → Tổng quan; hai thẻ Tổng hợp / Báo cáo mua hàng là liên kết sang MH11 / MH23 (lọc sẵn NCC), không vẽ trong hồ sơ.
  const tab = (rawTab && rawTab !== 'chung-tu' && !LINK_TABS[rawTab] ? rawTab : 'tong-quan') as Tab;
  const setTab = (t: Tab) => setParams((x) => { const n = new URLSearchParams(x); n.set('the', t); return n; }, { replace: true });
  const navigate = useNavigate();
  const names = useNames();
  const { data, refresh } = useMuaHang();
  const prof = useQuery({ queryKey: ['mua-hang', 'supplier', code], queryFn: () => purchaseApi.supplier(code) });
  const [editing, setEditing] = useState<{ p: Policy; kinds: PolicyKind[] } | null>(null);
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
  const addPolicy = (kind: PolicyKind, kinds: PolicyKind[]) => setEditing({ p: newPolicy(kind, { partnerCode: code }), kinds });

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
  const kpis = s && (
    <div className="kpis" style={{ marginBottom: 10 }}>
      <div className="card kpi"><div className="label">Nợ phải trả (theo sổ)</div><div className="value">{vnd(s.debt)}</div><div className="hint">{s.overdue > 0 ? <span className="mh-bad">Quá hạn {vnd(s.overdue)}</span> : 'Không có khoản quá hạn'}{s.advance > 0 ? <span title="Tiền đã ứng / trả trước NCC, chưa đối trừ vào hoá đơn: đã trừ trong nợ phải trả nhưng không trừ vào khoản quá hạn — sẽ tự đối trừ khi nhận hàng + hoá đơn"> · ứng trước chờ đối trừ {vnd(s.advance)}</span> : null}{s.dueSoon > 0 ? ` · sắp đến hạn ${vnd(s.dueSoon)}` : ''}</div></div>
      <div className="card kpi"><div className="label">Hạn mức công nợ</div><div className="value">{s.creditLimit ? vnd(s.creditLimit) : '—'}</div><div className="hint">{s.creditLimit ? `Đã dùng ${Math.round((s.creditUsed / s.creditLimit) * 100)}% · còn ${vnd(s.creditLimit - s.creditUsed)}` : 'Chưa khai — thẻ Hợp đồng & điều khoản'}</div></div>
      <div className="card kpi"><div className="label">Mua tháng này (trước thuế)</div><div className="value">{vnd(s.monthPurchase)}</div><div className="hint">Nhập gần nhất {dmy(s.lastReceipt) || '—'}</div></div>
      <div className="card kpi"><div className="label">Đơn đặt đang mở</div><div className="value">{s.openOrders}</div><div className="hint">{s.policies} chính sách · {s.attachments} tệp · {s.documents} chứng từ</div></div>
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
        <div className="tabs" style={{ marginBottom: 0 }}>{TABS.map(([k, l]) => <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => (LINK_TABS[k] ? navigate(`${LINK_TABS[k]}?ncc=${encodeURIComponent(code)}`) : setTab(k))} title={LINK_TABS[k] ? `Mở ${l} (thẻ mới), lọc sẵn NCC này` : undefined}>{l}{k === 'tong-hop' ? ` (${docs.length}) ↗` : k === 'bao-cao' ? ' ↗' : k === 'mat-hang' ? ` (${s?.items ?? 0})` : KINDS_OF[k] ? ` (${policies.filter((x) => KINDS_OF[k]!.includes(x.kind)).length})` : ''}</button>)}</div>
        <div style={{ padding: 12 }}>
          {!data || prof.isLoading ? <Loading /> : <>
            {tab === 'tong-quan' && <TongQuan code={code} credit={prof.data?.credit} months={prof.data?.months ?? []} docs={docs} allDocs={data.docs} units={data.units} onOpen={(d) => go(`mo=${encodeURIComponent(d.docNo)}`)} onReceipt={(d) => go(`nhan-tu=${d.id}`)} />}
            {tab === 'mat-hang' && <MatHangNcc code={code} data={data} onChanged={reload} />}
            {KINDS_OF[tab] && <PolicyBlock tab={tab} policies={policies} kinds={KINDS_OF[tab]!} onAdd={addPolicy} onEdit={(x) => setEditing({ p: x, kinds: KINDS_OF[tab]! })} />}
            {tab === 'hoa-don' && <HoaDonNccPage embedPartner={code} />}
            {tab === 'tep' && <TepDinhKem ownerType="partner" ownerId={code} defaultKind="hop_dong" />}
            {tab === 'nhat-ky' && <LichSu rows={prof.data?.logs ?? []} partnerCode={code} title="Nhật ký của NCC: chính sách, mặt hàng, tệp, chứng từ — ai làm, lúc nào, đổi gì" />}
          </>}
        </div>
      </div>
      {editInfo && <PartnerEditor code={code} onClose={() => { setEditInfo(false); void prof.refetch(); }} />}
      {editing && <PolicyForm value={editing.p} all={data?.policies ?? []} kinds={editing.kinds} lockPartner onClose={() => setEditing(null)} onSaved={(_code, stay) => { if (!stay) setEditing(null); reload(); }} />}
    </>
  );
}

function TongQuan({ code, credit, months, docs, allDocs, units, onOpen, onReceipt }: { code: string; units?: MhData["units"]; credit?: import('@ketoan/contracts/mua-hang').CreditStatus; months: { month: string; amount: number }[]; docs: StoredDoc[]; allDocs: StoredDoc[]; onOpen: (d: StoredDoc) => void; onReceipt: (d: StoredDoc) => void }) {
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
        {credit ? <UsageBar s={credit} /> : <div className="muted" style={{ fontSize: 12 }}>Chưa khai hạn mức — thẻ Hợp đồng & điều khoản → + Hạn mức công nợ.</div>}
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

function PolicyBlock({ tab, policies, kinds, onAdd, onEdit }: { tab: Tab; policies: Policy[]; kinds: PolicyKind[]; onAdd: (k: PolicyKind, kinds: PolicyKind[]) => void; onEdit: (p: Policy) => void }) {
  const [find, setFind] = useState('');
  const all = policies.filter((p) => kinds.includes(p.kind));
  const rows = all.filter((p) => !find || `${POLICY_LABEL[p.kind]} ${ruleText(p)} ${p.code} ${p.name} ${p.scope.sku ?? ''}`.toLowerCase().includes(find.toLowerCase())).sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  const now = today();
  const hint: Partial<Record<Tab, ReactNode>> = {
    'hop-dong': 'Hợp đồng (file scan gắn ở thẻ Tệp đính kèm), hạn mức công nợ, điều khoản thanh toán, theo dõi lô — phiếu của NCC này tự áp.',
    'chiet-khau': 'Chiết khấu trên đơn, chiết khấu theo mã hàng (bảng nhiều mã, nhập Excel), bậc số lượng, CKTT, mua X tặng Y — phiếu nhập / đơn đặt tự áp, tự thêm hàng tặng.',
    thuong: 'Thưởng doanh số, chỉ tiêu, giai đoạn — tính ở màn Tính thưởng cuối kỳ, phân bổ giảm giá vốn.',
    };
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        {kinds.map((k) => <button key={k} className="btn btn-sm" onClick={() => onAdd(k, kinds)}><Plus size={13} /> {POLICY_LABEL[k]}</button>)}
        <span className="muted" style={{ fontSize: 12 }}>{hint[tab]}</span>
      </div>
      {all.length > 5 && <div className="row" style={{ gap: 6, marginBottom: 6, alignItems: 'center' }}><input className="input" style={{ width: 260 }} placeholder="Tìm chính sách: loại, nội dung, mã" value={find} onChange={(e) => setFind(e.target.value)} /><span className="muted" style={{ fontSize: 12 }}>{rows.length} / {all.length} chính sách</span></div>}
      <div className="scroll-box" style={{ maxHeight: 460 }}>
      <table className="mh-mini">
        <thead><tr><th>STT</th><th>Loại</th><th>Nội dung</th><th>Phạm vi</th><th>Hiệu lực</th><th>Trạng thái</th><th>Mã</th><th>Người tạo · ngày giờ</th><th /></tr></thead>
        <tbody>
          {rows.map((p, i) => {
            const st = !p.isActive ? 'Tắt' : p.validTo && p.validTo < now ? 'Hết hiệu lực' : 'Đang áp';
            return (
              <tr key={p.id} onDoubleClick={() => onEdit(p)} style={{ cursor: 'pointer' }} className={st === 'Đang áp' ? '' : 'muted'}>
                <td>{i + 1}</td><td>{POLICY_LABEL[p.kind]}</td><td style={{ fontSize: 12.5 }}>{ruleText(p)}</td>
                <td>{[p.scope.sku && `Mã ${p.scope.sku}`, p.scope.branchCode, p.scope.brandCode && `Nhãn ${p.scope.brandCode}`].filter(Boolean).join(' · ') || 'Mọi mã, mọi chi nhánh'}</td>
                <td>{dmy(p.validFrom) || '—'} → {dmy(p.validTo) || '…'}</td>
                <td><span className={`badge ${st === 'Đang áp' ? 'badge-ok' : 'badge-gray'}`}>{st}</span></td>
                <td className="mono" style={{ fontSize: 11 }}>{p.code}</td>
                <td style={{ fontSize: 11.5 }}>{p.createdBy || '—'} · {p.createdAt ? new Date(p.createdAt).toLocaleString('vi-VN', { hour12: false }) : ''}</td>
                <td><button className="btn btn-xs" onClick={() => onEdit(p)}>Sửa</button></td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={9} className="muted">{find ? 'Không có chính sách khớp.' : 'Chưa khai — bấm các nút "+" bên trên (có mẫu nhanh, mã tự đặt).'}</td></tr>}
        </tbody>
      </table>
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

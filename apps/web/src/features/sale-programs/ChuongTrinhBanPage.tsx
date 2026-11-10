// [2026-11-10 04:30 PM Nguyễn Văn Thủy] PHASE-026 — chương trình bán có hạn mức thay mã phụ: khai báo, hạn mức theo cửa hàng, báo cáo quản lý (đóng góp)
/**
 * CHƯƠNG TRÌNH BÁN (BH12) — hàng tặng / hàng giảm giá (kể cả cận date) vẫn là MẶT HÀNG CHÍNH, không sinh mã phụ:
 *   chương trình = mặt hàng chính + kiểu (tặng hàng / giảm giá) + thời gian + hạn mức từng cửa hàng.
 *   Cửa hàng bán theo chương trình thì trừ hạn mức (POS gọi /api/v1/sale-programs/consume); hết hạn hoặc hết hạn mức thì bán giá thường.
 * Thẻ "Báo cáo": hạn mức, đã dùng, còn lại, giá trị, tốc độ dùng so với thời gian — tính từ các dòng đã bán.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, Percent, Plus } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal, NumInput } from '@/components/ui';
import { ItemPicker } from '@/components/pickers';
import './chuong-trinh-ban.css';

interface Quota { branchCode: string; quotaQty: number; usedQty: number; remaining: number }
interface Program {
  id: string; code: string; name: string; programKind: string; mode: 'gift' | 'discount'; sku: string; skuName: string | null; buyQty: number; giftSku: string | null; giftSkuName: string | null;
  giftQty: number | null; discountPct: number | null; discountAmount: number | null; salePrice: number | null; validFrom: string; validTo: string; isActive: boolean;
  state: 'running' | 'upcoming' | 'ended' | 'stopped'; version: number; note: string; quotas: Quota[]; quotaTotal: number; usedTotal: number; remainingTotal: number;
}
interface Kind { code: string; name: string; side: string; note: string; isActive: boolean }
interface Branch { id: string; code: string; name: string; isActive?: boolean }
interface ReportRow { programId: string; program: string; name: string; programKind: string; mode: string; sku: string; skuName: string | null; validFrom: string; validTo: string; branchCode: string; quota: number; used: number; remaining: number; usedPct: number; periodQty: number; periodAmount: number; periodDocs: number; pace: number | null }

const money = (n: number) => n.toLocaleString('vi-VN');
const viDate = (d: string) => d.split('-').reverse().join('/');
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);
const STATE: Record<Program['state'], [string, string]> = { running: ['Đang chạy', 'is-active'], upcoming: ['Sắp chạy', 'is-scheduled'], ended: ['Đã hết hạn', 'is-closed'], stopped: ['Đã ngừng', 'is-rejected'] };

function offerText(p: Pick<Program, 'mode' | 'buyQty' | 'giftQty' | 'giftSku' | 'giftSkuName' | 'discountPct' | 'discountAmount' | 'salePrice'>) {
  if (p.mode === 'gift') return `Mua ${p.buyQty} tặng ${p.giftQty} ${p.giftSku ? (p.giftSkuName ?? p.giftSku) : 'chính hàng này'}`;
  if (p.discountPct) return `Giảm ${p.discountPct}%`;
  if (p.discountAmount) return `Giảm ${money(p.discountAmount)} đ / đơn vị`;
  return `Giá chương trình ${money(p.salePrice ?? 0)} đ`;
}

const useKinds = () => useQuery({ queryKey: ['program-kinds'], queryFn: () => api.get<Kind[]>('/api/v1/program-kinds'), staleTime: 60_000 });
const useBranches = () => useQuery({ queryKey: ['branches'], queryFn: () => api.get<Branch[]>('/api/v1/branches'), staleTime: 60_000 });

// ------------------------------------------------------------------------------------------------ hộp khai báo
interface Form {
  code: string; name: string; programKind: string; mode: 'gift' | 'discount'; sku: string; buyQty: number; giftSku: string; giftQty: number;
  discountWay: 'pct' | 'amount' | 'price'; discountValue: number; validFrom: string; validTo: string; isActive: boolean; note: string; quotas: Record<string, number>;
}

function ProgramEditor({ program, onClose }: { program: Program | null; onClose: () => void }) {
  const qc = useQueryClient();
  const kinds = (useKinds().data ?? []).filter((k) => k.side !== 'purchase' && k.isActive);
  const branches = (useBranches().data ?? []).filter((b) => b.isActive !== false);
  const [f, setF] = useState<Form>(() => program ? {
    code: program.code, name: program.name, programKind: program.programKind, mode: program.mode, sku: program.sku, buyQty: program.buyQty, giftSku: program.giftSku ?? '', giftQty: program.giftQty ?? 1,
    discountWay: program.discountPct ? 'pct' : program.discountAmount ? 'amount' : 'price', discountValue: program.discountPct ?? program.discountAmount ?? program.salePrice ?? 0,
    validFrom: program.validFrom, validTo: program.validTo, isActive: program.isActive, note: program.note, quotas: Object.fromEntries(program.quotas.map((q) => [q.branchCode, q.quotaQty])),
  } : { code: '', name: '', programKind: 'KM-CTY', mode: 'gift', sku: '', buyQty: 1, giftSku: '', giftQty: 1, discountWay: 'pct', discountValue: 10, validFrom: today(), validTo: addDays(today(), 30), isActive: true, note: '', quotas: {} });
  const [editing, setEditing] = useState(!program);
  const [bulk, setBulk] = useState(0);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const used = new Map((program?.quotas ?? []).map((q) => [q.branchCode, q.usedQty]));
  const total = Object.values(f.quotas).reduce((a, b) => a + (b || 0), 0);
  const save = useMutation({
    mutationFn: () => {
      const body = {
        code: f.code, name: f.name, programKind: f.programKind, mode: f.mode, sku: f.sku, validFrom: f.validFrom, validTo: f.validTo, isActive: f.isActive, note: f.note,
        ...(f.mode === 'gift' ? { buyQty: f.buyQty, giftSku: f.giftSku || null, giftQty: f.giftQty } : { [f.discountWay === 'pct' ? 'discountPct' : f.discountWay === 'amount' ? 'discountAmount' : 'salePrice']: f.discountValue }),
        quotas: Object.entries(f.quotas).filter(([b, q]) => q > 0 || (used.get(b) ?? 0) > 0).map(([branchCode, quotaQty]) => ({ branchCode, quotaQty: quotaQty || 0 })),
      };
      return program ? api.put(`/api/v1/sale-programs/${program.id}`, body) : api.post('/api/v1/sale-programs', body);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['sale-programs'] }); onClose(); },
  });
  const ro = !editing;
  const kindNote = kinds.find((k) => k.code === f.programKind)?.note;
  return (
    <Modal title={program ? `Chương trình ${program.code}` : 'Thêm chương trình bán'} onClose={onClose} wide
      footer={<>
        {editing ? <button className="btn btn-primary" disabled={save.isPending || !f.code || !f.name || !f.sku} onClick={() => save.mutate()}>{save.isPending ? 'Đang lưu…' : 'Lưu'}</button>
          : <button className="btn btn-primary" onClick={() => setEditing(true)}>Sửa</button>}
        <button className="btn" onClick={onClose}>Thoát</button>
      </>}>
      <ErrorBox error={save.error ? errorText(save.error) : null} />
      <div className="alert alert-info full">Hàng tặng / giảm giá vẫn là mặt hàng chính, <b>không sinh mã mới</b>. Cửa hàng chỉ bán theo chương trình khi còn hạn và còn hạn mức.</div>
      <Field label="Mã chương trình" tip="Dòng bán gắn mã này; không đổi được sau khi lưu"><input className="input mono" disabled={ro || Boolean(program)} value={f.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="vd: KM-T11-LY" autoFocus={!program} /></Field>
      <Field label="Tên chương trình"><input className="input" disabled={ro} value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="vd: Mua sữa tặng ly tháng 11" /></Field>
      <Field label="Loại chương trình" tip={kindNote || 'Nhóm chương trình để báo cáo'}>
        <select className="select input" disabled={ro} value={f.programKind} onChange={(e) => set('programKind', e.target.value)}>
          {kinds.map((k) => <option key={k.code} value={k.code}>{k.code} — {k.name}</option>)}
        </select>
      </Field>
      <Field label="Mặt hàng chính" tip="Mặt hàng được áp chương trình"><ItemPicker value={f.sku} onChange={(v) => set('sku', v ?? '')} disabled={ro} /></Field>
      <div className="ctb-mode full">
        <button type="button" disabled={ro} className={`ctb-mode-btn ${f.mode === 'gift' ? 'is-on' : ''}`} onClick={() => set('mode', 'gift')}><Gift size={16} /> Tặng hàng</button>
        <button type="button" disabled={ro} className={`ctb-mode-btn ${f.mode === 'discount' ? 'is-on' : ''}`} onClick={() => set('mode', 'discount')}><Percent size={16} /> Giảm giá (kể cả cận date)</button>
      </div>
      {f.mode === 'gift' ? <>
        <Field label="Mua (số lượng)" tip="Mua đủ số lượng này (ĐVT nhỏ nhất) thì được tặng"><NumInput value={f.buyQty} onChange={(v) => set('buyQty', v ?? 1)} disabled={ro} /></Field>
        <Field label="Tặng (số lượng)"><NumInput value={f.giftQty} onChange={(v) => set('giftQty', v ?? 1)} disabled={ro} /></Field>
        <Field label="Hàng tặng" tip="Bỏ trống = tặng chính mặt hàng chính"><ItemPicker value={f.giftSku} onChange={(v) => set('giftSku', v ?? '')} disabled={ro} placeholder="chính mặt hàng chính" /></Field>
      </> : <>
        <Field label="Cách giảm">
          <select className="select input" disabled={ro} value={f.discountWay} onChange={(e) => set('discountWay', e.target.value as Form['discountWay'])}>
            <option value="pct">Giảm phần trăm</option><option value="amount">Giảm số tiền / đơn vị</option><option value="price">Giá bán chương trình / đơn vị</option>
          </select>
        </Field>
        <Field label={f.discountWay === 'pct' ? 'Phần trăm giảm' : f.discountWay === 'amount' ? 'Số tiền giảm (đ)' : 'Giá bán (đ)'}><NumInput value={f.discountValue} onChange={(v) => set('discountValue', v ?? 0)} decimals={f.discountWay === 'pct' ? 2 : 0} disabled={ro} /></Field>
      </>}
      <Field label="Từ ngày"><input type="date" className="input" disabled={ro} value={f.validFrom} onChange={(e) => set('validFrom', e.target.value)} /></Field>
      <Field label="Đến ngày" tip="Gồm cả ngày này"><input type="date" className="input" disabled={ro} value={f.validTo} onChange={(e) => set('validTo', e.target.value)} /></Field>
      <label className="checkbox" title="Bỏ tích để ngừng sớm"><input type="checkbox" disabled={ro} checked={f.isActive} onChange={(e) => set('isActive', e.target.checked)} /> Đang áp dụng</label>
      <Field label="Ghi chú" full><input className="input" disabled={ro} value={f.note} onChange={(e) => set('note', e.target.value)} /></Field>

      <div className="ctb-quota full">
        <div className="ctb-quota-head">
          <b>Hạn mức theo cửa hàng</b>
          <span className="muted" title="Số quà được tặng / số được bán giá giảm ở mỗi cửa hàng">Tổng {money(total)} {f.mode === 'gift' ? 'quà' : 'đơn vị'}</span>
          {!ro && <span className="ctb-bulk">Đặt mọi cửa hàng <NumInput value={bulk} onChange={(v) => setBulk(v ?? 0)} decimals={0} style={{ width: 80 }} />
            <button type="button" className="btn btn-xs" onClick={() => set('quotas', Object.fromEntries(branches.map((b) => [b.code, Math.max(bulk, used.get(b.code) ?? 0)])))}>Áp</button></span>}
        </div>
        <div className="ctb-quota-grid">
          {branches.map((b) => {
            const u = used.get(b.code) ?? 0;
            const q = f.quotas[b.code] ?? 0;
            return (
              <label key={b.code} className={`ctb-quota-cell ${q ? 'has' : ''}`} title={`${b.name}${u ? ` · đã dùng ${u}` : ''}`}>
                <span className="ctb-branch">{b.code}<span className="muted"> {b.name}</span></span>
                <NumInput value={q} onChange={(v) => setF((x) => ({ ...x, quotas: { ...x.quotas, [b.code]: v ?? 0 } }))} decimals={0} disabled={ro} />
                {u > 0 && <span className="ctb-used" title="Đã dùng — hạn mức không hạ dưới số này">dùng {u}</span>}
              </label>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------------------------------------ danh sách
function DanhSach() {
  const [state, setState] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Program | null | undefined>(undefined);
  const q = useQuery({ queryKey: ['sale-programs', state, search], queryFn: () => api.get<Program[]>('/api/v1/sale-programs', { ...(state ? { state } : {}), ...(search.trim() ? { search: search.trim() } : {}) }) });
  const rows = q.data ?? [];
  return (
    <div>
      <div className="ctb-toolbar">
        <input className="input" style={{ width: 240 }} placeholder="Tìm mã, tên chương trình, mã hàng" value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="tabs" style={{ margin: 0 }}>
          {[['', 'Tất cả'], ['running', 'Đang chạy'], ['upcoming', 'Sắp chạy'], ['ended', 'Đã hết hạn'], ['stopped', 'Đã ngừng']].map(([k, l]) => (
            <button key={k} type="button" className={`tab ${state === k ? 'active' : ''}`} onClick={() => setState(k!)}>{l}</button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" onClick={() => setEditing(null)}><Plus size={13} /> Thêm chương trình</button>
      </div>
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {q.isLoading ? <Loading /> : (
        <div className="table-wrap"><table className="grid">
          <thead><tr>
            <th title="Mã chương trình (dòng bán gắn mã này)">Mã</th><th title="Tên chương trình">Tên</th><th title="Loại chương trình">Loại</th><th title="Mặt hàng chính">Mặt hàng</th>
            <th title="Nội dung ưu đãi">Ưu đãi</th><th title="Thời gian áp dụng">Thời gian</th><th className="num" title="Tổng hạn mức các cửa hàng">Hạn mức</th>
            <th className="num" title="Đã dùng (đã bán theo chương trình)">Đã dùng</th><th className="num" title="Còn lại">Còn lại</th><th title="Trạng thái">Trạng thái</th>
          </tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="clickable" onClick={() => setEditing(p)}>
                <td className="mono">{p.code}</td><td>{p.name}</td><td className="mono">{p.programKind}</td>
                <td title={p.skuName ?? ''}><span className="mono">{p.sku}</span> <span className="muted">{p.skuName}</span></td>
                <td>{offerText(p)}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{viDate(p.validFrom)} → {viDate(p.validTo)}</td>
                <td className="num">{money(p.quotaTotal)}</td><td className="num">{money(p.usedTotal)}</td>
                <td className="num"><b className={p.remainingTotal ? '' : 'neg'}>{money(p.remainingTotal)}</b></td>
                <td><span className={`tkht-badge ${STATE[p.state][1]}`}>{STATE[p.state][0]}</span></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={10} className="muted">Chưa có chương trình. Thêm chương trình thay cho việc tạo mã tặng / mã giảm giá riêng.</td></tr>}
          </tbody>
        </table></div>
      )}
      {editing !== undefined && <ProgramEditor key={editing?.id ?? 'new'} program={editing} onClose={() => setEditing(undefined)} />}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ báo cáo
function BaoCao() {
  const [from, setFrom] = useState(today().slice(0, 8) + '01');
  const [to, setTo] = useState(today());
  const [kind, setKind] = useState('');
  const [branch, setBranch] = useState('');
  const kinds = useKinds().data ?? [];
  const branches = useBranches().data ?? [];
  const q = useQuery({ queryKey: ['sale-programs', 'report', from, to, kind, branch], queryFn: () => api.get<{ items: ReportRow[]; totals: { quota: number; used: number; periodQty: number; periodAmount: number } }>('/api/v1/sale-programs/report', { from, to, ...(kind ? { kind } : {}), ...(branch ? { branchCode: branch } : {}) }) });
  const items = q.data?.items ?? [];
  const groups = useMemo(() => {
    const m = new Map<string, ReportRow[]>();
    for (const r of items) m.set(r.program, [...(m.get(r.program) ?? []), r]);
    return [...m.entries()];
  }, [items]);
  return (
    <div>
      <div className="ctb-toolbar">
        <label>Từ <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label>Đến <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label>Loại <select className="select input" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Tất cả</option>{kinds.map((k) => <option key={k.code} value={k.code}>{k.name}</option>)}</select></label>
        <label>Cửa hàng <select className="select input" value={branch} onChange={(e) => setBranch(e.target.value)}><option value="">Tất cả</option>{branches.map((b) => <option key={b.code} value={b.code}>{b.code} — {b.name}</option>)}</select></label>
      </div>
      <ErrorBox error={q.error ? errorText(q.error) : null} />
      {q.data && (
        <div className="ctb-kpi">
          <div><span>Hạn mức</span><b>{money(q.data.totals.quota)}</b></div>
          <div><span>Đã dùng (tổng)</span><b>{money(q.data.totals.used)}</b></div>
          <div><span>Dùng trong kỳ</span><b>{money(q.data.totals.periodQty)}</b></div>
          <div><span>Giá trị trong kỳ</span><b>{money(q.data.totals.periodAmount)} đ</b></div>
        </div>
      )}
      {q.isLoading ? <Loading /> : (
        <div className="table-wrap"><table className="grid">
          <thead><tr>
            <th title="Chương trình">Chương trình</th><th title="Cửa hàng">Cửa hàng</th><th className="num" title="Hạn mức của cửa hàng">Hạn mức</th><th className="num" title="Đã dùng từ đầu chương trình">Đã dùng</th>
            <th className="num" title="Còn lại">Còn lại</th><th title="Phần đã dùng trên hạn mức">Tiến độ</th>
            <th className="num" title="Tốc độ dùng so với thời gian đã trôi: trên 100 = dùng nhanh hơn kế hoạch (sắp hết sớm), dưới 100 = chậm (còn tồn)">Tốc độ</th>
            <th className="num" title="Số lượng dùng trong khoảng ngày lọc">Trong kỳ</th><th className="num" title="Giá trị quà / tiền giảm trong kỳ">Giá trị trong kỳ</th><th className="num" title="Số phiếu bán trong kỳ">Số phiếu</th>
          </tr></thead>
          <tbody>
            {groups.map(([code, rows]) => rows.map((r, i) => (
              <tr key={`${code}-${r.branchCode}`}>
                {i === 0 && <td rowSpan={rows.length} title={`${r.sku} ${r.skuName ?? ''} · ${viDate(r.validFrom)} → ${viDate(r.validTo)}`}><b className="mono">{code}</b><div className="muted">{r.name}</div></td>}
                <td className="mono">{r.branchCode}</td>
                <td className="num">{money(r.quota)}</td><td className="num">{money(r.used)}</td>
                <td className="num"><b className={r.remaining ? '' : 'neg'}>{money(r.remaining)}</b></td>
                <td><div className="ctb-bar" title={`${r.usedPct}%`}><i style={{ width: `${Math.min(100, r.usedPct)}%` }} /></div></td>
                <td className={`num ${r.pace !== null && r.pace > 120 ? 'neg' : ''}`}>{r.pace ?? ''}</td>
                <td className="num">{money(r.periodQty)}</td><td className="num">{money(r.periodAmount)}</td><td className="num">{r.periodDocs}</td>
              </tr>
            )))}
            {!items.length && <tr><td colSpan={10} className="muted">Không có chương trình nào trong khoảng ngày này.</td></tr>}
          </tbody>
        </table></div>
      )}
    </div>
  );
}

export function ChuongTrinhBanPage() {
  const [tab, setTab] = useState<'ds' | 'bc'>('ds');
  return (
    <div className="page">
      <PageHeader title="Chương trình bán" code="BH12" helpKey="bh-chuong-trinh"
        subtitle="Quà tặng, giảm giá, xả hàng cận date trên chính mặt hàng — có thời gian và hạn mức từng cửa hàng, không sinh mã mới" />
      <div className="tabs" role="tablist" style={{ marginBottom: 8 }}>
        <button role="tab" className={`tab ${tab === 'ds' ? 'active' : ''}`} onClick={() => setTab('ds')}>Chương trình</button>
        <button role="tab" className={`tab ${tab === 'bc' ? 'active' : ''}`} onClick={() => setTab('bc')} title="Hạn mức, đã dùng, còn lại theo cửa hàng — tính từ các dòng đã bán">Báo cáo quản lý</button>
      </div>
      {tab === 'ds' ? <DanhSach /> : <BaoCao />}
    </div>
  );
}

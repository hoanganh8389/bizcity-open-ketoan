/**
 * Tài sản (KT-19 … KT-21):
 *  - PostingDialog: hạch toán ghi tăng, ghi giảm / thanh lý một thẻ thành phiếu kế toán. Phần mềm gợi ý định khoản
 *    (ghi tăng: Nợ TK nguyên giá / chờ phân bổ; ghi giảm: Nợ hao mòn / Có nguyên giá, Nợ 8111 / Có nguyên giá phần còn lại),
 *    kế toán sửa, thêm dòng giá bán (Nợ 131 / Có 7111, kèm thuế GTGT) và chi phí thanh lý (Nợ 8111 / Có 111) rồi ghi.
 *  - PlanDialog: lịch khấu hao / phân bổ cả vòng đời của một thẻ (đã ghi sổ, còn thiếu, kế hoạch).
 *  - AssetPlanPage (TS01): kế hoạch khấu hao / phân bổ các tháng tới của mọi thẻ.
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import type { VoucherLine } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { money, today } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ErrorBox, Field, Loading, Modal } from '@/components/ui';
import { AccountPicker, PartnerPicker } from '@/components/pickers';

type Line = { debitAccount: string; creditAccount: string; amount: string; description: string; partnerCode: string; taxCode: string; taxAmount: string; costItem?: string; department?: string; contract?: string };
interface Suggestion { asset: { code: string; name: string; kind: string; branchCode: string; currentCost: number; accumulated: number; remaining: number; lastPeriod: string | null }; lines: (Omit<Line, 'amount' | 'partnerCode' | 'taxCode' | 'taxAmount'> & { amount: number })[]; warnings: string[] }

const parseMoney = (s: string) => (s.trim() === '' ? undefined : Number(s.replace(/[^\d-]/g, '')));
const blank = (p: Partial<Line> = {}): Line => ({ debitAccount: '', creditAccount: '', amount: '', description: '', partnerCode: '', taxCode: '', taxAmount: '', ...p });

export function PostingDialog({ code, kind, onClose }: { code: string; kind: 'increase' | 'decrease'; onClose: () => void }) {
  const qc = useQueryClient();
  const [docDate, setDocDate] = useState(today());
  const [description, setDescription] = useState('');
  const [partnerCode, setPartnerCode] = useState('');
  const [markDisposed, setMarkDisposed] = useState(true);
  const [lines, setLines] = useState<Line[]>([]);
  const [done, setDone] = useState<string | null>(null);
  const sug = useQuery({ queryKey: ['asset-posting-suggestion', code, kind, docDate], queryFn: () => api.get<Suggestion>(`/api/v1/assets/${encodeURIComponent(code)}/posting-suggestion`, { kind, date: docDate }) });
  useEffect(() => {
    if (!sug.data) return;
    setLines(sug.data.lines.map((l) => blank({ ...l, amount: money(l.amount) })));
    setDescription((d) => d || `${kind === 'increase' ? 'Ghi tăng' : 'Ghi giảm'} ${sug.data.asset.name} (${sug.data.asset.code})`);
  }, [sug.data, kind]);
  const setLine = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const salePrice = lines.filter((l) => l.creditAccount.startsWith('711')).reduce((s, l) => s + (parseMoney(l.amount) ?? 0), 0);
  const disposalCost = lines.filter((l) => l.debitAccount.startsWith('811') && !/còn lại/i.test(l.description)).reduce((s, l) => s + (parseMoney(l.amount) ?? 0), 0);
  const save = useMutation({
    mutationFn: () => api.post<{ docNo: string }>(`/api/v1/assets/${encodeURIComponent(code)}/postings`, {
      kind, docDate, description, partnerCode: partnerCode || undefined, markDisposed,
      salePrice: salePrice || undefined, disposalCost: disposalCost || undefined,
      lines: lines.map((l) => ({
        debitAccount: l.debitAccount, creditAccount: l.creditAccount, amount: parseMoney(l.amount) ?? 0, description: l.description,
        partnerCode: l.partnerCode || undefined, costItem: l.costItem || undefined, department: l.department || undefined, contract: l.contract || undefined,
        ...(l.taxCode ? { taxCode: l.taxCode, taxAmount: parseMoney(l.taxAmount) ?? 0 } : {}),
      }) as VoucherLine),
    }),
    onSuccess: (r) => {
      setDone(`Đã ghi sổ phiếu kế toán ${r.docNo}. Sửa / huỷ phiếu ở màn Phiếu kế toán.`);
      for (const k of [['assets'], ['asset-events'], ['documents'], ['asset-register'], ['asset-plan']]) void qc.invalidateQueries({ queryKey: k });
    },
  });
  const ok = lines.length > 0 && lines.every((l) => l.debitAccount && l.creditAccount && l.debitAccount !== l.creditAccount && (parseMoney(l.amount) ?? 0) > 0);
  const a = sug.data?.asset;
  return (
    <Modal wide title={`${kind === 'increase' ? 'Hạch toán ghi tăng' : 'Hạch toán ghi giảm / thanh lý'} — ${code}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Đóng</button>{!done && <button className="btn btn-primary" disabled={!ok || save.isPending} onClick={() => save.mutate()}>Ghi sổ phiếu kế toán</button>}</>}>
      {done && <div className="alert alert-ok full">{done}</div>}
      {a && <div className="full muted">{a.name} · nguyên giá <b>{money(a.currentCost)}</b> · đã {a.kind === 'fixed_asset' ? 'khấu hao' : 'phân bổ'} <b>{money(a.accumulated)}</b> · còn lại <b>{money(a.remaining)}</b>{a.lastPeriod ? ` · tới tháng ${a.lastPeriod.slice(5)}/${a.lastPeriod.slice(0, 4)}` : ''}</div>}
      {sug.data?.warnings.map((w) => <div key={w} className="alert alert-warn full">{w}</div>)}
      <Field label={kind === 'increase' ? 'Ngày ghi tăng' : 'Ngày ghi giảm'}><input type="date" className="input" value={docDate} onChange={(e) => setDocDate(e.target.value)} /></Field>
      <Field label={kind === 'increase' ? 'Nhà cung cấp (đối tượng của phiếu)' : 'Đối tượng của phiếu'}><PartnerPicker activeOnly value={partnerCode} onChange={setPartnerCode} placeholder="Không bắt buộc" /></Field>
      <Field label="Diễn giải" full><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      <div className="full">
        <table className="grid">
          <thead><tr><th>TK Nợ</th><th>TK Có</th><th className="num">Số tiền</th><th>Thuế (mã / tiền)</th><th>Đối tượng dòng</th><th>Diễn giải</th><th /></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td style={{ minWidth: 120 }}><AccountPicker postingOnly value={l.debitAccount} onChange={(debitAccount) => setLine(i, { debitAccount })} /></td>
                <td style={{ minWidth: 120 }}><AccountPicker postingOnly value={l.creditAccount} onChange={(creditAccount) => setLine(i, { creditAccount })} placeholder="331, 112, 241…" /></td>
                <td><input className="input num" style={{ width: 130 }} inputMode="numeric" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} onBlur={() => setLine(i, { amount: money(parseMoney(l.amount) ?? 0) })} /></td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <input className="input mono" style={{ width: 60 }} value={l.taxCode} placeholder="R10" onChange={(e) => setLine(i, { taxCode: e.target.value.trim().toUpperCase() })} />{' '}
                  {l.taxCode && <input className="input num" style={{ width: 100 }} value={l.taxAmount} onChange={(e) => setLine(i, { taxAmount: e.target.value })} />}
                </td>
                <td style={{ minWidth: 150 }}><PartnerPicker activeOnly value={l.partnerCode} onChange={(partnerCode) => setLine(i, { partnerCode })} placeholder="Như phiếu" /></td>
                <td><input className="input" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} /></td>
                <td><button className="btn btn-sm" title="Bỏ dòng" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}><Trash2 size={14} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" onClick={() => setLines((ls) => [...ls, blank()])}><Plus size={14} /> Thêm dòng</button>
          {kind === 'decrease' && (
            <>
              <button className="btn btn-sm" onClick={() => setLines((ls) => [...ls, blank({ debitAccount: '1311', creditAccount: '7111', description: 'Thu nhập thanh lý, nhượng bán tài sản', taxCode: 'R10' })])}><Plus size={14} /> Giá bán thanh lý</button>
              <button className="btn btn-sm" onClick={() => setLines((ls) => [...ls, blank({ debitAccount: '8111', creditAccount: '1111', description: 'Chi phí thanh lý, nhượng bán tài sản' })])}><Plus size={14} /> Chi phí thanh lý</button>
            </>
          )}
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Dòng có mã thuế (R10, R08… thuế đầu ra; V10… thuế đầu vào): "Số tiền" là tiền chưa thuế, phần thuế ghi vào tài khoản thuế của loại thuế.</div>
      </div>
      {kind === 'decrease' && (
        <Field label="Thẻ tài sản">
          <label className="checkbox" style={{ height: 34 }}><input type="checkbox" checked={markDisposed} onChange={(e) => setMarkDisposed(e.target.checked)} /> Chuyển thẻ sang "Đã ghi giảm" từ ngày này (thôi trích)</label>
        </Field>
      )}
      <ErrorBox error={sug.error ? errorText(sug.error) : save.error ? errorText(save.error) : null} />
    </Modal>
  );
}

/* ----------------------------------------------------------------------------------------------- */

interface PlanMonth { period: string; amount: number; status: 'posted' | 'planned' | 'missing'; accumulated: number; remaining: number }
const STATUS: Record<PlanMonth['status'], string> = { posted: 'Đã ghi sổ', planned: 'Kế hoạch', missing: 'Chưa trích' };
const mm = (p: string) => `${p.slice(5)}/${p.slice(0, 4)}`;

export function PlanDialog({ code, onClose }: { code: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['asset-plan', code], queryFn: () => api.get<{ name: string; depreciable: number; months: PlanMonth[] }>(`/api/v1/assets/${encodeURIComponent(code)}/plan`) });
  return (
    <Modal wide title={`Lịch khấu hao / phân bổ — ${code}`} onClose={onClose} footer={<button className="btn" onClick={onClose}>Đóng</button>}>
      <div className="full">
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : q.data && (
          <>
            <div className="muted" style={{ marginBottom: 6 }}>{q.data.name} · giá trị tính khấu hao <b>{money(q.data.depreciable)}</b> · {q.data.months.length} tháng</div>
            <div className="table-wrap" style={{ maxHeight: 420 }}>
              <table className="grid">
                <thead><tr><th>Tháng</th><th>Trạng thái</th><th className="num">Số trích</th><th className="num">Luỹ kế</th><th className="num">Còn lại</th></tr></thead>
                <tbody>
                  {q.data.months.map((m) => (
                    <tr key={m.period}>
                      <td>{mm(m.period)}</td>
                      <td><span className={`badge ${m.status === 'posted' ? 'badge-ok' : m.status === 'missing' ? 'badge-bad' : ''}`}>{STATUS[m.status]}</span></td>
                      <td className="num">{money(m.amount)}</td><td className="num">{money(m.accumulated)}</td><td className="num">{money(m.remaining)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------------------------------------------- */

interface PlanRow { code: string; name: string; kind: string; branchCode: string; depreciable: number; accumulatedBefore: number; amounts: number[]; statuses: (PlanMonth['status'] | null)[]; total: number }
const KIND: Record<string, string> = { fixed_asset: 'TSCĐ', tool: 'CCDC', prepaid: 'Trả trước' };

export function AssetPlanPage() {
  const [from, setFrom] = useState(today().slice(0, 7));
  const [months, setMonths] = useState(12);
  const [kind, setKind] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['asset-plan', 'all', from, months, kind], queryFn: () => api.get<{ periods: string[]; rows: PlanRow[]; totals: number[] }>('/api/v1/assets/plan', { from, months, kind: kind || undefined }) });
  const columns = useMemo<Column<PlanRow>[]>(() => [
    { key: 'code', header: 'Mã', type: 'code', width: 90 },
    { key: 'name', header: 'Tên', width: 200 },
    { key: 'kind', header: 'Nhóm', value: (r) => KIND[r.kind] ?? r.kind, width: 80 },
    { key: 'branchCode', header: 'Chi nhánh', type: 'code', width: 80 },
    { key: 'depreciable', header: 'Giá trị tính KH', type: 'money', sum: true },
    { key: 'accumulatedBefore', header: 'Luỹ kế đầu kỳ', type: 'money', sum: true },
    ...(q.data?.periods ?? []).map((p, i) => ({
      key: `m${i}`, header: mm(p), band: 'Số trích theo tháng', type: 'money' as const, sum: true, value: (r: PlanRow) => r.amounts[i] ?? 0,
      render: (r: PlanRow) => <span className={r.statuses[i] === 'missing' ? 'text-bad' : r.statuses[i] === 'posted' ? '' : 'muted'} title={r.statuses[i] ? STATUS[r.statuses[i]!] : ''}>{r.amounts[i] ? money(r.amounts[i]!) : ''}</span>,
    })),
    { key: 'total', header: 'Cộng', type: 'money', sum: true, bold: true },
  ], [q.data]);
  return (
    <>
      <PageHeader title="Kế hoạch khấu hao, phân bổ" code="TS01" subtitle="Số khấu hao / phân bổ từng tháng của mọi tài sản, công cụ, chi phí trả trước: tháng đã ghi sổ và kế hoạch các tháng tới" helpKey="tai-san" />
      <div className="card">
        <div className="filters">
          <div className="field"><label>Từ tháng</label><input type="month" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="field"><label>Số tháng</label><select className="select input" value={months} onChange={(e) => setMonths(Number(e.target.value))}>{[3, 6, 12, 24, 36].map((n) => <option key={n} value={n}>{n} tháng</option>)}</select></div>
          <div className="field"><label>Nhóm</label><select className="select input" value={kind} onChange={(e) => setKind(e.target.value)}><option value="">Tất cả</option><option value="fixed_asset">Tài sản cố định</option><option value="tool">Công cụ dụng cụ</option><option value="prepaid">Chi phí trả trước</option></select></div>
        </div>
        <div style={{ padding: '0 16px 16px' }}>
          <div className="muted" style={{ marginBottom: 6 }}>Số đen: đã ghi sổ · số xám: kế hoạch (tính theo thẻ hiện tại) · số đỏ: tháng đã qua chưa trích. Bấm một dòng để xem lịch cả vòng đời.</div>
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : <DataGrid storageKey="ts01" rows={q.data?.rows ?? []} rowKey={(r) => r.code} columns={columns} onRowClick={(r) => setOpen(r.code)} exportName={`ke-hoach-khau-hao-${from}`} exportTitle={`Kế hoạch khấu hao, phân bổ ${months} tháng từ ${mm(from)}`} />}
        </div>
      </div>
      {open && <PlanDialog code={open} onClose={() => setOpen(null)} />}
    </>
  );
}

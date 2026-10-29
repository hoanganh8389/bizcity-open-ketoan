/**
 * Số dư tài khoản đầu kỳ: nhập một lần khi bắt đầu dùng phần mềm (hoặc khi mở thêm chi nhánh).
 * Mỗi lần nhập là một phiếu "Số dư đầu kỳ" theo chi nhánh; sửa được, huỷ được như phiếu kế toán.
 * Nhập nhanh: dán từ Excel 4 cột  Tài khoản | Mã đối tượng | Dư Nợ | Dư Có.
 */
import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardPaste, Plus, Trash2 } from 'lucide-react';
import type { OpeningInput } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { date, money } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { useBranches, BranchPicker } from '@/components/filters';
import { Empty, ErrorBox, Field, Loading, Modal, Money, StatusBadge, useViewAgain } from '@/components/ui';
import { DocumentDetail } from '../../../features/documents/DocumentDetail';
import { AccountPicker, PartnerPicker } from '@/components/pickers';

interface Row { id: string; docKey: string; docNo: string; docDate: string; total: number; status: string; branchCode: string; description: string; version: number }
interface Existing { id: string; docKey: string; docNo: string; status: string; version: number; payload: OpeningInput }
interface Account { code: string; name: string; trackPartner: boolean; isDebt?: boolean; normalSide: string }
interface LineDraft { account: string; partner: string; debit: string; credit: string }

const blank = (): LineDraft => ({ account: '', partner: '', debit: '', credit: '' });
const parseAmount = (s: string): number => Number(String(s).replace(/[.,\s]/g, '')) || 0;
const show = (s: string): string => (parseAmount(s) ? money(parseAmount(s)) : '');

export function OpeningBalancesPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [form, setForm] = useState<{ existing?: Existing } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['documents', 'opening'], queryFn: () => api.getPage<Row[]>('/api/v1/documents', { docType: 'opening', pageSize: 200 }), placeholderData: keepPreviousData });
  const rows = q.data?.data ?? [];

  const open = async (r: Row) => {
    setLoadError(null);
    try {
      setForm({ existing: await qc.fetchQuery({ queryKey: ['document', r.id], queryFn: () => api.get<Existing>(`/api/v1/documents/${r.id}`), staleTime: 0 }) });
    } catch (e) {
      setLoadError(errorText(e));
    }
  };

  return (
    <>
      <PageHeader
        title="Số dư tài khoản"
        code="ACC15"
        subtitle="Số dư đầu kỳ của từng tài khoản, từng đối tượng khi bắt đầu dùng phần mềm"
        helpKey="so-du-tai-khoan"
        actions={can('documents:write') ? <button className="btn btn-primary" onClick={() => { setNotice(null); setForm({}); }}><Plus size={16} /> Nhập số dư đầu kỳ</button> : undefined}
      />
      {notice && <div className="alert alert-ok" style={{ marginBottom: 14 }}>{notice}</div>}
      <div className="card">
        <ErrorBox error={q.error ? errorText(q.error) : loadError} />
        {q.isLoading ? <Loading /> : rows.length === 0 ? <Empty text="Chưa nhập số dư đầu kỳ. Bấm “Nhập số dư đầu kỳ” để bắt đầu." /> : (
          <div className="table-wrap">
            <table className="grid">
              <thead><tr><th>Ngày chốt số dư</th><th>Số phiếu</th><th>Chi nhánh</th><th>Diễn giải</th><th className="num">Tổng số dư</th><th>Trạng thái</th><th /></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="clickable" onClick={() => void open(r)}>
                    <td>{date(r.docDate)}</td><td className="mono">{r.docNo}</td><td>{r.branchCode}</td><td>{r.description}</td>
                    <td className="num"><Money value={r.total} blankZero={false} /></td>
                    <td><StatusBadge status={r.status} /></td>
                    <td><button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setDetailId(r.id); }}>Bút toán</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {form && <OpeningForm existing={form.existing} onClose={() => setForm(null)} onSaved={(docNo) => { setForm(null); setNotice(`Đã ghi sổ số dư đầu kỳ ${docNo}.`); }} />}
      {detailId && <DocumentDetail id={detailId} onClose={() => setDetailId(null)} />}
    </>
  );
}

function OpeningForm({ existing, onClose, onSaved }: { existing?: Existing; onClose: () => void; onSaved: (docNo: string) => void }) {
  const qc = useQueryClient();
  const p = existing?.payload;
  const readOnly = existing?.status === 'cancelled';
  const { data: branches } = useBranches();
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts', 'posting'], queryFn: () => api.get<Account[]>('/api/v1/accounts', { postingOnly: true }), staleTime: 60_000 });
  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.code, a])), [accounts]);

  const [h, setH] = useState({
    branchCode: p?.branchCode ?? '',
    docDate: p?.docDate ?? '',
    description: p?.description ?? 'Số dư đầu kỳ',
    balancingAccount: p?.balancingAccount ?? '',
  });
  const [lines, setLines] = useState<LineDraft[]>(
    p?.lines.length ? p.lines.map((l) => ({ account: l.accountCode, partner: l.partnerCode ?? '', debit: l.debit ? money(l.debit) : '', credit: l.credit ? money(l.credit) : '' })) : [blank(), blank(), blank()],
  );
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const set = (patch: Partial<typeof h>) => setH((x) => ({ ...x, ...patch }));
  const setLine = (i: number, patch: Partial<LineDraft>) => setLines((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const branchCode = h.branchCode || branches?.find((b) => b.isActive)?.code || '';

  const filled = lines.filter((l) => l.account && (parseAmount(l.debit) || parseAmount(l.credit)));
  const totalDebit = filled.reduce((s, l) => s + parseAmount(l.debit), 0);
  const totalCredit = filled.reduce((s, l) => s + parseAmount(l.credit), 0);
  const diff = totalDebit - totalCredit;

  /** Đọc bảng dán từ Excel: mỗi dòng 4 cột cách nhau bằng tab (Tài khoản, Mã đối tượng, Dư Nợ, Dư Có). */
  const applyPaste = () => {
    const parsed = pasteText
      .split(/\r?\n/)
      .map((row) => row.split('\t').map((c) => c.trim()))
      .filter((c) => /^\d{3,}/.test(c[0] ?? ''))
      .map((c) => ({ account: c[0]!, partner: c[1] ?? '', debit: show(c[2] ?? ''), credit: show(c[3] ?? '') }));
    if (parsed.length) setLines(parsed);
    setPasting(false);
    setPasteText('');
  };

  const body = (): OpeningInput => ({
    branchCode,
    docDate: h.docDate,
    description: h.description,
    balancingAccount: h.balancingAccount.trim() || undefined,
    lines: filled.map((l) => ({ accountCode: l.account.trim(), partnerCode: l.partner.trim() || undefined, debit: parseAmount(l.debit), credit: parseAmount(l.credit) })),
  });
  const viewAgain = useViewAgain();
  const save = useMutation({
    mutationFn: () => (existing ? api.put<{ docNo: string }>(`/api/v1/opening-balances/${existing.id}`, body()) : api.post<{ docNo: string }>('/api/v1/opening-balances', body())),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['documents'] }); void qc.invalidateQueries({ queryKey: ['document'] }); if (existing) viewAgain[1](); else onSaved(r.docNo); },
  });
  const cancel = useMutation({
    mutationFn: (reason: string) => api.post('/api/v1/documents/cancel', { docKey: existing!.docKey, reason }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['documents'] }); onClose(); },
  });
  const canSave = !readOnly && branchCode && h.docDate && filled.length > 0 && (diff === 0 || h.balancingAccount.trim());

  return (
    <Modal viewAgain={viewAgain} viewFirst={Boolean(existing)}
      wide
      title={existing ? `Số dư đầu kỳ ${existing.docNo}${readOnly ? ' (đã huỷ)' : ''}` : 'Nhập số dư đầu kỳ'}
      onClose={onClose}
      footer={
        <>
          {existing && !readOnly && <button data-view-ok className="btn btn-danger" style={{ marginRight: 'auto' }} disabled={cancel.isPending} onClick={() => { const r = window.prompt('Lý do huỷ số dư đầu kỳ này:'); if (r) cancel.mutate(r); }}>Huỷ phiếu</button>}
          <button className="btn" onClick={onClose}>Đóng</button>
          {!readOnly && <button className="btn btn-primary" disabled={!canSave || save.isPending} onClick={() => save.mutate()}>{existing ? 'Ghi lại' : 'Ghi sổ'}</button>}
        </>
      }
    >
      <Field label="Chi nhánh">
        <BranchPicker activeOnly value={branchCode} disabled={readOnly} onChange={(c) => set({ branchCode: c })} />
      </Field>
      <Field label="Ngày chốt số dư" hint="Ngày cuối của kỳ trước kỳ bắt đầu dùng phần mềm"><input type="date" className="input" value={h.docDate} disabled={readOnly} onChange={(e) => set({ docDate: e.target.value })} /></Field>
      <Field label="Tài khoản cân đối" hint="Chỉ cần khi tổng Dư Nợ khác tổng Dư Có">
        <AccountPicker postingOnly value={h.balancingAccount} disabled={readOnly} onChange={(balancingAccount) => set({ balancingAccount })} placeholder="Ví dụ 999" />
      </Field>

      <div className="full">
        {!readOnly && (
          <div className="row" style={{ marginBottom: 8 }}>
            <button className="btn btn-sm" onClick={() => setPasting((x) => !x)}><ClipboardPaste size={14} /> Dán từ Excel</button>
            <span className="muted" style={{ fontSize: 12 }}>4 cột theo thứ tự: Tài khoản | Mã đối tượng | Dư Nợ | Dư Có</span>
          </div>
        )}
        {pasting && (
          <div style={{ marginBottom: 10 }}>
            <textarea className="input mono" style={{ width: '100%', height: 120 }} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Chép vùng dữ liệu trong Excel rồi dán vào đây (Ctrl+V)" autoFocus />
            <div className="row" style={{ marginTop: 6 }}><button className="btn btn-sm btn-primary" onClick={applyPaste}>Dùng dữ liệu này (thay các dòng đang nhập)</button><button className="btn btn-sm" onClick={() => setPasting(false)}>Thôi</button></div>
          </div>
        )}
        <div style={{ maxHeight: '42vh', overflow: 'auto' }}>
          <table className="voucher-lines">
            <thead><tr><th style={{ width: 170 }}>Tài khoản</th><th style={{ width: 200 }}>Mã đối tượng</th><th style={{ width: 170 }} className="num">Dư Nợ</th><th style={{ width: 170 }} className="num">Dư Có</th><th /><th style={{ width: 36 }} /></tr></thead>
            <tbody>
              {lines.map((l, i) => {
                const acc = accountMap.get(l.account);
                const needPartner = Boolean(acc && (acc.trackPartner || acc.isDebt || acc.normalSide === 'both'));
                return (
                  <tr key={i}>
                    <td><AccountPicker postingOnly hideName className="input mono" value={l.account} disabled={readOnly} onChange={(account) => setLine(i, { account })} placeholder="Bấm để chọn" /></td>
                    <td><PartnerPicker value={l.partner} disabled={readOnly} onChange={(partner) => setLine(i, { partner })} placeholder={needPartner ? 'Bắt buộc' : ''} /></td>
                    <td><input className="input num" inputMode="numeric" value={l.debit} disabled={readOnly} onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? '' : l.credit })} onBlur={() => setLine(i, { debit: show(l.debit) })} /></td>
                    <td><input className="input num" inputMode="numeric" value={l.credit} disabled={readOnly} onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? '' : l.debit })} onBlur={() => setLine(i, { credit: show(l.credit) })} /></td>
                    <td className="acc-name" style={{ paddingTop: 10 }}>{l.account ? acc?.name ?? 'Chưa có trong danh mục tài khoản chi tiết' : ''}</td>
                    <td>{!readOnly && lines.length > 1 && <button className="btn btn-sm btn-ghost" title="Xoá dòng" onClick={() => setLines((xs) => xs.filter((_, j) => j !== i))}><Trash2 size={15} /></button>}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>{!readOnly && <button className="btn btn-sm" onClick={() => setLines((xs) => [...xs, blank()])}><Plus size={14} /> Thêm dòng</button>}</td>
                <td className="num">{money(totalDebit, { blankZero: false })}</td>
                <td className="num">{money(totalCredit, { blankZero: false })}</td>
                <td colSpan={2} style={{ fontWeight: 400 }} className={diff === 0 ? 'muted' : 'neg'}>{diff === 0 ? 'Đã cân' : `Lệch ${money(Math.abs(diff))} (${diff > 0 ? 'Nợ lớn hơn' : 'Có lớn hơn'})`}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
      {cancel.error && <div className="alert alert-bad full">{errorText(cancel.error)}</div>}
    </Modal>
  );
}

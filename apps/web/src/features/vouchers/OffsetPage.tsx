/**
 * Cấn trừ công nợ (BT03): lập phiếu kế toán bù trừ công nợ.
 *  - Cùng một đối tượng: khách vừa mua vừa bán cho mình → Nợ phải trả (331…) / Có phải thu (131…).
 *  - Hai đối tượng: chuyển nợ / bù trừ giữa hai đối tượng → bên Nợ ghi cho đối tượng B, bên Có ghi cho đối tượng A.
 * Màn hiện số dư công nợ từng tài khoản của đối tượng tại ngày cấn trừ, gợi ý số tiền = phần nhỏ hơn của hai bên.
 * Chọn được từng hoá đơn / chứng từ còn nợ ở hai bên (ví dụ một phiếu bán với nhiều phiếu nhập): số tiền cấn trừ
 * gợi ý = phần nhỏ hơn của tổng hai bên; ghi xong các khoản được chọn được gạch nợ (settle trên phiếu), theo thứ tự chọn.
 * Không chọn hoá đơn nào thì phiếu chỉ cấn trừ số dư, gạch nợ sau ở màn Khoản công nợ.
 * Phiếu sinh ra là phiếu kế toán (purpose = offset), sửa / huỷ ở màn Phiếu kế toán.
 * In (OffsetPrint.tsx): biên bản cấn trừ công nợ, phiếu kế toán — bản nháp theo nội dung đang lập, hoặc phiếu vừa ghi sổ.
 */
import { workBranch } from '@/lib/workBranch';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { VoucherInput } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { date, money, today } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { Field } from '@/components/ui';
import { useBranches, BranchPicker } from '@/components/filters';
import { PartnerPicker } from '@/components/pickers';
import { PrintButton } from '@/components/print';
import { OFFSET_TEMPLATES, withParties, type OffsetItem, type OffsetSheet } from './OffsetPrint';

interface Balances { code: string; name: string; asOf: string; accounts: { accountCode: string; accountName: string; balance: number }[] }
const parseAmount = (s: string): number => Number(s.replace(/[.,\s]/g, '')) || 0;

function useBalances(code: string, asOf: string) {
  return useQuery({
    queryKey: ['partner-balances', code, asOf],
    queryFn: () => api.get<Balances>(`/api/v1/partners/${encodeURIComponent(code)}/balances`, { asOf }),
    enabled: Boolean(code),
  });
}

interface OpenItem { id: string; docNo: string; docDate: string; dueDate: string; description: string; remaining: number }
/** Khoản được chọn để gạch nợ, theo thứ tự chọn: [mã khoản, số tiền]. */
type Picks = [string, number][];

/** Cắt các khoản đã chọn cho vừa số tiền cấn trừ (khoản chọn trước được gạch trước). */
function fitPicks(picks: Picks, amount: number): { debtItemId: string; amount: number }[] {
  const out: { debtItemId: string; amount: number }[] = [];
  let left = amount;
  for (const [debtItemId, v] of picks) {
    if (left <= 0) break;
    const a = Math.min(v, left);
    out.push({ debtItemId, amount: a });
    left -= a;
  }
  return out;
}

/**
 * Danh sách khoản còn nợ của đối tượng trên tài khoản, phía bị cấn trừ: ghi Có TK phải thu thì gạch các khoản ghi Nợ
 * (hoá đơn bán), ghi Nợ TK phải trả thì gạch các khoản ghi Có (phiếu nhập).
 */
function OpenItems({ partner, account, side, title, picks, onChange }: { partner: string; account: string; side: 'debit' | 'credit'; title: string; picks: Picks; onChange: (p: Picks) => void }) {
  const q = useQuery({
    queryKey: ['debt-items', 'offset', partner, account, side],
    queryFn: () => api.get<OpenItem[]>('/api/v1/debt-items', { partnerCode: partner, account, side, status: 'open', pageSize: 200 }),
    enabled: Boolean(partner && account),
  });
  const rows = (q.data ?? []).filter((r) => r.remaining > 0);
  if (!partner || !account) return null;
  const picked = new Map(picks);
  const total = picks.reduce((s, [, v]) => s + v, 0);
  const toggle = (r: OpenItem, on: boolean) => onChange(on ? [...picks, [r.id, r.remaining]] : picks.filter(([id]) => id !== r.id));
  return (
    <div style={{ marginTop: 8 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <b>{title}</b>
        {picks.length > 0 && <span>Đã chọn {picks.length} khoản: <b>{money(total)}</b></span>}
      </div>
      {q.isLoading ? <div className="muted">Đang tải…</div> : !rows.length ? <div className="muted">Không còn khoản nào chưa thanh toán trên tài khoản {account}.</div> : (
        <div className="table-wrap" style={{ maxHeight: 220 }}>
          <table className="grid">
            <thead><tr><th style={{ width: 30 }} /><th>Số chứng từ</th><th>Ngày</th><th>Hạn</th><th>Diễn giải</th><th className="num">Còn nợ</th><th className="num">Cấn trừ</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const v = picked.get(r.id);
                return (
                  <tr key={r.id} style={v !== undefined ? { background: 'var(--brand-50)' } : undefined}>
                    <td><input type="checkbox" checked={v !== undefined} onChange={(e) => toggle(r, e.target.checked)} /></td>
                    <td className="mono">{r.docNo}</td><td>{date(r.docDate)}</td><td>{r.dueDate ? date(r.dueDate) : ''}</td><td>{r.description}</td>
                    <td className="num">{money(r.remaining)}</td>
                    <td className="num">
                      {v !== undefined && (
                        <input className="input num" style={{ width: 120 }} inputMode="numeric" value={money(v)}
                          onChange={(e) => { const n = Math.min(r.remaining, parseAmount(e.target.value)); onChange(picks.map(([id, x]) => [id, id === r.id ? n : x])); }} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Bảng số dư từng tài khoản của một đối tượng; bấm một dòng để chọn tài khoản. */
function BalanceTable({ data, picked, side, onPick }: { data?: Balances; picked: string; side: 'debit' | 'credit'; onPick: (code: string, balance: number) => void }) {
  if (!data) return null;
  if (!data.accounts.length) return <div className="muted" style={{ padding: '6px 0' }}>{data.name}: không còn số dư công nợ tại ngày này.</div>;
  return (
    <table className="grid" style={{ marginTop: 6 }}>
      <thead><tr><th>Tài khoản</th><th>Tên tài khoản</th><th className="num">Dư Nợ (phải thu)</th><th className="num">Dư Có (phải trả)</th><th /></tr></thead>
      <tbody>
        {data.accounts.map((a) => {
          const usable = side === 'debit' ? a.balance < 0 : a.balance > 0;
          return (
            <tr key={a.accountCode} style={picked === a.accountCode ? { background: 'var(--brand-50)' } : undefined}>
              <td className="mono">{a.accountCode}</td><td>{a.accountName}</td>
              <td className="num">{a.balance > 0 ? money(a.balance) : ''}</td><td className="num">{a.balance < 0 ? money(-a.balance) : ''}</td>
              <td>{usable && <button className="btn btn-sm" onClick={() => onPick(a.accountCode, Math.abs(a.balance))}>{picked === a.accountCode ? 'Đã chọn' : side === 'debit' ? 'Ghi Nợ TK này' : 'Ghi Có TK này'}</button>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function OffsetPage() {
  const qc = useQueryClient();
  const { data: branches } = useBranches();
  const [mode, setMode] = useState<'same' | 'two'>('same');
  const [f, setF] = useState({ docDate: today(), branchCode: workBranch.get(), partnerA: '', partnerB: '', debitAccount: '', creditAccount: '', amount: '', description: '' });
  const [avail, setAvail] = useState<{ debit: number; credit: number }>({ debit: 0, credit: 0 });
  const [done, setDone] = useState<string | null>(null);
  // Phiếu vừa ghi sổ (để in biên bản / phiếu kế toán sau khi form đã xoá trắng).
  const [saved, setSaved] = useState<OffsetSheet | null>(null);
  // Khoản được gạch: bên Có (khoản ghi Nợ của đối tượng A trên TK ghi Có), bên Nợ (khoản ghi Có trên TK ghi Nợ).
  const [creditPicks, setCreditPicks] = useState<Picks>([]);
  const [debitPicks, setDebitPicks] = useState<Picks>([]);
  const pickSum = (p: Picks) => p.reduce((s, [, v]) => s + v, 0);
  const onPicks = (side: 'credit' | 'debit', p: Picks) => {
    const c = side === 'credit' ? p : creditPicks;
    const d = side === 'debit' ? p : debitPicks;
    (side === 'credit' ? setCreditPicks : setDebitPicks)(p);
    const sc = pickSum(c);
    const sd = pickSum(d);
    if (sc && sd) set({ amount: money(Math.min(sc, sd)) });
    else if (sc) set({ amount: money(Math.min(sc, avail.debit || sc)) });
    else if (sd) set({ amount: money(Math.min(sd, avail.credit || sd)) });
  };
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const branchCode = f.branchCode || branches?.find((b) => b.isActive)?.code || '';
  // Bên Có: đối tượng A (giảm phải thu). Bên Nợ: cùng A, hoặc đối tượng B (giảm phải trả / nhận nợ).
  const debitPartner = mode === 'same' ? f.partnerA : f.partnerB;
  const a = useBalances(f.partnerA, f.docDate);
  const b = useBalances(mode === 'two' ? f.partnerB : '', f.docDate);
  const debitData = mode === 'same' ? a.data : b.data;
  useEffect(() => setCreditPicks([]), [f.partnerA, f.creditAccount]);
  useEffect(() => setDebitPicks([]), [debitPartner, f.debitAccount]);
  const amount = parseAmount(f.amount);
  const suggest = (next: { debit: number; credit: number }) => {
    setAvail(next);
    if (next.debit && next.credit) set({ amount: money(Math.min(next.debit, next.credit)) });
  };
  const description = f.description || (mode === 'same' ? `Cấn trừ công nợ ${a.data?.name ?? f.partnerA}` : `Bù trừ công nợ ${a.data?.name ?? f.partnerA} với ${b.data?.name ?? f.partnerB}`);
  const warn = useMemo(() => {
    const w: string[] = [];
    if (avail.credit && amount > avail.credit) w.push(`Số tiền lớn hơn số dư bên Có (${money(avail.credit)})`);
    if (avail.debit && amount > avail.debit) w.push(`Số tiền lớn hơn số dư bên Nợ (${money(avail.debit)})`);
    if (creditPicks.length && amount > pickSum(creditPicks)) w.push(`Số tiền lớn hơn tổng các khoản đã chọn bên Có (${money(pickSum(creditPicks))}): phần dư chưa gạch nợ`);
    if (debitPicks.length && amount > pickSum(debitPicks)) w.push(`Số tiền lớn hơn tổng các khoản đã chọn bên Nợ (${money(pickSum(debitPicks))}): phần dư chưa gạch nợ`);
    return w;
  }, [amount, avail, creditPicks, debitPicks]);

  const buildBody = (): VoucherInput => {
    const body: VoucherInput = {
      docType: 'manual', branchCode, docDate: f.docDate, description, counterparty: '', reference: 'Cấn trừ công nợ', purpose: 'offset',
      lines: [{ debitAccount: f.debitAccount, creditAccount: f.creditAccount, amount, description, partnerCode: debitPartner, creditPartnerCode: f.partnerA, taxAmount: 0 }],
    };
    const settle = [...fitPicks(creditPicks, amount), ...fitPicks(debitPicks, amount)];
    if (settle.length) body.settle = settle;
    return body;
  };
  /** Nội dung in theo form đang lập; chi tiết khoản được chọn lấy từ danh sách khoản còn nợ đã nạp. */
  const buildSheet = (docNo: string): OffsetSheet => {
    const itemsOf = (partner: string, account: string, side: 'debit' | 'credit', picks: Picks): OffsetItem[] => {
      const list = qc.getQueryData<OpenItem[]>(['debt-items', 'offset', partner, account, side]) ?? [];
      return fitPicks(picks, amount).map((p) => { const it = list.find((x) => x.id === p.debtItemId); return { docNo: it?.docNo ?? '', docDate: it?.docDate ?? '', description: it?.description ?? '', amount: p.amount }; });
    };
    return {
      docNo, mode, voucher: { ...buildBody(), docNo: docNo || undefined }, branchName: branches?.find((x) => x.code === branchCode)?.name ?? branchCode,
      credit: { code: f.partnerA, name: a.data?.name ?? f.partnerA }, debit: { code: debitPartner, name: debitData?.name ?? debitPartner },
      creditAccount: f.creditAccount, debitAccount: f.debitAccount, amount,
      creditItems: itemsOf(f.partnerA, f.creditAccount, 'debit', creditPicks), debitItems: itemsOf(debitPartner, f.debitAccount, 'credit', debitPicks),
    };
  };
  const save = useMutation({
    mutationFn: () => api.post<{ docNo: string }>('/api/v1/vouchers', buildBody()),
    onSuccess: (r) => {
      setSaved(buildSheet(r.docNo));
      setDone(`Đã ghi sổ phiếu kế toán ${r.docNo}. Sửa / huỷ phiếu ở màn Phiếu kế toán.`);
      set({ amount: '', debitAccount: '', creditAccount: '', description: '' });
      setAvail({ debit: 0, credit: 0 });
      setCreditPicks([]);
      setDebitPicks([]);
      void qc.invalidateQueries({ queryKey: ['partner-balances'] });
      void qc.invalidateQueries({ queryKey: ['debt-items'] });
      void qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });
  const canSave = branchCode && f.partnerA && debitPartner && f.debitAccount && f.creditAccount && f.debitAccount !== f.creditAccount && amount > 0;

  return (
    <>
      <PageHeader title="Cấn trừ công nợ" code="BT03" subtitle="Bù trừ phải thu – phải trả của cùng một đối tượng, hoặc chuyển nợ giữa hai đối tượng" helpKey="can-tru-cong-no" />
      {done && (
        <div className="alert alert-ok row" style={{ marginBottom: 14, justifyContent: 'space-between' }}>
          <span>{done}</span>
          {saved && <PrintButton screen="BT03" templates={OFFSET_TEMPLATES} label={`In phiếu ${saved.docNo}`} getDocs={async () => [await withParties(saved)]} />}
        </div>
      )}
      <div className="card">
        <div className="filters">
          <div className="field">
            <label>Kiểu cấn trừ</label>
            <select className="select input" value={mode} onChange={(e) => { setMode(e.target.value as 'same' | 'two'); set({ debitAccount: '', creditAccount: '', amount: '' }); setAvail({ debit: 0, credit: 0 }); }}>
              <option value="same">Cùng một đối tượng (vừa phải thu vừa phải trả)</option>
              <option value="two">Giữa hai đối tượng</option>
            </select>
          </div>
          <div className="field"><label>Ngày cấn trừ</label><input type="date" className="input" value={f.docDate} onChange={(e) => set({ docDate: e.target.value })} /></div>
          <div className="field">
            <label>Chi nhánh</label>
            <BranchPicker activeOnly value={branchCode} onChange={(c) => set({ branchCode: c })} />
          </div>
        </div>

        <div style={{ padding: '4px 16px 16px' }}>
        <div className="form-grid">
          <Field label={mode === 'same' ? 'Đối tượng' : 'Đối tượng A (ghi Có — giảm nợ phải thu / tăng phải trả)'} full>
            <PartnerPicker activeOnly value={f.partnerA} onChange={(partnerA) => { set({ partnerA, debitAccount: mode === 'same' ? '' : f.debitAccount, creditAccount: '' }); setAvail({ debit: mode === 'same' ? 0 : avail.debit, credit: 0 }); }} placeholder="Gõ mã, tên hoặc mã số thuế" />
          </Field>
        </div>
        {mode === 'same' ? (
          <>
            <BalanceTable data={a.data} picked={f.creditAccount} side="credit" onPick={(creditAccount, v) => { set({ creditAccount }); suggest({ ...avail, credit: v }); }} />
            <BalanceTable data={a.data} picked={f.debitAccount} side="debit" onPick={(debitAccount, v) => { set({ debitAccount }); suggest({ ...avail, debit: v }); }} />
          </>
        ) : (
          <>
            <BalanceTable data={a.data} picked={f.creditAccount} side="credit" onPick={(creditAccount, v) => { set({ creditAccount }); suggest({ ...avail, credit: v }); }} />
            <div className="form-grid" style={{ marginTop: 10 }}>
              <Field label="Đối tượng B (ghi Nợ — giảm nợ phải trả / nhận nợ phải thu)" full>
                <PartnerPicker activeOnly value={f.partnerB} onChange={(partnerB) => { set({ partnerB, debitAccount: '' }); setAvail({ ...avail, debit: 0 }); }} placeholder="Gõ mã, tên hoặc mã số thuế" />
              </Field>
            </div>
            <BalanceTable data={b.data} picked={f.debitAccount} side="debit" onPick={(debitAccount, v) => { set({ debitAccount }); suggest({ ...avail, debit: v }); }} />
          </>
        )}
        <OpenItems partner={f.partnerA} account={f.creditAccount} side="debit" title={`Khoản phải thu được cấn trừ (TK ${f.creditAccount}, ${a.data?.name ?? f.partnerA})`} picks={creditPicks} onChange={(p) => onPicks('credit', p)} />
        <OpenItems partner={debitPartner} account={f.debitAccount} side="credit" title={`Khoản phải trả được cấn trừ (TK ${f.debitAccount}, ${debitData?.name ?? debitPartner})`} picks={debitPicks} onChange={(p) => onPicks('debit', p)} />
        {(a.error || b.error) && <div className="alert alert-bad">{errorText(a.error ?? b.error)}</div>}

        <div className="form-grid" style={{ marginTop: 12 }}>
          <Field label="TK ghi Nợ"><input className="input mono" value={f.debitAccount} onChange={(e) => set({ debitAccount: e.target.value.trim() })} placeholder="Chọn ở bảng số dư hoặc gõ" /></Field>
          <Field label="TK ghi Có"><input className="input mono" value={f.creditAccount} onChange={(e) => set({ creditAccount: e.target.value.trim() })} placeholder="Chọn ở bảng số dư hoặc gõ" /></Field>
          <Field label="Số tiền cấn trừ"><input className="input num" inputMode="numeric" value={f.amount} onChange={(e) => set({ amount: e.target.value })} onBlur={() => set({ amount: amount ? money(amount) : '' })} /></Field>
          <Field label="Diễn giải" full><input className="input" value={f.description} onChange={(e) => set({ description: e.target.value })} placeholder={description} /></Field>
        </div>
        {warn.map((w) => <div key={w} className="alert alert-warn" style={{ marginTop: 8 }}>{w}</div>)}
        {save.error && <div className="alert alert-bad" style={{ marginTop: 8 }}>{errorText(save.error)}</div>}
        <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
          <PrintButton screen="BT03" templates={OFFSET_TEMPLATES} label="In bản nháp" disabled={!canSave} title="In biên bản theo nội dung đang lập (chưa ghi sổ, chưa có số phiếu) để các bên ký" getDocs={async () => [await withParties(buildSheet(''))]} />
          <button className="btn btn-primary" disabled={!canSave || save.isPending} onClick={() => save.mutate()}>Ghi sổ phiếu cấn trừ</button>
        </div>
        </div>
      </div>
    </>
  );
}

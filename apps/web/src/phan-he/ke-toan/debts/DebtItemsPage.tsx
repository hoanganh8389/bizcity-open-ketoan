/**
 * Khoản công nợ theo chứng từ và đối trừ (CN01).
 *  - Danh sách khoản: mỗi chứng từ ghi nợ / ghi có trên tài khoản công nợ của một đối tượng là một khoản, có hạn
 *    thanh toán, đã đối trừ, còn lại, số ngày quá hạn.
 *  - Bấm một khoản còn mở để đối trừ: chọn các khoản bên đối ứng (cùng đối tượng, cùng tài khoản) và số tiền;
 *    phần mềm gợi ý sẵn theo hạn cũ trước. Trong hộp này cũng gỡ được các đối trừ đã ghi.
 *  - "Tự đối trừ" ghép hàng loạt theo hạn cũ trước cho đối tượng / tài khoản đang lọc.
 */
import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DOC_TYPE_LABELS, VOUCHER_PURPOSES, type DocType, type VoucherPurpose } from '@ketoan/contracts';
import { api, errorText, ALL_ROWS } from '@/lib/api';
import { date, money, today } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { Empty, ErrorBox, Loading, Modal } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { AccountPicker, PartnerPicker } from '@/components/pickers';
import { DocumentDetail } from '../../../features/documents/DocumentDetail';
import type { DebtItem } from '@/lib/debts';

export type { DebtItem } from '@/lib/debts';
interface Meta { total: number; debitRemaining: number; creditRemaining: number; overdue: number }
interface Allocation { id: string; amount: number; date: string; isAuto: boolean; note: string; createdBy: string; docNo: string; docDate: string; documentId: string }
const SIDE: Record<string, string> = { debit: 'Ghi Nợ', credit: 'Ghi Có' };
export const docKindLabel = (i: { docType: string; purpose: string | null }) => (i.purpose ? VOUCHER_PURPOSES[i.purpose as VoucherPurpose] : undefined) ?? DOC_TYPE_LABELS[i.docType as DocType] ?? i.docType;
const parseAmount = (s: string): number => Number(s.replace(/[.,\s]/g, '')) || 0;

export function DebtItemsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [f, setF] = useState({ partnerCode: '', account: '', side: '', status: 'open', dueTo: '', search: '', page: 1 });
  const [matching, setMatching] = useState<DebtItem | null>(null);
  const [docId, setDocId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch, page: patch.page ?? 1 }));
  const params = { ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== '')), pageSize: ALL_ROWS };
  const q = useQuery({ queryKey: ['debt-items', params], queryFn: () => api.getPage<DebtItem[]>('/api/v1/debt-items', params), placeholderData: keepPreviousData });
  const meta = q.data?.meta as unknown as Meta | undefined;
  const auto = useMutation({
    mutationFn: () => api.post<{ count: number }>('/api/v1/debt-allocations/auto', { partnerCode: f.partnerCode || undefined, account: f.account || undefined }),
    onSuccess: (r) => { setNotice(r.count ? `Đã tự đối trừ ${r.count} cặp theo hạn cũ trước.` : 'Không có cặp nào để đối trừ: mỗi đối tượng chỉ còn khoản một bên.'); void qc.invalidateQueries({ queryKey: ['debt-items'] }); },
  });
  return (
    <>
      <PageHeader title="Khoản công nợ và đối trừ" code="CN01" subtitle="Công nợ theo từng chứng từ: hạn thanh toán, đã đối trừ, còn lại; thu / chi tiền trừ vào khoản nào" helpKey="khoan-cong-no"
        actions={can('documents:write') && (
          <button className="btn" disabled={auto.isPending} title="Trong từng đối tượng và tài khoản: khoản ghi Nợ cũ nhất ghép với khoản ghi Có cũ nhất"
            onClick={() => window.confirm(f.partnerCode ? `Tự đối trừ theo hạn cũ trước cho đối tượng ${f.partnerCode}?` : 'Chưa chọn đối tượng: tự đối trừ cho MỌI đối tượng theo hạn cũ trước?') && auto.mutate()}>Tự đối trừ (cũ trước)</button>
        )} />
      {notice && <div className="alert alert-ok" style={{ marginBottom: 14 }}>{notice}</div>}
      <div className="card">
        <div className="filters">
          <div className="field"><label>Đối tượng</label><PartnerPicker value={f.partnerCode} onChange={(partnerCode) => set({ partnerCode })} placeholder="Tất cả" /></div>
          <div className="field"><label>Tài khoản</label><AccountPicker className="input w-md" value={f.account} onChange={(account) => set({ account })} placeholder="131, 331…" /></div>
          <div className="field">
            <label>Bên</label>
            <select className="select input" value={f.side} onChange={(e) => set({ side: e.target.value })}><option value="">Cả hai</option><option value="debit">Ghi Nợ</option><option value="credit">Ghi Có</option></select>
          </div>
          <div className="field">
            <label>Trạng thái</label>
            <select className="select input" value={f.status} onChange={(e) => set({ status: e.target.value })}><option value="open">Còn mở</option><option value="settled">Đã đối trừ hết</option><option value="all">Tất cả</option></select>
          </div>
          <div className="field"><label>Hạn thanh toán đến</label><input type="date" className="input" value={f.dueTo} onChange={(e) => set({ dueTo: e.target.value })} /></div>
          <div className="field"><label>Số chứng từ</label><input className="input w-md" value={f.search} onChange={(e) => set({ search: e.target.value })} /></div>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : auto.error ? errorText(auto.error) : null} />
        {meta && (
          <div className="row" style={{ padding: '0 16px 10px', gap: 24 }}>
            <span>Còn lại bên Nợ: <b>{money(meta.debitRemaining, { blankZero: false })}</b></span>
            <span>Còn lại bên Có: <b>{money(meta.creditRemaining, { blankZero: false })}</b></span>
            <span className={meta.overdue ? 'text-bad' : 'muted'}>Trong đó quá hạn: <b>{money(meta.overdue, { blankZero: false })}</b></span>
          </div>
        )}
        {q.isLoading ? <Loading /> : !q.data?.data.length ? <Empty text="Không có khoản công nợ nào khớp điều kiện lọc" /> : (
          <DataGrid storageKey="cn01" rows={q.data.data} rowKey={(r) => r.id} footerLabel={false} 
            onRowClick={(r) => setMatching(r)}
            columns={[
              { key: 'dueDate', header: 'Hạn TT', type: 'date' },
              { key: 'docDate', header: 'Ngày CT', type: 'date' },
              { key: 'docNo', header: 'Số chứng từ', type: 'code' },
              { key: 'kind', header: 'Loại', value: (r) => docKindLabel(r) },
              { key: 'partnerCode', header: 'Mã đối tượng', type: 'code' },
              { key: 'partnerName', header: 'Tên đối tượng' },
              { key: 'accountCode', header: 'TK', type: 'code' },
              { key: 'side', header: 'Bên', value: (r) => SIDE[r.side] },
              { key: 'amount', header: 'Số tiền', type: 'money', sum: true },
              { key: 'settled', header: 'Đã đối trừ', type: 'money', sum: true },
              { key: 'remaining', header: 'Còn lại', type: 'money', sum: true },
              { key: 'overdueDays', header: 'Quá hạn (ngày)', type: 'number', render: (r) => (r.overdueDays ? <span className="text-bad">{r.overdueDays}</span> : '') },
              { key: 'branchCode', header: 'Chi nhánh', type: 'code', hidden: true },
              { key: 'description', header: 'Diễn giải', hidden: true },
              { key: 'action', header: '', noFilter: true, noSort: true, render: (r) => <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setDocId(r.documentId); }}>Chứng từ</button> },
            ] satisfies Column<DebtItem>[]} />
        )}
      </div>
      {matching && <MatchDialog item={matching} canWrite={can('documents:write')} onClose={() => { setMatching(null); void qc.invalidateQueries({ queryKey: ['debt-items'] }); }} />}
      {docId && <DocumentDetail id={docId} onClose={() => setDocId(null)} />}
    </>
  );
}

/** Đối trừ một khoản với các khoản bên đối ứng cùng đối tượng, cùng tài khoản. */
function MatchDialog({ item, canWrite, onClose }: { item: DebtItem; canWrite: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const other = item.side === 'debit' ? 'credit' : 'debit';
  const cur = useQuery({ queryKey: ['debt-item', item.id], queryFn: () => api.get<DebtItem[]>('/api/v1/debt-items', { partnerCode: item.partnerCode, account: item.accountCode, status: 'all', search: item.docNo, pageSize: ALL_ROWS }).then((rows) => rows.find((r) => r.id === item.id) ?? item) });
  const me = cur.data ?? item;
  const open = useQuery({ queryKey: ['debt-items', 'match', item.id], queryFn: () => api.get<DebtItem[]>('/api/v1/debt-items', { partnerCode: item.partnerCode, account: item.accountCode, side: other, status: 'open', pageSize: 500 }) });
  const used = useQuery({ queryKey: ['debt-allocations', item.id], queryFn: () => api.get<Allocation[]>(`/api/v1/debt-items/${item.id}/allocations`) });
  const candidates = (open.data ?? []).filter((r) => r.accountCode === item.accountCode);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['debt-item', item.id] }); void qc.invalidateQueries({ queryKey: ['debt-items', 'match', item.id] }); void qc.invalidateQueries({ queryKey: ['debt-allocations', item.id] }); };
  /** Gợi ý theo hạn cũ trước cho tới khi hết phần còn lại của khoản đang xem. */
  const suggest = () => {
    let left = Math.round(me.remaining * 100);
    const next: Record<string, string> = {};
    for (const c of candidates) {
      if (left <= 0) break;
      const take = Math.min(left, Math.round(c.remaining * 100));
      next[c.id] = money(take / 100);
      left -= take;
    }
    setAmounts(next);
  };
  useEffect(() => { setAmounts({}); }, [me.remaining, open.dataUpdatedAt]);
  const picked = candidates.map((c) => ({ c, amount: parseAmount(amounts[c.id] ?? '') })).filter((x) => x.amount > 0);
  const total = picked.reduce((s, x) => s + x.amount, 0);
  const save = useMutation({
    mutationFn: () => api.post('/api/v1/debt-allocations', { date: today(), pairs: picked.map((x) => (item.side === 'debit' ? { debitItemId: item.id, creditItemId: x.c.id, amount: x.amount } : { debitItemId: x.c.id, creditItemId: item.id, amount: x.amount })) }),
    onSuccess: refresh,
  });
  const undo = useMutation({ mutationFn: (id: string) => api.delete(`/api/v1/debt-allocations/${id}`), onSuccess: refresh });
  const over = total > me.remaining + 0.001;
  return (
    <Modal wide title={`Đối trừ ${item.docNo} — ${item.partnerCode} ${item.partnerName}`} onClose={onClose}
      footer={<>
        {canWrite && <button className="btn" style={{ marginRight: 'auto' }} disabled={!candidates.length || me.remaining <= 0} onClick={suggest}>Gợi ý theo hạn cũ trước</button>}
        <button className="btn" onClick={onClose}>Đóng</button>
        {canWrite && <button className="btn btn-primary" disabled={!picked.length || over || save.isPending} onClick={() => save.mutate()}>Ghi đối trừ {total ? money(total) : ''}</button>}
      </>}>
      <div className="full row" style={{ gap: 24, flexWrap: 'wrap' }}>
        <span>{docKindLabel(item)} ngày {date(item.docDate)}, hạn {date(item.dueDate)}</span>
        <span>TK <b className="mono">{item.accountCode}</b> · {SIDE[item.side]}</span>
        <span>Số tiền <b>{money(me.amount)}</b> · Đã đối trừ <b>{money(me.settled, { blankZero: false })}</b> · Còn lại <b>{money(me.remaining, { blankZero: false })}</b></span>
      </div>
      <div className="full">
        <h3 style={{ fontSize: 14, margin: '6px 0' }}>Khoản {SIDE[other]!.toLowerCase()} còn mở của cùng đối tượng, cùng tài khoản</h3>
        {open.isLoading ? <Loading /> : !candidates.length ? <div className="muted">Không còn khoản bên đối ứng nào để đối trừ. Bù trừ khác tài khoản (131 với 331) dùng màn Cấn trừ công nợ.</div> : (
          <div style={{ maxHeight: '34vh', overflow: 'auto' }}>
            <table className="grid">
              <thead><tr><th>Hạn TT</th><th>Ngày CT</th><th>Số chứng từ</th><th>Loại</th><th className="num">Còn lại</th><th className="num" style={{ width: 170 }}>Đối trừ lần này</th></tr></thead>
              <tbody>
                {candidates.map((c) => (
                  <tr key={c.id}>
                    <td>{date(c.dueDate)}</td><td>{date(c.docDate)}</td><td className="mono">{c.docNo}</td><td>{docKindLabel(c)}</td><td className="num">{money(c.remaining)}</td>
                    <td><input className="input num" inputMode="numeric" disabled={!canWrite} value={amounts[c.id] ?? ''} placeholder="0"
                      onChange={(e) => setAmounts((a) => ({ ...a, [c.id]: e.target.value }))}
                      onBlur={() => setAmounts((a) => ({ ...a, [c.id]: parseAmount(a[c.id] ?? '') ? money(Math.min(parseAmount(a[c.id] ?? ''), c.remaining)) : '' }))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {over && <div className="alert alert-warn" style={{ marginTop: 8 }}>Tổng đối trừ {money(total)} lớn hơn phần còn lại {money(me.remaining)} của chứng từ {item.docNo}.</div>}
      </div>
      {Boolean(used.data?.length) && (
        <div className="full">
          <h3 style={{ fontSize: 14, margin: '6px 0' }}>Đã đối trừ</h3>
          <table className="grid">
            <thead><tr><th>Ngày đối trừ</th><th>Với chứng từ</th><th>Ngày CT</th><th className="num">Số tiền</th><th>Cách ghép</th><th>Người ghép</th><th /></tr></thead>
            <tbody>
              {used.data!.map((a) => (
                <tr key={a.id}>
                  <td>{date(a.date)}</td><td className="mono">{a.docNo}</td><td>{date(a.docDate)}</td><td className="num">{money(a.amount)}</td><td>{a.isAuto ? 'Tự động' : 'Chọn tay'}</td><td>{a.createdBy}</td>
                  <td>{canWrite && <button className="btn btn-sm" disabled={undo.isPending} onClick={() => undo.mutate(a.id)}>Gỡ</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(save.error || undo.error) && <div className="alert alert-bad full">{errorText(save.error ?? undo.error)}</div>}
    </Modal>
  );
}

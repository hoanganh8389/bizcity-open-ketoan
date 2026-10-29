/**
 * Lịch thanh toán hợp đồng (HD01): các kỳ đến hạn của mọi hợp đồng (thuê nhà, tín dụng, mua tài sản…), nhắc hạn,
 * đánh dấu đã trả. Lịch khai ở danh mục hợp đồng (ACC25).
 */
import { workBranch } from '@/lib/workBranch';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CONTRACT_TYPES } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { date, money, today } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { Empty, ErrorBox, Field, Loading, Modal, Money } from '@/components/ui';
import { useBranches, BranchPicker } from '@/components/filters';
import { AccountPicker } from '@/components/pickers';
import { DataGrid, type Column } from '@/components/DataGrid';

interface Row {
  id: string; contractCode: string; contractName: string; contractType: string; partnerCode: string; partnerName: string;
  seq: number; dueDate: string; amount: number; taxAmount: number; description: string; status: 'pending' | 'paid' | 'cancelled'; paidDate: string | null; paidRef: string; overdue: boolean;
  paymentRequestNo: string; paymentRequestStatus: string;
}
const TYPE_NAME = Object.fromEntries(CONTRACT_TYPES) as Record<string, string>;
const STATUS: Record<string, string> = { pending: 'Chưa trả', paid: 'Đã trả', cancelled: 'Huỷ' };
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

export function ContractSchedulesPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [f, setF] = useState({ to: plusDays(60), status: 'pending', type: '' });
  const [reqFor, setReqFor] = useState<Row | null>(null);
  const params = { to: f.to, status: f.status, type: f.type || undefined };
  const q = useQuery({ queryKey: ['contract-schedules', 'due', params], queryFn: () => api.get<Row[]>('/api/v1/contract-schedules', params) });
  const mark = useMutation({
    mutationFn: (a: { id: string; status: string; paidRef?: string }) => api.patch(`/api/v1/contract-schedules/${a.id}`, { status: a.status, paidRef: a.paidRef ?? '' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['contract-schedules'] }),
  });
  const rows = q.data ?? [];
  const overdue = rows.filter((r) => r.overdue);
  const pay = (r: Row) => {
    const ref = window.prompt(`Đánh dấu đã trả kỳ ${r.seq} hợp đồng ${r.contractCode} (${money(r.amount + r.taxAmount)}).\nSố phiếu chi / uỷ nhiệm chi (có thể để trống):`, '');
    if (ref !== null) mark.mutate({ id: r.id, status: 'paid', paidRef: ref.trim() });
  };
  return (
    <>
      <PageHeader title="Lịch thanh toán hợp đồng" code="HD01" subtitle="Các kỳ thanh toán sắp đến hạn và quá hạn của hợp đồng thuê nhà, tín dụng, mua tài sản, nhà cung cấp" helpKey="hop-dong" />
      <div className="kpis">
        <div className="card kpi"><div className="label">Số kỳ trong danh sách</div><div className="value">{rows.length.toLocaleString('vi-VN')}</div></div>
        <div className="card kpi"><div className="label">Tổng phải trả (gồm thuế nộp thay)</div><div className="value"><Money value={rows.filter((r) => r.status === 'pending').reduce((t, r) => t + r.amount + r.taxAmount, 0)} blankZero={false} /></div></div>
        <div className="card kpi"><div className="label">Quá hạn chưa trả</div><div className={`value ${overdue.length ? 'text-bad' : ''}`}>{overdue.length.toLocaleString('vi-VN')}</div></div>
      </div>
      <div className="card">
        <div className="filters">
          <div className="field"><label>Đến hạn tới ngày</label><input type="date" className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value || plusDays(60) })} /></div>
          <div className="field">
            <label>Trạng thái</label>
            <select className="select input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
              <option value="pending">Chưa trả</option><option value="paid">Đã trả</option><option value="cancelled">Huỷ</option><option value="all">Tất cả</option>
            </select>
          </div>
          <div className="field">
            <label>Loại hợp đồng</label>
            <select className="select input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="">Tất cả</option>{CONTRACT_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : mark.error ? errorText(mark.error) : null} />
        {q.isLoading ? <Loading /> : !rows.length ? <Empty text="Không có kỳ thanh toán nào trong khoảng này. Lịch khai ở Danh mục hợp đồng (ACC25)." /> : (
          <DataGrid
            storageKey="hd01"
            rows={rows}
            rowKey={(r) => r.id}
            onRowClick={(r) => can('catalog:write') && r.status === 'pending' && pay(r)}
            columns={[
              { key: 'dueDate', header: 'Đến hạn', type: 'date', render: (r) => <span className={r.overdue ? 'text-bad' : ''}>{date(r.dueDate)}{r.overdue ? ' — quá hạn' : ''}</span> },
              { key: 'contractCode', header: 'Hợp đồng', type: 'code' },
              { key: 'contractName', header: 'Tên hợp đồng' },
              { key: 'contractType', header: 'Loại', value: (r) => TYPE_NAME[r.contractType] ?? '' },
              { key: 'partnerName', header: 'Đối tượng', value: (r) => (r.partnerCode ? `${r.partnerCode} — ${r.partnerName}` : '') },
              { key: 'seq', header: 'Kỳ', type: 'number' },
              { key: 'description', header: 'Diễn giải' },
              { key: 'amount', header: 'Số tiền', type: 'money', sum: true },
              { key: 'taxAmount', header: 'Thuế nộp thay', type: 'money', sum: true },
              { key: 'total', header: 'Tổng', type: 'money', sum: true, bold: true, value: (r) => r.amount + r.taxAmount },
              { key: 'status', header: 'Trạng thái', value: (r) => STATUS[r.status] ?? r.status },
              { key: 'paidRef', header: 'Số phiếu đã trả', type: 'code', hidden: f.status === 'pending' },
              {
                key: 'paymentRequestNo', header: 'Yêu cầu thanh toán', type: 'code',
                render: (r) => r.paymentRequestNo
                  ? <span className="mono">{r.paymentRequestNo}</span>
                  : r.status === 'pending' && r.partnerCode && can('documents:write')
                    ? <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); setReqFor(r); }}>Lập yêu cầu TT</button>
                    : null,
              },
            ] satisfies Column<Row>[]}
          />
        )}
        <p className="muted" style={{ margin: 12 }}>
          Bấm một kỳ chưa trả để đánh dấu đã trả (ghi số phiếu chi). Nút <b>Lập yêu cầu TT</b> tạo yêu cầu thanh toán (CN05) cho kỳ đó;
          khi yêu cầu được duyệt và lập phiếu chi, kỳ tự chuyển sang đã trả.
        </p>
      </div>
      {reqFor && <RequestDialog row={reqFor} onClose={() => setReqFor(null)} />}
    </>
  );
}

/** Lập yêu cầu thanh toán từ một kỳ hợp đồng (DM-012): điền sẵn đối tượng, số tiền, nội dung; khoản chi chưa ghi công nợ ghi Nợ TK chọn. */
function RequestDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: branches } = useBranches();
  const [v, setV] = useState({
    requestDate: today(), branchCode: workBranch.get(), method: 'bank' as 'cash' | 'bank', debitAccount: '',
    description: `Thanh toán hợp đồng ${row.contractCode} kỳ ${row.seq}${row.description ? ` — ${row.description}` : ''}`,
  });
  const branchCode = v.branchCode || branches?.find((b) => b.isActive)?.code || '';
  const amount = row.amount + row.taxAmount;
  const save = useMutation({
    mutationFn: (submit: boolean) => api.post('/api/v1/payment-requests', {
      requestDate: v.requestDate, branchCode, partnerCode: row.partnerCode, dueDate: row.dueDate, method: v.method, description: v.description,
      sourceRef: row.contractCode, items: [], amount, debitAccount: v.debitAccount, contractScheduleId: row.id, submit,
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['contract-schedules'] }); void qc.invalidateQueries({ queryKey: ['payment-requests'] }); onClose(); },
  });
  const ready = Boolean(branchCode && v.debitAccount && v.description.trim()) && !save.isPending;
  return (
    <Modal title={`Lập yêu cầu thanh toán — ${row.contractCode} kỳ ${row.seq}`} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>Đóng</button>
        <button className="btn" disabled={!ready} onClick={() => save.mutate(false)}>Lưu nháp</button>
        <button className="btn btn-primary" disabled={!ready} onClick={() => save.mutate(true)}>Gửi duyệt</button>
      </>}>
      <Field label="Đối tượng nhận tiền"><input className="input" disabled value={`${row.partnerCode} — ${row.partnerName}`} /></Field>
      <Field label="Số tiền" hint={row.taxAmount ? `Gồm thuế nộp thay ${money(row.taxAmount)}` : undefined}><input className="input num" disabled value={money(amount)} /></Field>
      <Field label="Ngày yêu cầu"><input type="date" className="input" value={v.requestDate} onChange={(e) => setV({ ...v, requestDate: e.target.value })} /></Field>
      <Field label="Hạn chi"><input className="input" disabled value={date(row.dueDate)} /></Field>
      <Field label="Chi nhánh">
        <BranchPicker activeOnly value={branchCode} onChange={(c) => setV({ ...v, branchCode: c })} />
      </Field>
      <Field label="Hình thức">
        <select className="select input" value={v.method} onChange={(e) => setV({ ...v, method: e.target.value as 'cash' | 'bank' })}><option value="bank">Chuyển khoản</option><option value="cash">Tiền mặt</option></select>
      </Field>
      <Field label="TK ghi Nợ khi chi" hint="Chi phí thuê, trả trước, phải trả, nợ vay…"><AccountPicker postingOnly className="input mono" value={v.debitAccount} onChange={(debitAccount) => setV({ ...v, debitAccount })} /></Field>
      <Field label="Nội dung" full><input className="input" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} /></Field>
      <ErrorBox error={save.error ? errorText(save.error) : null} />
    </Modal>
  );
}

/**
 * Phiếu chuyển tiền (Q2, phân hệ Quỹ) — như màn Q2 "Phiếu chuyển tiền" / frmApproveChuyenTienShowroom của HTsoft.
 * Phiếu lập ở hệ thống bán hàng (POS), tới đây ở trạng thái "đã chuyển": nơi chuyển đã ghi Nợ 11319 / Có tiền.
 * Nhân viên cửa hàng KHÔNG xác nhận: kế toán đối chiếu quỹ / sao kê nơi nhận rồi tích chọn, bấm "Xác nhận đã nhận tiền"
 * → ghi bút toán nơi nhận (Nợ tiền nơi nhận / Có 11319). Xác nhận nhầm thì mở phiếu, bấm "Bỏ xác nhận".
 *   thẻ Chờ xác nhận : chưa xác nhận, hoặc xác nhận cũ hết hiệu lực (phiếu đổi số tiền / nơi nhận / ngân hàng nhận);
 *   thẻ Đã xác nhận : kế toán đã xác nhận (hoặc nguồn đã báo nhận);
 *   thẻ Tất cả.
 * Tổng tiền thẻ Chờ xác nhận = tiền đang trên đường (số dư 11319) của các phiếu trong kỳ.
 * In: tích các phiếu (thẻ nào cũng được), bấm In — phiếu chuyển tiền A5, uỷ nhiệm chi (CashTransferPrint.tsx).
 */
import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCheck } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTime, defaultFrom, defaultTo } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { FormTabs } from '@/components/FormBlocks';
import { Empty, ErrorBox, Loading, StatusBadge } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { DocumentDetail } from './DocumentDetail';
import { PrintButton } from '@/components/print';
import { useBankAccounts } from '../catalog/BankAccountsPage';
import { CASH_TRANSFER_TEMPLATES, type CashTransferSheet } from './CashTransferPrint';

type Receipt = 'waiting' | 'confirmed' | 'invalid' | 'source';
interface Row {
  id: string; docKey: string; docNo: string; docDate: string; status: string; version: number; postedVersion: number | null; errorMessage: string | null;
  fromBranchCode: string; fromBranchName: string; toBranchCode: string; toBranchName: string;
  fromBankCode: string; toBankCode: string; fromMethodCode: string; toMethodCode: string;
  reasonCode: string; toReasonCode: string; description: string; total: number;
  receipt: Receipt; confirmedBy: string | null; confirmedAt: string | null; confirmNote: string | null;
}
type Tab = 'waiting' | 'confirmed' | 'all';

const RECEIPT_TEXT: Record<Receipt, string> = {
  waiting: 'Chờ kế toán xác nhận',
  invalid: 'Cần xác nhận lại (phiếu đã đổi)',
  confirmed: 'Kế toán đã xác nhận',
  source: 'Nguồn đã báo nhận',
};

export function CashTransfersPage() {
  const { can } = useAuth();
  const canWrite = can('documents:write');
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('waiting');
  const [f, setF] = useState({ from: defaultFrom(), to: defaultTo(), branchCodes: '' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const set = (patch: Partial<typeof f>) => { setF((x) => ({ ...x, ...patch })); setSelected(new Set()); };

  const q = useQuery({
    queryKey: ['cash-transfers', f, tab],
    queryFn: () => api.get<Row[]>('/api/v1/documents/cash-transfers', { ...f, receipt: tab }),
    placeholderData: keepPreviousData,
  });
  const rows = q.data ?? [];
  const picked = rows.filter((r) => selected.has(r.id) && (r.receipt === 'waiting' || r.receipt === 'invalid'));
  const toPrint = rows.filter((r) => selected.has(r.id));
  const banks = useBankAccounts().data ?? [];
  const sheetOf = (r: Row): CashTransferSheet => ({
    ...r, fromBank: r.fromBankCode ? banks.find((b) => b.code === r.fromBankCode) : undefined, toBank: r.toBankCode ? banks.find((b) => b.code === r.toBankCode) : undefined,
  });

  const confirm = useMutation({
    mutationFn: (ids: string[]) => api.post<{ confirmed: number; errors: { id: string; message: string }[] }>('/api/v1/documents/confirm-receipts', { ids }),
    onSuccess: (r) => {
      setSelected(new Set());
      const bad = r.errors.map((e) => `${rows.find((x) => x.id === e.id)?.docNo ?? e.id}: ${e.message}`);
      setNotice(`Đã xác nhận ${r.confirmed} phiếu.${bad.length ? ` Không xác nhận được ${bad.length} phiếu — ${bad.join('; ')}` : ''}`);
    },
    onSettled: () => { void qc.invalidateQueries(); },
  });
  const doConfirm = () => {
    const sum = picked.reduce((s, r) => s + r.total, 0);
    if (window.confirm(`Xác nhận nơi nhận ĐÃ NHẬN TIỀN của ${picked.length} phiếu, tổng ${sum.toLocaleString('vi-VN')} đ?\nĐã đối chiếu quỹ / sao kê ngân hàng nơi nhận. Phần mềm sẽ ghi bút toán nơi nhận (Nợ tiền / Có 11319).`)) {
      setNotice(null);
      confirm.mutate(picked.map((r) => r.id));
    }
  };

  const bank = (code: string, method: string) => (code ? `NH ${code}` : method === 'TM' ? 'Tiền mặt' : method);
  const columns: Column<Row>[] = [
    {
      key: 'pick', noFilter: true, noSort: true, width: 46,
      // Tích để xác nhận (chỉ phiếu chờ / cần xác nhận lại được xác nhận) hoặc để in (phiếu nào cũng được).
      header: <label className="checkbox" title="Chọn tất cả"><input type="checkbox" checked={rows.length > 0 && rows.every((r) => selected.has(r.id))} onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /> Chọn</label>,
      value: () => '',
      render: (r) => <input type="checkbox" checked={selected.has(r.id)} onClick={(e) => e.stopPropagation()} onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} />,
    },
    { key: 'docDate', header: 'Ngày chuyển', type: 'date' },
    { key: 'docNo', header: 'Số phiếu', type: 'code', render: (r) => <>{r.docNo}{r.version > 1 ? <span className="muted"> (v{r.version})</span> : null}</> },
    { key: 'from', header: 'Chuyển từ', value: (r) => `${r.fromBranchCode} ${r.fromBranchName}` },
    { key: 'fromBank', header: 'Rút từ', value: (r) => bank(r.fromBankCode, r.fromMethodCode) },
    { key: 'to', header: 'Chuyển đến', value: (r) => `${r.toBranchCode} ${r.toBranchName}` },
    { key: 'toBank', header: 'Nộp vào', value: (r) => bank(r.toBankCode, r.toMethodCode) },
    { key: 'reasons', header: 'Lý do chi / thu', value: (r) => [r.reasonCode, r.toReasonCode].filter(Boolean).join(' / ') },
    { key: 'total', header: 'Số tiền', type: 'money', sum: true },
    {
      key: 'receipt', header: 'Nhận tiền', value: (r) => RECEIPT_TEXT[r.receipt],
      render: (r) => <span className={r.receipt === 'confirmed' || r.receipt === 'source' ? 'text-ok' : r.receipt === 'invalid' ? 'text-bad' : 'text-warn'}>{RECEIPT_TEXT[r.receipt]}</span>,
    },
    { key: 'confirmedBy', header: 'Kế toán xác nhận', value: (r) => (r.confirmedBy ? `${r.confirmedBy} · ${dateTime(r.confirmedAt)}` : '') },
    { key: 'status', header: 'Định khoản', value: (r) => r.status, render: (r) => <span title={r.errorMessage ?? ''}><StatusBadge status={r.status} /></span> },
    { key: 'description', header: 'Diễn giải' },
  ];

  return (
    <>
      <PageHeader
        title="Phiếu chuyển tiền" code="Q2" helpKey="phieu-chuyen-tien"
        subtitle="Chuyển tiền giữa chi nhánh lập ở hệ thống bán hàng; kế toán đối chiếu quỹ / sao kê rồi xác nhận nơi nhận đã nhận tiền"
      />
      <FilterLayout
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => set({ branchCodes })} />
            <div className="muted" style={{ fontSize: 12 }}>Chi nhánh: lọc theo nơi chuyển hoặc nơi nhận.</div>
          </>
        }
      >
        <div className="card">
          <FormTabs<Tab>
            tabs={[['waiting', 'Chờ xác nhận'], ['confirmed', 'Đã xác nhận'], ['all', 'Tất cả']]}
            value={tab} onChange={(t) => { setTab(t); setSelected(new Set()); setNotice(null); }}
          />
          <div className="vf-toolbar" style={{ marginTop: 6 }}>
            {tab !== 'confirmed' && (
              <button disabled={!canWrite || confirm.isPending || !picked.length} onClick={doConfirm} title="Ghi bút toán nơi nhận (Nợ tiền / Có 11319) cho các phiếu đã tích (chờ xác nhận)">
                <CheckCheck size={15} className="text-ok" /> Xác nhận đã nhận tiền {picked.length ? `${picked.length} phiếu (${picked.reduce((s, r) => s + r.total, 0).toLocaleString('vi-VN')} đ)` : 'các phiếu đã chọn'}
              </button>
            )}
            <PrintButton bare screen="Q2" templates={CASH_TRANSFER_TEMPLATES} disabled={!toPrint.length} title="In các phiếu đã tích" getDocs={() => toPrint.map(sheetOf)} />
            {confirm.isPending && <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>Đang xác nhận…</span>}
          </div>
          {notice && <div className={notice.includes('Không xác nhận') ? 'alert alert-warn' : 'alert alert-ok'} style={{ margin: '6px 0' }}>{notice}</div>}
          <ErrorBox error={q.error ? errorText(q.error) : confirm.error ? errorText(confirm.error) : null} />
          {q.isLoading ? <Loading /> : !rows.length ? <Empty text={tab === 'waiting' ? 'Không có phiếu chuyển tiền nào chờ xác nhận trong kỳ' : 'Không có phiếu chuyển tiền trong kỳ'} /> : (
            <DataGrid storageKey="q2-cash-transfers" rows={rows} rowKey={(r) => r.id} onRowClick={(r) => setOpenId(r.id)} columns={columns} exportName={`Q2-phieu-chuyen-tien-${f.from}-${f.to}`} />
          )}
        </div>
      </FilterLayout>
      {openId && <DocumentDetail id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

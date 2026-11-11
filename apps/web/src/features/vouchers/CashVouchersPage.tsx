/**
 * Danh sách Phiếu thu / Phiếu chi / Phiếu báo có / Phiếu báo nợ / Phiếu kế toán, xếp như danh sách phiếu thu chi quen thuộc của kế toán:
 *   bảng lọc trái : Từ ngày, Đến ngày, Chi nhánh (tích chọn), Tìm kiếm, In các phiếu đã chọn;
 *   thanh nút     : Thêm, Sửa, Copy, Xóa, Nạp, In, Xuất (Sửa / Copy / Xóa / In theo các phiếu đã tích ô Chọn);
 *   lưới          : Chọn, Số phiếu, Nhân viên, Ghi chú, Tiền tệ, Tỷ giá, Số tiền, Tài khoản, Ngày hạch toán, Đối tượng,
 *                   Ngân hàng, Lý do, Số HĐ, Người nhận, Địa chỉ, Điện thoại, Ngày tạo, Ngày sửa, User tạo, User sửa, Tên nhân viên.
 * Bấm một dòng để mở phiếu. Phiếu đã xóa (đã đảo bút toán) không hiện trong danh sách.
 * Thêm: "Lập từ mẫu…" điền sẵn từ bút toán mẫu; ký xác nhận hàng loạt các phiếu đã chọn.
 */
import { NutNhapExcel } from '@/components/NhapExcelWizard';
import { nhapPhieu } from '@/lib/nhapExcel';
import { KpiTien } from '@/components/KpiDanhMuc';
import { useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { PenLine, Plus } from 'lucide-react';
import { BookCheck } from 'lucide-react';
import type { VoucherInput, VoucherTemplateInput, VoucherType } from '@ketoan/contracts';
import { api, ALL_ROWS } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useBranches } from '@/components/filters';
import type { Column } from '@/components/DataGrid';
import { VoucherListPage, dateTimeShort, useListFilter } from '@/components/voucher/VoucherListPage';
import { useBankAccounts } from '../catalog/BankAccountsPage';
import { VOUCHER_META, type ExistingVoucher } from './VoucherForm';
import { CashVoucherForm } from './CashVoucherForm';
import { ManualVoucherForm } from './ManualVoucherForm';
import { useTemplates } from './TemplatesPage';
import { VOUCHER_SCREEN, VOUCHER_TEMPLATES, signRolesOf, type PrintSheet, type SignatureInfo } from './VoucherPrint';
import { PrintButton } from '@/components/print';
import { SIGN_ROLES, useSignableRoles } from './Signatures';

interface Row {
  id: string; docKey: string; docNo: string; docDate: string; total: number; branchCode: string; partnerCode: string | null; partnerName: string | null;
  description: string; counterparty: string; reasonCode: string; employeeCode: string; employeeName: string; phone: string; address: string; invoiceRef: string;
  moneyAccount: string; createdAt: string | null; updatedAt: string | null; createdByName: string; updatedByName: string;
  /** posted = đã ghi sổ; pending = nháp chờ duyệt (nhập Excel, trợ lý đề xuất). */
  status: string;
}
type CashType = VoucherType;
const SUBTITLE: Record<CashType, string> = {
  manual: 'Bút toán tổng hợp: trích trước, phân bổ, điều chỉnh, kết chuyển thủ công',
  receipt: 'Thu tiền mặt vào quỹ, ngoài tiền bán hàng đã ghi tự động',
  payment: 'Chi tiền mặt từ quỹ: trả nhà cung cấp, chi phí, nộp tiền vào ngân hàng…',
  bank_receipt: 'Tiền về tài khoản ngân hàng: khách chuyển khoản trả nợ, lãi tiền gửi, nộp tiền mặt…',
  bank_payment: 'Tiền ra khỏi tài khoản ngân hàng: chuyển khoản trả nhà cung cấp, phí ngân hàng, nộp thuế…',
};
const dateTime = dateTimeShort;

export function CashVouchersPage({ type }: { type: CashType }) {
  const meta = VOUCHER_META[type];
  const qc = useQueryClient();
  const canWrite = useAuth().can('documents:write');
  // Danh sách mở ở tháng hiện tại để thấy ngay phiếu vừa lập.
  const filter = useListFilter();
  const { f } = filter;
  const [form, setForm] = useState<{ existing?: ExistingVoucher; initial?: VoucherTemplateInput; seq: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [signRole, setSignRole] = useState<SignatureInfo['role'] | ''>('');
  const templates = useTemplates(type).data ?? [];
  const { data: branches } = useBranches();
  const banks = useBankAccounts().data ?? [];
  const signable = useSignableRoles().filter((r) => signRolesOf(type).includes(r));

  const q = useQuery({
    queryKey: ['documents', 'voucher', type, f],
    // Đã ghi sổ + nháp chờ duyệt (chữ cam, tích rồi bấm Ghi sổ).
    queryFn: async () => {
      const get = (status: string) => api.getPage<Row[]>('/api/v1/documents', { from: f.from, to: f.to, branchCodes: f.branchCodes || undefined, docType: type, status, voucherInfo: true, pageSize: ALL_ROWS }).then((r) => r.data);
      const [posted, pending] = await Promise.all([get('posted'), get('pending')]);
      return [...pending, ...posted].sort((a, b) => b.docDate.localeCompare(a.docDate) || b.docNo.localeCompare(a.docNo));
    },
    placeholderData: keepPreviousData,
  });
  const load = (id: string) => qc.fetchQuery({ queryKey: ['document', id], queryFn: () => api.get<ExistingVoucher & { signatures?: SignatureInfo[] }>(`/api/v1/documents/${id}`), staleTime: 0 });
  const sorted = (picked: Row[]) => [...picked].sort((a, b) => a.docDate.localeCompare(b.docDate) || a.docNo.localeCompare(b.docNo));
  /** In các phiếu đã chọn: nội dung mới nhất của từng phiếu, mỗi phiếu một trang, theo ngày, số phiếu. */
  const printPicked = async (picked: Row[]): Promise<PrintSheet[]> => {
    if (!picked.length) throw new Error('Chưa tích ô Chọn ở phiếu nào.');
    const docs = await Promise.all(sorted(picked).map((r) => load(r.id)));
    return docs.map((d) => ({ type, docNo: d.docNo, voucher: d.payload, signatures: d.signatures, banks, branchName: branches?.find((b) => b.code === d.payload.branchCode)?.name ?? d.payload.branchCode }));
  };
  const signPicked = async (picked: Row[]) => {
    const r = await api.post<{ signed: number; skipped: string[] }>('/api/v1/signatures', { ids: picked.map((x) => x.id), role: signRole });
    setNotice(`Đã ký ${r.signed} phiếu (${SIGN_ROLES.find((x) => x.role === signRole)?.label.toLowerCase()}).${r.skipped.length ? ` Bỏ qua ${r.skipped.length}: ${r.skipped.slice(0, 5).join('; ')}${r.skipped.length > 5 ? '…' : ''}` : ''}`);
    void qc.invalidateQueries({ queryKey: ['signatures'] });
  };
  // [2026-11-11 Nguyễn Văn Thủy] ghi sổ hàng loạt phiếu chờ duyệt (đóng góp)
  const ghiSo = async (list: Row[]) => {
    const loi: string[] = [];
    let ok = 0;
    for (const r of list) {
      try { await api.post(`/api/v1/vouchers/${r.id}/approve`, {}); ok++; } catch (e) { loi.push(`${r.docNo}: ${e instanceof Error ? e.message : String(e)}`); }
    }
    void qc.invalidateQueries({ queryKey: ['documents'] });
    setNotice(`Đã ghi sổ ${ok} phiếu.${loi.length ? ` ${loi.length} phiếu chưa ghi được — ${loi.slice(0, 5).join('; ')}${loi.length > 5 ? '…' : ''}` : ''}`);
  };
  const bankOf = (acc: string) => banks.find((b) => b.accountCode === acc && b.isActive)?.code ?? '';
  const columns: Column<Row>[] = type === 'manual' ? [
                                { key: 'docNo', header: 'Số phiếu', type: 'code' },
                { key: 'description', header: 'Diễn giải' },
                { key: 'total', header: 'Tổng tiền', type: 'money', sum: true, showZero: true },
                { key: 'branchCode', header: 'Chi nhánh', type: 'code' },
                { key: 'reasonCode', header: 'Lý do', type: 'code' },
                { key: 'employeeCode', header: 'Mã NV', type: 'code' },
                { key: 'employeeName', header: 'Tên NV' },
                { key: 'currency', header: 'Tiền tệ', value: () => 'VND' },
                { key: 'rate', header: 'Tỷ giá', type: 'number', value: () => 1 },
                { key: 'createdAt', header: 'Ngày tạo', value: (r) => dateTime(r.createdAt) },
                { key: 'createdByName', header: 'User tạo' },
                { key: 'docDate', header: 'Ngày chứng từ', type: 'date' },
                { key: 'updatedAt', header: 'Ngày sửa', value: (r) => dateTime(r.updatedAt), hidden: true },
                { key: 'updatedByName', header: 'User sửa', hidden: true },
              ] : [
                // [2026-11-11 Nguyễn Văn Thủy] cột chính theo mẫu chuẩn đứng trước; cột thêm ẩn sẵn, bật ở nút Cột (đóng góp)
                { key: 'docDate', header: 'Ngày hạch toán', type: 'date', width: 104 },
                { key: 'docNo', header: 'Số chứng từ', type: 'code', width: 130 },
                { key: 'description', header: 'Diễn giải', width: 300 },
                { key: 'total', header: 'Số tiền', type: 'money', sum: true, showZero: true, width: 130 },
                { key: 'partnerCode', header: 'Đối tượng', type: 'code', width: 120 },
                { key: 'partnerName', header: 'Tên đối tượng', width: 200 },
                { key: 'counterparty', header: type === 'receipt' || type === 'bank_receipt' ? 'Người nộp' : 'Người nhận', width: 160 },
                { key: 'employeeName', header: 'Nhân viên', width: 160, value: (r) => r.employeeName || r.employeeCode },
                { key: 'bank', header: 'Tài khoản ngân hàng', type: 'code', hidden: type === 'receipt' || type === 'payment', value: (r) => bankOf(r.moneyAccount) },
                { key: 'status', header: 'Trạng thái', width: 100, value: (r) => (r.status === 'pending' ? 'Chờ duyệt' : 'Đã ghi sổ'), title: 'Chờ duyệt = phiếu nháp (nhập Excel…) chưa có bút toán: tích rồi bấm Ghi sổ' },
                { key: 'branchCode', header: 'Chi nhánh', type: 'code', hidden: (branches?.length ?? 0) < 2 },
                { key: 'moneyAccount', header: 'Tài khoản tiền', type: 'code', hidden: true },
                { key: 'reasonCode', header: 'Lý do hạch toán', type: 'code', hidden: true },
                { key: 'invoiceRef', header: 'Số HĐ', type: 'code', hidden: true },
                { key: 'address', header: 'Địa chỉ', hidden: true },
                { key: 'phone', header: 'Điện thoại', hidden: true },
                { key: 'currency', header: 'Tiền tệ', value: () => 'VND', hidden: true },
                { key: 'rate', header: 'Tỷ giá', type: 'number', value: () => 1, hidden: true },
                { key: 'createdAt', header: 'Ngày tạo', value: (r) => dateTime(r.createdAt), hidden: true },
                { key: 'createdByName', header: 'Người tạo', hidden: true },
                { key: 'updatedAt', header: 'Ngày sửa', value: (r) => dateTime(r.updatedAt), hidden: true },
                { key: 'updatedByName', header: 'Người sửa', hidden: true },
              ];

  return (
    <VoucherListPage
      chiTiet
      kpi={<KpiTien title={meta.title} total={q.data?.reduce((s, r) => s + (Number(r.total) || 0), 0)} count={q.data?.length} from={f.from} to={f.to}
        tk={type === 'receipt' || type === 'payment' ? '111' : type === 'bank_receipt' || type === 'bank_payment' ? '112' : null} />}
      title={meta.title} code={meta.code} subtitle={SUBTITLE[type]} helpKey={meta.helpKey}
      filter={filter} query={{ ...q, queryKey: ['documents', 'voucher', type] }} columns={columns} storageKey={`voucher-list-${type}-v2`} canWrite={canWrite}
      notice={notice} setNotice={setNotice}
      addButtons={[{ key: 'add', label: 'Thêm', icon: <Plus size={15} className="text-ok" />, onClick: () => setForm({ seq: Date.now() }) }]}
      onOpen={async (r) => setForm({ existing: await load(r.id), seq: 0 })}
      onCopy={async (r) => {
        // Copy: lập phiếu mới điền sẵn nội dung phiếu đã chọn (ngày hôm nay, số mới; bỏ phần thanh toán chứng từ).
        const d = await load(r.id);
        const { docNo: _n, docDate: _d, settle: _s, ...rest } = d.payload as VoucherInput;
        const lines = rest.lines.map(({ settleItemId: _a, settleDocNo: _b, settleDocDate: _c, settleTotal: _e, settleRemaining: _f, ...l }) => l);
        setForm({ initial: { ...rest, lines, name: '', isActive: true } as VoucherTemplateInput, seq: Date.now() });
      }}
      extraPanel={(picked) => <PrintButton screen={VOUCHER_SCREEN[type]} templates={VOUCHER_TEMPLATES[type]} label="In các phiếu đã chọn" getDocs={() => printPicked(picked)} />}
      extraToolbar={(picked, run) => (
        <>
          {canWrite && <button disabled={!picked.some((r) => r.status === 'pending')} title="Ghi sổ các phiếu chờ duyệt đã tích (phiếu nhập Excel…); phiếu lỗi báo riêng, phiếu khác vẫn ghi" onClick={() => run(() => ghiSo(picked.filter((r) => r.status === 'pending')))}><BookCheck size={15} /> Ghi sổ{picked.some((r) => r.status === 'pending') ? ` ${picked.filter((r) => r.status === 'pending').length}` : ''}</button>}
          {canWrite && nhapPhieu(type) && <NutNhapExcel loai={nhapPhieu(type)!} />}
          <PrintButton bare screen={VOUCHER_SCREEN[type]} templates={VOUCHER_TEMPLATES[type]} getDocs={() => printPicked(picked)} />
          {canWrite && templates.length > 0 && (
            <select className="select input" style={{ height: 26, marginLeft: 8, width: 'auto' }} value="" title="Lập phiếu điền sẵn từ bút toán mẫu" onChange={(e) => { const t = templates.find((x) => x.code === e.target.value); if (t) { setNotice(null); setForm({ initial: t.voucher, seq: Date.now() }); } }}>
              <option value="">Lập từ mẫu…</option>
              {templates.map((t) => <option key={t.code} value={t.code}>{t.code} — {t.name}</option>)}
            </select>
          )}
          {signable.length > 0 && picked.length > 0 && (
            <>
              <select className="select input" style={{ height: 26, marginLeft: 8, width: 'auto' }} value={signRole} onChange={(e) => setSignRole(e.target.value as SignatureInfo['role'])}>
                <option value="">Ký với vai…</option>
                {SIGN_ROLES.filter((r) => signable.includes(r.role)).map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
              </select>
              <button disabled={!signRole} onClick={() => run(() => signPicked(picked))}><PenLine size={15} /> Ký {picked.length} phiếu</button>
            </>
          )}
        </>
      )}
    >
      {form && (() => {
        const onSaved = (docNo: string, docDate: string, addNew: boolean) => {
          setNotice(`Đã ghi sổ ${meta.title.toLowerCase()} ${docNo}.`);
          setForm(addNew ? { seq: Date.now() } : null);
          filter.widen(docDate);
        };
        const key = form.existing?.id ?? `new-${form.seq}`;
        return type === 'manual'
          ? <ManualVoucherForm key={key} existing={form.existing} initial={form.initial} onClose={() => setForm(null)} onSaved={onSaved} />
          : <CashVoucherForm key={key} type={type} existing={form.existing} initial={form.initial} onClose={() => setForm(null)} onSaved={onSaved} />;
      })()}
    </VoucherListPage>
  );
}

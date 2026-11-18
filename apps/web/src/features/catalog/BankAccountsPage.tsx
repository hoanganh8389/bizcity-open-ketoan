/**
 * Danh mục ngân hàng (DM09): Mã ngân hàng · Tên ngân hàng · Số TK · Ghi chú · Tài khoản hạch toán 112 chi tiết (Địa chỉ, Điện thoại, Chủ TK, Người liên lạc ẩn mặc định).
 * [2026-11-17 kiennt] "TK kế toán" → "Tài khoản hạch toán"; bốn cột liên hệ ẩn mặc định (đóng góp)
 * Hình thức thanh toán chuyển khoản trỏ về tài khoản ngân hàng; phiếu báo nợ / báo có hiện tên ngân hàng ở ô tài khoản tiền;
 * sổ tiền gửi (ACC56) lọc theo từng tài khoản ngân hàng.
 */
import { useMaTrung } from '@/lib/maTrung';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { CatalogToolbar } from '@/components/CatalogToolbar';
import { nhapLoai } from '@/lib/nhapExcel';
import { NutNhapExcel } from '@/components/NhapExcelWizard';
import { DataGrid, type Column } from '@/components/DataGrid';
import { AccountPicker } from '@/components/pickers';
import { useBranches, BranchPicker } from '@/components/filters';

export interface BankAccount {
  code: string; bankName: string; bankBranch: string; accountNo: string; holder: string; accountCode: string; accountName: string; bankAddress: string; bankPhone: string; contact: string;
  branchCode: string | null; currency: string; note: string; isActive: boolean;
}

export const useBankAccounts = (enabled = true) =>
  useQuery({ queryKey: ['bank-accounts'], queryFn: () => api.get<BankAccount[]>('/api/v1/bank-accounts'), staleTime: 60_000, enabled });

export function BankAccountsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canWrite = can('catalog:write');
  const q = useBankAccounts();
  const [editing, setEditing] = useState<(Partial<BankAccount> & { isNew?: boolean }) | null>(null);
  const [sel, setSel] = useState<BankAccount | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const del = useMutation({ mutationFn: (code: string) => api.delete(`/api/v1/bank-accounts/${encodeURIComponent(code)}`), onSuccess: () => { setSel(null); void qc.invalidateQueries({ queryKey: ['bank-accounts'] }); } });
  return (
    <>
      <PageHeader title="Ngân hàng" code="DM09" subtitle="Tài khoản ngân hàng; mỗi tài khoản gắn một tài khoản hạch toán 112 chi tiết" helpKey="hinh-thuc-thanh-toan" />
      <div className="card">
        <CatalogToolbar
          trash={{ catalog: 'bank-accounts', title: 'Tài khoản ngân hàng', sel: sel ? { key: sel.code } : null }}
          phai
          canWrite={canWrite}
          hasSelection={Boolean(sel)}
          busy={del.isPending}
          onAdd={() => setEditing({ isNew: true, isActive: true, currency: 'VND' })}
          // [2026-11-18 01:40 PM kiennt] NT-DM-006 — nút Nhân bản (đóng góp)
          onCopy={() => sel && setEditing({ ...sel, code: '', accountNo: '', accountCode: '', isNew: true, isActive: true })}
          onEdit={() => sel && setEditing(sel)}
          onDelete={() => { if (sel && window.confirm(`Bạn có chắc chắn muốn xoá ${sel.code} - ${sel.bankName}?`)) del.mutate(sel.code); }}
          onRefresh={() => q.refetch()}
          onExport={() => exportRef.current?.()}
          // [2026-11-18 10:40 AM kiennt] NT-DM-005 — nút Nhập Excel (khứ hồi với tệp Xuất) (đóng góp)
          extra={canWrite && <NutNhapExcel loai={nhapLoai('tk-ngan-hang')!} />}
        />
        <ErrorBox error={q.error ? errorText(q.error) : del.error ? errorText(del.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid storageKey="dm09-v2" exportName="ngan-hang" groupable exportRef={exportRef} rows={q.data ?? []} rowKey={(b) => b.code}
            onSelect={setSel} onRowDoubleClick={(b) => canWrite && setEditing(b)} rowClassName={(b) => (b.isActive ? '' : 'muted')} footerLabel={false}
            columns={[
              { key: 'code', header: 'Mã ngân hàng', type: 'code', width: 120 },
              { key: 'bankName', header: 'Tên ngân hàng', width: 260 },
              { key: 'bankAddress', header: 'Địa chỉ', width: 200, hidden: true },
              { key: 'bankPhone', header: 'Điện thoại', type: 'code', width: 110, hidden: true },
              { key: 'holder', header: 'Chủ TK', width: 200, hidden: true },
              { key: 'accountNo', header: 'Số TK', type: 'code', width: 140 },
              { key: 'contact', header: 'Người liên lạc', width: 140, hidden: true },
              { key: 'note', header: 'Ghi chú', width: 200 },
              { key: 'accountCode', header: 'Tài khoản hạch toán', type: 'code', width: 140 },
              { key: 'accountName', header: 'Tên tài khoản hạch toán', width: 200, hidden: true },
              { key: 'bankBranch', header: 'Chi nhánh ngân hàng', width: 150, hidden: true },
              { key: 'branchCode', header: 'Chi nhánh dùng', type: 'code', width: 110, hidden: true },
              { key: 'currency', header: 'Tiền tệ', type: 'code', width: 70, hidden: true },
              { key: 'active', header: 'Hoạt động', type: 'check', width: 85, value: (b) => b.isActive },
            ] satisfies Column<BankAccount>[]} />
        )}
      </div>
      {editing && <BankForm value={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function BankForm({ value, onClose }: { value: Partial<BankAccount> & { isNew?: boolean }; onClose: () => void }) {
  const qc = useQueryClient();
  const branches = useBranches().data ?? [];
  const [v, setV] = useState(value);
  const set = (p: Partial<BankAccount>) => setV((x) => ({ ...x, ...p }));
  const viewAgain = useViewAgain();
  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/bank-accounts/${encodeURIComponent(v.code ?? '')}`, {
      bankName: v.bankName ?? '', bankBranch: v.bankBranch ?? '', accountNo: v.accountNo ?? '', holder: v.holder ?? '', accountCode: v.accountCode ?? '',
      branchCode: v.branchCode || undefined, currency: v.currency ?? 'VND', note: v.note ?? '', isActive: v.isActive ?? true,
      bankAddress: v.bankAddress ?? '', bankPhone: v.bankPhone ?? '', contact: v.contact ?? '',
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['bank-accounts'] }); void qc.invalidateQueries({ queryKey: ['payment-methods'] }); if (value.isNew) onClose(); else viewAgain[1](); },
  });
  // [2026-11-17 07:29 PM kiennt] NT-DM-002 L01 — thêm mới trùng mã (cả mã trong thùng rác) thì báo, khoá Ghi; trước đây PUT ghi đè bản ghi cũ (đóng góp)
  const maTrung = useMaTrung({ isNew: value.isNew, code: v.code, list: useBankAccounts(Boolean(value.isNew)).data?.map((b) => ({ code: b.code, name: b.bankName })), catalog: 'bank-accounts' });
  return (
    <Modal viewAgain={viewAgain} viewFirst={!value.isNew} title={value.isNew ? 'Thêm tài khoản ngân hàng' : `Tài khoản ngân hàng ${value.code ?? ''}`} onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={save.isPending || !v.code || !v.bankName || !v.accountNo || !v.accountCode || Boolean(maTrung)} title={maTrung || undefined} onClick={() => save.mutate()}>Ghi</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <Field label="Mã ngân hàng (*)" error={maTrung || null}><input className="input mono" value={v.code ?? ''} disabled={!value.isNew} onChange={(e) => set({ code: e.target.value.trim() })} placeholder="VCB-HN" autoFocus /></Field>
      <Field label="Điện thoại"><input className="input" value={v.bankPhone ?? ''} onChange={(e) => set({ bankPhone: e.target.value })} /></Field>
      <Field label="Tên ngân hàng (*)" full><input className="input" value={v.bankName ?? ''} onChange={(e) => set({ bankName: e.target.value })} placeholder="Vietcombank - CN Thành Công" /></Field>
      <Field label="Địa chỉ" full><input className="input" value={v.bankAddress ?? ''} onChange={(e) => set({ bankAddress: e.target.value })} /></Field>
      <Field label="Tài khoản hạch toán (*)" hint="112 chi tiết; mỗi tài khoản hạch toán chỉ gắn một tài khoản ngân hàng đang dùng">
        <AccountPicker postingOnly value={v.accountCode ?? ''} onChange={(accountCode) => set({ accountCode })} placeholder="112…" />
      </Field>
      <Field label="Chủ TK"><input className="input" value={v.holder ?? ''} onChange={(e) => set({ holder: e.target.value })} /></Field>
      <Field label="Số TK (*)"><input className="input mono" value={v.accountNo ?? ''} onChange={(e) => set({ accountNo: e.target.value.trim() })} /></Field>
      <Field label="Người liên lạc"><input className="input" value={v.contact ?? ''} onChange={(e) => set({ contact: e.target.value })} /></Field>
      <Field label="Ghi chú" full><input className="input" value={v.note ?? ''} onChange={(e) => set({ note: e.target.value })} /></Field>
      <Field label="Chi nhánh ngân hàng"><input className="input" value={v.bankBranch ?? ''} onChange={(e) => set({ bankBranch: e.target.value })} /></Field>
      <Field label="Chi nhánh thường dùng">
        <BranchPicker value={v.branchCode ?? ''} onChange={(c) => set({ branchCode: c || null })} placeholder="Dùng chung" />
      </Field>
      <Field label="Trạng thái"><label className="checkbox"><input type="checkbox" checked={v.isActive ?? true} onChange={(e) => set({ isActive: e.target.checked })} /> Đang dùng</label></Field>
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
    </Modal>
  );
}

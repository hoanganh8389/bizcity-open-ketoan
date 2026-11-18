/**
 * Hình thức thanh toán (DM05) → tài khoản hạch toán. Mã phải khớp methodCode trong chứng từ gửi sang.
 * Lưới: Mã · Tên · HTTT qua ngân hàng · Tài khoản hạch toán · Tài khoản ngân hàng · Đối tượng nhận hộ · Ghi công nợ (Thứ tự ẩn).
 * [2026-11-17 kiennt] bỏ Tỉ lệ chiết khấu khỏi lưới và form và Ghi chú / Mô tả khỏi lưới và form (giá trị cũ giữ nguyên khi ghi); "Tài khoản tiền" → "Tài khoản hạch toán" (đóng góp)
 */
import { useMaTrung } from '@/lib/maTrung';
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { CatalogToolbar } from '@/components/CatalogToolbar';
import { nhapLoai } from '@/lib/nhapExcel';
import { NutNhapExcel } from '@/components/NhapExcelWizard';
import { AccountPicker, ListPicker, PartnerPicker } from '@/components/pickers';
import { useBankAccounts } from '../catalog/BankAccountsPage';

interface Method { code: string; name: string; accountCode: string; bankAccountCode: string | null; isReceivable: boolean; isActive: boolean; note: string; sortOrder: number | null; discountRate: number | null; partnerCode: string | null }

export function PaymentMethodsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canWrite = can('settings:write');
  const [editing, setEditing] = useState<(Partial<Method> & { isNew?: boolean }) | null>(null);
  const [sel, setSel] = useState<Method | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const q = useQuery({ queryKey: ['payment-methods'], queryFn: () => api.get<Method[]>('/api/v1/posting/payment-methods') });
  const del = useMutation({ mutationFn: (code: string) => api.delete(`/api/v1/posting/payment-methods/${encodeURIComponent(code)}`), onSuccess: () => { setSel(null); void qc.invalidateQueries({ queryKey: ['payment-methods'] }); } });
  return (
    <>
      <PageHeader title="Hình thức thanh toán" code="DM05" subtitle="Mỗi hình thức ứng với một tài khoản hạch toán (tiền mặt, tài khoản ngân hàng…)" helpKey="hinh-thuc-thanh-toan" />
      <div className="card">
        <CatalogToolbar
          trash={{ catalog: 'payment-methods', title: 'Hình thức thanh toán', sel: sel ? { key: sel.code, label: sel.name } : null }}
          phai
          canWrite={canWrite}
          hasSelection={Boolean(sel)}
          busy={del.isPending}
          onAdd={() => setEditing({ isNew: true, isActive: true })}
          onEdit={() => sel && setEditing(sel)}
          onDelete={() => { if (sel && window.confirm(`Bạn có chắc chắn muốn xoá hình thức ${sel.code} - ${sel.name}?`)) del.mutate(sel.code); }}
          onRefresh={() => q.refetch()}
          onExport={() => exportRef.current?.()}
          // [2026-11-18 10:40 AM kiennt] NT-DM-005 — nút Nhập Excel (khứ hồi với tệp Xuất) (đóng góp)
          extra={canWrite && <NutNhapExcel loai={nhapLoai('hinh-thuc-thanh-toan')!} />}
        />
        <ErrorBox error={q.error ? errorText(q.error) : del.error ? errorText(del.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid
            storageKey="dm05-v2"
            exportName="hinh-thuc-thanh-toan"
            groupable
            exportRef={exportRef}
            rows={q.data ?? []}
            rowKey={(m) => m.code}
            onSelect={setSel}
            onRowDoubleClick={(m) => canWrite && setEditing(m)}
            rowClassName={(m) => (m.isActive ? '' : 'muted')}
            footerLabel={false}
            columns={[
              { key: 'code', header: 'Mã', type: 'code', width: 110 },
              { key: 'name', header: 'Tên', width: 240 },
              { key: 'viaBank', header: 'HTTT qua ngân hàng', type: 'check', width: 130, value: (m) => Boolean(m.bankAccountCode) || m.accountCode.startsWith('112') },
              { key: 'sortOrder', header: 'Thứ tự', type: 'number', width: 70, hidden: true },
              { key: 'accountCode', header: 'Tài khoản hạch toán', type: 'code', width: 130 },
              { key: 'bankAccountCode', header: 'Tài khoản ngân hàng', type: 'code', width: 140 },
              { key: 'partnerCode', header: 'Đối tượng nhận hộ', type: 'code', width: 120 },
              { key: 'isReceivable', header: 'Ghi công nợ', type: 'check', width: 90 },
              { key: 'active', header: 'Hoạt động', type: 'check', width: 85, value: (m) => m.isActive },
            ] satisfies Column<Method>[]}
          />
        )}
      </div>
      {editing && <MethodForm value={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function MethodForm({ value, onClose }: { value: Partial<Method> & { isNew?: boolean }; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState(value);
  const set = (p: Partial<Method>) => setV((x) => ({ ...x, ...p }));
  const banks = useBankAccounts().data ?? [];
  const transit = String(v.accountCode ?? '').startsWith('113');
  const viewAgain = useViewAgain();
  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/posting/payment-methods/${encodeURIComponent(v.code ?? '')}`, { name: v.name, accountCode: v.accountCode, bankAccountCode: v.bankAccountCode || null, isReceivable: Boolean(v.isReceivable), isActive: v.isActive !== false, note: value.note ?? '', sortOrder: v.sortOrder ?? null, discountRate: value.discountRate ?? null, partnerCode: v.partnerCode || null }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['payment-methods'] }); if (value.isNew) onClose(); else viewAgain[1](); },
  });
  // [2026-11-17 07:29 PM kiennt] NT-DM-002 L01 — thêm mới trùng mã (cả mã trong thùng rác) thì báo, khoá Ghi; trước đây PUT ghi đè bản ghi cũ (đóng góp)
  const maTrung = useMaTrung({ isNew: value.isNew, code: v.code, list: useQuery({ queryKey: ['payment-methods'], queryFn: () => api.get<Method[]>('/api/v1/posting/payment-methods'), enabled: Boolean(value.isNew) }).data, catalog: 'payment-methods' });
  return (
    <Modal viewAgain={viewAgain} viewFirst={!value.isNew} title="Thông tin hình thức thanh toán" onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={save.isPending || !v.code || !v.name || Boolean(maTrung)} title={maTrung || undefined} onClick={() => save.mutate()}>Ghi</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <Field label="Mã (*)" error={maTrung || null}><input className="input mono" value={v.code ?? ''} disabled={!value.isNew} onChange={(e) => set({ code: e.target.value.trim() })} autoFocus /></Field>
      <Field label="Tên (*)"><input className="input" value={v.name ?? ''} onChange={(e) => set({ name: e.target.value })} /></Field>
      <Field label="Thứ tự"><input className="input num" value={v.sortOrder ?? ''} onChange={(e) => set({ sortOrder: e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')) })} /></Field>
      <Field label="Ngân hàng" hint="Chuyển khoản, QR, quẹt thẻ: chọn tài khoản ngân hàng nhận tiền, tài khoản kế toán tự lấy theo">
        <ListPicker items={banks.filter((b) => b.isActive || b.code === v.bankAccountCode).map((b) => ({ code: b.code, name: `${b.bankName} ${b.accountNo}`, hint: b.accountCode }))} value={v.bankAccountCode ?? ''}
          onChange={(code) => { const b = banks.find((x) => x.code === code); set({ bankAccountCode: code || null, ...(b && !v.partnerCode && !transit ? { accountCode: b.accountCode } : {}) }); }} placeholder="Không gắn (tiền mặt…)" />
      </Field>
      {v.bankAccountCode && !v.partnerCode && (
        <Field label="Tiền về ngân hàng" full hint="QR, quẹt thẻ vào tài khoản chi nhánh: ghi Nợ 11319 lúc bán; khi ngân hàng báo có, lập phiếu thu tiền gửi Nợ 112 / Có 11319. 11319 còn số dư = tiền chưa về">
          <label className="checkbox"><input type="checkbox" checked={transit} onChange={(e) => { const b = banks.find((x) => x.code === v.bankAccountCode); set({ accountCode: e.target.checked ? '11319' : b?.accountCode ?? v.accountCode }); }} /> Ghi qua tiền đang chuyển (11319), chưa ghi thẳng tài khoản ngân hàng</label>
        </Field>
      )}
      <Field label="Đối tượng nhận hộ" hint="Tiền vào tài khoản của công ty, cửa hàng không cầm tiền (QR, quẹt thẻ): tài khoản hạch toán là phải thu nội bộ 13681, chi tiết theo đối tượng này">
        {/* [2026-11-17 07:29 PM kiennt] NT-DM-002 L07 — chỉ gợi ý đối tượng đang dùng (giá trị đang chọn vẫn hiện tên) (đóng góp) */}
        <PartnerPicker activeOnly value={v.partnerCode ?? ''} onChange={(partnerCode) => set({ partnerCode: partnerCode || null })} placeholder="Không (tiền về chính đơn vị)" />
      </Field>
      <Field label="Tài khoản hạch toán"><AccountPicker postingOnly value={v.accountCode ?? ''} disabled={Boolean(v.bankAccountCode) && !v.partnerCode && !transit} onChange={(accountCode) => set({ accountCode })} /></Field>
      <Field label="Tuỳ chọn">
        <label className="checkbox"><input type="checkbox" checked={Boolean(v.isReceivable)} onChange={(e) => set({ isReceivable: e.target.checked })} /> Ghi công nợ (không thu tiền)</label>
        <label className="checkbox"><input type="checkbox" checked={v.isActive !== false} onChange={(e) => set({ isActive: e.target.checked })} /> Đang sử dụng</label>
      </Field>
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
    </Modal>
  );
}

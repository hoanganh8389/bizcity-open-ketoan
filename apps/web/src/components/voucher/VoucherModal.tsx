/**
 * Khung form phiếu dùng chung cho mọi chứng từ lập trong phần mềm (phiếu thu chi, phiếu kế toán, phiếu kho,
 * hoá đơn bán, hàng bán trả lại…), xếp như form chứng từ của phần mềm kế toán để bàn:
 *
 *   VoucherModal  hộp phiếu: dòng tiêu đề, thanh nút (Ghi, Ghi và thêm mới, In, Xuất, Xóa, Đóng + nút riêng của phiếu),
 *                 thân phiếu, lời báo lỗi, lời báo "chỉ xem" (phiếu người khác lập, kỳ đã khoá, phiếu nhận từ hệ thống khác).
 *   L / C         nhãn và ô của lưới đầu phiếu 3 cột (lớp .vf-head-grid): L c r = nhãn cột c hàng r; C c r = ô; pair: chia đôi; wide: kéo hết hàng.
 *   useVoucherSave  luồng Ghi / Xóa chung: kiểm tra → hỏi xác nhận → gửi → làm mới danh sách → báo về màn danh sách.
 *   readOnlyReason  lý do phiếu chỉ xem (null = sửa được).
 * Sửa giao diện, lời báo, thứ tự nút ở đây là mọi phiếu đổi theo.
 */
import { useState, type ReactNode } from 'react';
import { DockScope, MinimizeButton, useDockWindow } from '@/layout/WindowDock';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { Download, LogOut, Printer, Save, X } from 'lucide-react';
import { api, errorText } from '@/lib/api';

/** Phần chung của phiếu đã lưu (GET /api/v1/documents/:id). */
export interface SavedVoucher {
  id: string; docKey: string; docNo: string; status: string; version: number;
  canModify?: boolean; modifyBlockedReason?: string | null; createdByName?: string | null; sourceSystem?: string;
}

/** Phiếu chỉ xem vì sao (null = sửa được). external: phiếu nhận từ hệ thống khác (sửa ở nơi phát sinh). */
export function readOnlyReason(existing: SavedVoucher | undefined, opts: { external?: boolean } = {}): string | null {
  if (!existing) return null;
  if (existing.status === 'cancelled') return 'Phiếu đã xóa.';
  if (opts.external ?? (existing.sourceSystem !== undefined && existing.sourceSystem !== 'manual')) return 'Phiếu nhận từ hệ thống bán hàng: chỉ xem, sửa ở nơi phát sinh rồi gửi lại.';
  if (existing.canModify === false) return existing.modifyBlockedReason ?? `Phiếu do ${existing.createdByName ?? 'người khác'} lập. Bạn chỉ xem được; sửa / xóa cần kế toán trưởng.`;
  return null;
}

export interface ToolButton { key: string; label: ReactNode; icon?: ReactNode; onClick: () => void; disabled?: boolean; title?: string }

export function VoucherModal({ title, existing, readOnly, saving, onSave, onSaveNew, onPrint, printSlot, onExport, onDelete, onClose, extraButtons, error, readOnlyText, children }: {
  title: string;
  existing?: SavedVoucher;
  readOnly: boolean;
  saving?: boolean;
  onSave: () => void;
  onSaveNew?: () => void;
  onPrint?: () => void;
  /** Nút In có chọn mẫu (PrintButton); thay cho onPrint. */
  printSlot?: ReactNode;
  onExport?: () => void;
  onDelete: () => void;
  onClose: () => void;
  /** Nút riêng của phiếu, đứng trước nút Đóng. */
  extraButtons?: ToolButton[];
  error?: string | null;
  readOnlyText?: string | null;
  children: ReactNode;
}) {
  const cancelled = existing?.status === 'cancelled';
  const dock = useDockWindow(onClose);
  return (
    <DockScope>
    <div className={`modal-mask${dock.minimized ? ' is-min' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide vf" role="dialog" aria-modal="true">
        <div className="modal-head vf-head" ref={(el) => { dock.headRef.current = el; }}>
          <span>{title}{existing ? ` ${existing.docNo}` : ''}{cancelled ? ' (đã huỷ)' : ''}</span>
          {dock.top && <MinimizeButton onClick={dock.minimize} />}
          <button className="btn btn-sm btn-ghost" title="Đóng" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="vf-toolbar">
          <button disabled={readOnly || saving} onClick={onSave}><Save size={15} /> Ghi</button>
          {onSaveNew && <button disabled={readOnly || saving} onClick={onSaveNew}><Save size={15} /> Ghi và thêm mới</button>}
          {printSlot ?? (onPrint && <button disabled={!existing} onClick={onPrint}><Printer size={15} /> In</button>)}
          {onExport && <button onClick={onExport}><Download size={15} /> Xuất</button>}
          <button disabled={readOnly || saving} onClick={onDelete}><X size={15} className="text-bad" /> Xóa</button>
          {extraButtons?.map((b) => <button key={b.key} disabled={b.disabled} title={b.title} onClick={b.onClick}>{b.icon}{b.label}</button>)}
          <button onClick={onClose}><LogOut size={15} /> Đóng</button>
        </div>
        <div className="vf-body">
          {children}
          {error && <div className="alert alert-bad" style={{ margin: '6px 0 0' }}>{error}</div>}
          {readOnlyText && !cancelled && <div className="alert alert-warn" style={{ margin: '6px 0 0' }}>{readOnlyText}</div>}
        </div>
      </div>
    </div>
    </DockScope>
  );
}

/** Nhãn của ô đầu phiếu ở cột c (1..3), hàng r. */
export function L({ c, r, req, children }: { c: number; r: number; req?: boolean; children: ReactNode }) {
  return <label className={req ? 'req' : undefined} style={{ gridColumn: c * 2 - 1, gridRow: r }}>{children}</label>;
}
/** Ô đầu phiếu ở cột c, hàng r; pair: chia đôi; wide: kéo tới hết cột 3. */
export function C({ c, r, pair, wide, children }: { c: number; r: number; pair?: boolean; wide?: boolean; children: ReactNode }) {
  return <div className={pair ? 'vf-pair' : 'vf-cell'} style={{ gridColumn: wide ? `${c * 2} / 7` : c * 2, gridRow: r }}>{children}</div>;
}

/**
 * Luồng Ghi / Xóa chung của form phiếu.
 *   check   : kiểm tra trước khi ghi, trả lời báo (null = hợp lệ)
 *   submit  : gửi phiếu (tạo hoặc sửa), trả số phiếu
 *   confirm : câu hỏi xác nhận trước khi ghi (bỏ trống = không hỏi)
 *   invalidate: các khoá dữ liệu cần làm mới sau khi ghi / xóa (danh sách…)
 * Lỗi máy chủ có details.duplicate (trùng chứng từ): hỏi "vẫn ghi?" rồi gửi lại với force = true.
 */
export function useVoucherSave<T extends { docNo: string; status?: string }>({ existing, check, submit, confirm, invalidate, onSaved, onClose, docDate }: {
  existing?: SavedVoucher;
  check: () => string | null;
  submit: (force: boolean) => Promise<T>;
  confirm?: string;
  invalidate: QueryKey[];
  /** status: trạng thái sau khi ghi ('posted' đã ghi sổ, 'pending' chờ duyệt ở ACC14). */
  onSaved: (docNo: string, docDate: string, addNew: boolean, status?: string) => void;
  onClose: () => void;
  docDate: string;
}) {
  const qc = useQueryClient();
  const [problem, setProblem] = useState<string | null>(null);
  const refresh = () => { for (const k of [...invalidate, ['document']]) void qc.invalidateQueries({ queryKey: k }); };
  const save = useMutation({ mutationFn: ({ force }: { addNew: boolean; force: boolean }) => submit(force) });
  const remove = useMutation({ mutationFn: (reason: string) => api.post('/api/v1/documents/cancel', { docKey: existing!.docKey, reason }) });
  const run = (addNew: boolean, force = false) => {
    save.mutate({ addNew, force }, {
      onSuccess: (r) => { refresh(); onSaved(r.docNo, docDate, addNew, r.status); },
      onError: (e) => {
        const dup = (e as { details?: { duplicate?: boolean } }).details?.duplicate;
        if (dup && window.confirm(`${errorText(e)}\n\nVẫn ghi phiếu này?`)) { save.reset(); run(addNew, true); }
      },
    });
  };
  const doSave = (addNew: boolean) => {
    const msg = check();
    setProblem(msg);
    if (msg) return;
    if (confirm && !window.confirm(confirm)) return;
    run(addNew);
  };
  const doDelete = () => {
    if (!existing) return setProblem('Bạn chưa lưu lại phiếu');
    if (!window.confirm(`Bạn có chắc chắn muốn xóa phiếu ${existing.docNo} không?`)) return;
    const reason = window.prompt('Lý do xóa phiếu (bút toán được ghi số âm để đảo):');
    if (reason) remove.mutate(reason, { onSuccess: () => { refresh(); onClose(); } });
  };
  const error = problem ?? (save.error ? errorText(save.error) : remove.error ? errorText(remove.error) : null);
  return { doSave, doDelete, saving: save.isPending || remove.isPending, error, setProblem };
}

/**
 * KHUNG IN DÙNG CHUNG cho mọi mẫu phiếu / chứng từ.
 *
 *   - Mỗi màn khai các mẫu in của mình là PrintTemplate<T> (tên, khổ giấy, mẫu HTsoft tương ứng, hàm vẽ một tờ).
 *   - <PrintButton> (PrintButton.tsx) cho người dùng chọn mẫu, nhớ mẫu mặc định theo mã màn.
 *   - <PrintJob> dựng các tờ vào cuối <body>, ẩn ứng dụng, gọi hộp thoại in của trình duyệt; in xong thì gỡ.
 *
 * Khổ giấy dùng trang có tên (@page pA4, pA5L…) khai ở styles/theme.css, mục "Khung in dùng chung".
 * Nhiều chứng từ in một lần: mỗi chứng từ một trang (hoặc nhiều trang nếu mẫu có `copies` > 1, ví dụ phiếu 2 liên).
 */
import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/lib/auth';
import { useTenant } from '@/features/system/TenantPage';
import { useBranches } from '@/components/filters';
import { khoFullLabel, useKho } from '@/components/phieu-hang/ChonKho';
import type { PrintOverrides } from '@ketoan/contracts';
import { PrintOverridesCtx } from './overrides';

/** A4 dọc, A4 ngang, A5 ngang (nửa tờ A4), A5 dọc, giấy cuộn 80mm (máy in bill), tờ tem (A4, không lề). */
export type Paper = 'A4' | 'A4L' | 'A5L' | 'A5' | 'roll80' | 'label';
export const PAPER_LABEL: Record<Paper, string> = { A4: 'A4 dọc', A4L: 'A4 ngang', A5L: 'A5 ngang', A5: 'A5 dọc', roll80: 'Giấy cuộn 80mm', label: 'Tờ tem A4' };

/** Thông tin chung mọi mẫu cần: đơn vị, chi nhánh, người in. */
export interface PrintCtx {
  org: { name: string; address: string; taxCode: string; phone: string; logo: string | null };
  branchName: (code: string | undefined) => string;
  /** Phân kho thật "mã · tên": mã trống = kho mặc định của chi nhánh (như sổ kho tự gán). */
  kho: (branchCode: string | undefined, warehouseCode?: string) => string;
  userName: string;
}

export interface PrintTemplate<T> {
  /** Mã mẫu, duy nhất trong một màn; lưu làm mẫu mặc định. */
  id: string;
  name: string;
  paper: Paper;
  /** Tên tệp mẫu HTsoft tương ứng (để đối chiếu khi chỉnh bố cục). */
  source?: string;
  /** Số liên: in lặp lại tờ này, mỗi liên ghi "Liên 1", "Liên 2"… */
  copies?: number;
  /** Mẫu in nhiều chứng từ trên một tờ (bảng kê, tem): nhận cả danh sách. */
  many?: boolean;
  /** "In bảng đang xem": không dựng tờ riêng, in nguyên màn hình như nút In cũ (xem screenTemplate). */
  screen?: boolean;
  render: (doc: T, ctx: PrintCtx & { copy: number }) => ReactNode;
  /** Chỉ dùng khi many: vẽ một tờ từ cả danh sách. */
  renderAll?: (docs: T[], ctx: PrintCtx) => ReactNode;
}

/** overrides: phần chỉnh nội dung theo cấu hình HT05 (tiêu đề, số liên, khổ, chữ ký, căn cứ, ghi chú cuối, logo). */
export interface PrintJobSpec<T> { template: PrintTemplate<T>; docs: T[]; overrides?: PrintOverrides }

/** Mẫu "In bảng đang xem" (in trang như trước, theo khổ A4 ngang của sổ sách) — để cuối danh sách mẫu của màn báo cáo. */
export const screenTemplate = <T,>(): PrintTemplate<T> => ({ id: 'screen', name: 'In bảng đang xem', paper: 'A4L', screen: true, render: () => null });

export function usePrintCtx(): PrintCtx {
  const { user } = useAuth();
  const { data: tenant } = useTenant();
  const { data: branches } = useBranches();
  const khoAll = useKho();
  return {
    org: {
      name: tenant?.name ?? user?.tenant.name ?? '',
      address: tenant?.address ?? '',
      taxCode: tenant?.taxCode ?? '',
      phone: tenant?.phone ?? '',
      logo: tenant?.logo ?? null,
    },
    branchName: (code) => (code ? branches?.find((b) => b.code === code)?.name ?? code : ''),
    kho: (branchCode, warehouseCode) => khoFullLabel(khoAll, branchCode, warehouseCode),
    userName: user?.fullName ?? '',
  };
}

/** In một lần: dựng các tờ của job, gọi hộp thoại in, xong gọi onDone. */
export function PrintJob<T>({ job, onDone }: { job: PrintJobSpec<T>; onDone: () => void }) {
  const ctx = usePrintCtx();
  useEffect(() => {
    document.body.classList.add('printing-doc');
    const done = () => { document.body.classList.remove('printing-doc'); onDone(); };
    window.addEventListener('afterprint', done, { once: true });
    // Chờ ảnh logo / mã vạch vẽ xong rồi mới mở hộp thoại in.
    const t = window.setTimeout(() => window.print(), 150);
    return () => { window.clearTimeout(t); window.removeEventListener('afterprint', done); document.body.classList.remove('printing-doc'); };
  }, [onDone]);

  const { template: tpl, docs } = job;
  const ov = job.overrides ?? {};
  const paper = ov.paper ?? tpl.paper;
  const copies = ov.copies ?? tpl.copies ?? 1;
  const foot = ov.footer ? <div className="pd-footer-note">{ov.footer}</div> : null;
  const pages: ReactNode[] = [];
  if (tpl.many && tpl.renderAll) pages.push(<div key="all" className="pdoc" data-paper={paper}>{tpl.renderAll(docs, ctx)}{foot}</div>);
  else docs.forEach((d, i) => {
    for (let c = 1; c <= copies; c++) pages.push(<div key={`${i}-${c}`} className="pdoc" data-paper={paper}>{tpl.render(d, { ...ctx, copy: c })}{foot}</div>);
  });
  return createPortal(<PrintOverridesCtx.Provider value={ov}><div className="pdoc-root">{pages}</div></PrintOverridesCtx.Provider>, document.body);
}

/**
 * Các khối dựng mẫu in (dùng trong render của PrintTemplate): đầu trang đơn vị + mẫu số, tiêu đề, dòng thông tin,
 * bảng hàng, số tiền bằng chữ, hàng chữ ký. Kiểu chữ, khoảng cách ở styles/theme.css (lớp .pd-*).
 */
import type { ReactNode } from 'react';
import { date, money } from '@/lib/format';
import { amountInWords } from '@/lib/docso';
import type { PrintCtx } from './PrintHost';
import { usePrintOverrides } from './overrides';

/** Căn cứ ban hành in dưới mẫu số: chế độ kế toán doanh nghiệp hiện hành (TT99/2025 thay TT200 từ năm tài chính 2026, xem docs/can-cu). */
export const FORM_NOTE = '(Ban hành theo Thông tư số 99/2025/TT-BTC ngày 27/10/2025 của Bộ Tài chính)';

/** Tiền in trên phiếu: luôn hiện số 0. */
export const m = (v: number | undefined | null) => money(v ?? 0, { blankZero: false });
/** Tiền trong ô bảng: ô 0 để trống. */
export const mb = (v: number | undefined | null) => money(v ?? 0, { blankZero: true });
export const qty = (v: number | undefined | null) => (v ? v.toLocaleString('vi-VN', { maximumFractionDigits: 3 }) : '');
export const words = (v: number) => amountInWords(Math.round(v));
export const sumQty = (ls: { qty: number }[]) => ls.reduce((s, l) => s + l.qty, 0);
/** Hoá đơn "C26TAA - 0000123 ngày 05/10/2026"; không có số thì rỗng. */
export const invoiceText = (inv?: { no?: string; serial?: string; date?: string } | null) => (inv?.no ? `${inv.serial ? `${inv.serial} - ` : ''}${inv.no}${inv.date ? ` ngày ${date(inv.date)}` : ''}` : '');
/** Đường chấm để ghi tay. */
export const Dots = ({ w = '100%' }: { w?: number | string }) => <span className="pd-dots" style={{ width: w }} />;
/** Một dòng của Fields: [nhãn, giá trị]. */
export type Row = [ReactNode, ReactNode];
/** Thêm dòng vào Fields khi có giá trị: ...opt(d.note, 'Ghi chú', d.note). */
export const opt = (cond: unknown, k: ReactNode, v: ReactNode): Row[] => (cond ? [[k, v]] : []);

/** "2026-10-05" → "Ngày 05 tháng 10 năm 2026"; trống → dòng chấm để ghi tay. */
export function dayText(d?: string) {
  if (!d) return 'Ngày ...... tháng ...... năm ..........';
  const [y, mo, da] = d.slice(0, 10).split('-');
  return `Ngày ${da} tháng ${mo} năm ${y}`;
}

/** Đầu trang: đơn vị (logo, tên, chi nhánh, địa chỉ, MST) bên trái; mẫu số bên phải. */
export function OrgHead({ ctx, branchCode, form, formNote = FORM_NOTE, extra }: { ctx: PrintCtx; branchCode?: string; form?: string; formNote?: string; extra?: ReactNode }) {
  const ov = usePrintOverrides();
  const branch = ctx.branchName(branchCode);
  if (ov.formNote !== undefined) formNote = ov.formNote;
  return (
    <div className="pd-head">
      <div className="pd-org">
        {ctx.org.logo && ov.showLogo !== false && <img src={ctx.org.logo} alt="" />}
        <div>
          <b>{ctx.org.name}</b>
          {branch && branch !== ctx.org.name && <div>{branch}</div>}
          {ctx.org.address && <div>Địa chỉ: {ctx.org.address}</div>}
          {ctx.org.taxCode && <div>MST: {ctx.org.taxCode}</div>}
        </div>
      </div>
      {(form || extra) && (
        <div className="pd-form">
          {form && <b>{form}</b>}
          {form && formNote && <div>{formNote}</div>}
          {extra}
        </div>
      )}
    </div>
  );
}

/** Tiêu đề phiếu, ngày, số phiếu; `side` là khối Nợ / Có hoặc Quyển số đặt bên phải tiêu đề. */
/** copyLabels: tên từng liên (mặc định Liên 1 lưu, Liên 2 giao khách hàng). */
export function Title({ title, sub, date, no, side, copy, copies, copyLabels = ['Lưu', 'Giao khách hàng'] }: { title: string; sub?: ReactNode; date?: string; no?: string; side?: ReactNode; copy?: number; copies?: number; copyLabels?: string[] }) {
  const ov = usePrintOverrides();
  if (ov.title) title = ov.title;
  return (
    <div className="pd-titlebox">
      <div className="pd-title">
        <h1>{title}</h1>
        {sub && <div className="pd-sub">{sub}</div>}
        {date !== undefined && <div className="pd-date">{dayText(date)}</div>}
        {copies && copies > 1 && copy ? <div className="pd-copy">Liên {copy}{copyLabels[copy - 1] ? `: ${copyLabels[copy - 1]}` : ''}</div> : null}
      </div>
      <div className="pd-side">
        {no !== undefined && <div>Số: <b>{no || '..........'}</b></div>}
        {side}
      </div>
    </div>
  );
}

/** Các dòng "Nhãn: giá trị" (người nộp, địa chỉ, lý do…). Giá trị trống in dòng chấm. */
export function Fields({ rows }: { rows: Row[] }) {
  return (
    <table className="pd-fields">
      <tbody>
        {rows.map(([k, v], i) => <tr key={i}><td>{k}:</td><td>{v === '' || v === undefined || v === null ? <span className="pd-dots" /> : v}</td></tr>)}
      </tbody>
    </table>
  );
}

export interface Col<R> { h: ReactNode; w?: number | string; num?: boolean; center?: boolean; v: (r: R, i: number) => ReactNode }

/** Bảng hàng / định khoản: tiêu đề cột, các dòng, phần cộng (tfoot) tuỳ mẫu. */
export function Table<R>({ cols, rows, foot, minRows = 0, compact }: { cols: Col<R>[]; rows: R[]; foot?: ReactNode; minRows?: number; compact?: boolean }) {
  const blanks = Math.max(0, minRows - rows.length);
  return (
    <table className={`pd-table${compact ? ' compact' : ''}`}>
      <thead><tr>{cols.map((c, i) => <th key={i} style={{ width: c.w }}>{c.h}</th>)}</tr></thead>
      <tbody>
        {rows.map((r, i) => <tr key={i}>{cols.map((c, j) => <td key={j} className={c.num ? 'num' : c.center ? 'c' : undefined}>{c.v(r, i)}</td>)}</tr>)}
        {Array.from({ length: blanks }, (_, i) => <tr key={`b${i}`} className="blank">{cols.map((_, j) => <td key={j}>&nbsp;</td>)}</tr>)}
      </tbody>
      {foot && <tfoot>{foot}</tfoot>}
    </table>
  );
}

/** Dòng "Số tiền viết bằng chữ". */
export function Words({ amount, label = 'Số tiền viết bằng chữ' }: { amount: number; label?: string }) {
  return <div className="pd-words">{label}: <i>{words(amount)}</i></div>;
}

export interface Sign { title: string; note?: string; name?: ReactNode; stamp?: ReactNode }
/**
 * Hàng chữ ký; `date` in dòng "Ngày … tháng … năm …" phía trên ô cuối.
 * Cấu hình HT05 có hàng chữ ký riêng thì thay (giữ dấu "Đã ký xác nhận" của ô cùng chức danh); keep = hàng chữ ký cố định của mẫu
 * (vd ô ngân hàng trên uỷ nhiệm chi) không thay.
 */
export function Signs({ items, date, keep }: { items: Sign[]; date?: string | true; keep?: boolean }) {
  const ov = usePrintOverrides();
  if (ov.signs?.length && !keep) items = ov.signs.map((s) => ({ ...items.find((x) => x.title === s.title), ...s, name: s.name || items.find((x) => x.title === s.title)?.name }));
  return (
    <div className="pd-signs-wrap">
      {date && <div className="pd-sign-date">{dayText(date === true ? undefined : date)}</div>}
      <div className="pd-signs" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
        {items.map((s, i) => (
          <div key={i}>
            <b>{s.title}</b>
            <span>{s.note ?? '(Ký, họ tên)'}</span>
            {s.stamp}
            {s.name && <div className="pd-sign-name">{s.name}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Dòng chân trang nhỏ: ngày giờ in, người in. */
export function Foot({ ctx, text }: { ctx: PrintCtx; text?: string }) {
  return <div className="pd-foot">{text ? `${text} · ` : ''}In lúc {new Date().toLocaleString('vi-VN', { hour12: false })}{ctx.userName ? ` · ${ctx.userName}` : ''}</div>;
}

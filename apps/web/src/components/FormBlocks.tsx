/**
 * Khối dựng form chi tiết dạng phần mềm kế toán để bàn, dùng chung cho mọi form xem chứng từ:
 *   GroupBox  khung có tiêu đề (như group box "Thông tin chứng từ hạch toán", "Tùy chọn", "Tổng cộng"…)
 *   Field     một ô: nhãn bên trái, giá trị trong ô chỉ đọc
 *   InputField một ô nhập: nhãn bên trái, ô nhập / ô chọn bên phải (form lập phiếu)
 *   FormGrid  lưới chia cột cho các ô
 *   FormTabs  dải thẻ (Phiếu xuất | Thuế, Chi tiết hóa đơn | Nợ khuyến mãi | …)
 * Cỡ chữ, chiều cao ô, khoảng cách nằm ở lớp .fb-* trong styles/theme.css: sửa một lần, mọi form đổi theo.
 */
import type { CSSProperties, ReactNode } from 'react';

export function GroupBox({ title, children, style }: { title?: ReactNode; children: ReactNode; style?: CSSProperties }) {
  return (
    <fieldset className="fb-group" style={style}>
      {title && <legend>{title}</legend>}
      {children}
    </fieldset>
  );
}

/** Ô chỉ đọc có nhãn. labelWidth: bề rộng nhãn (px); span: chiếm mấy cột của FormGrid. */
export function Field({ label, children, labelWidth = 84, span, align = 'left' }: { label: string; children?: ReactNode; labelWidth?: number; span?: number; align?: 'left' | 'right' }) {
  return (
    <div className="fb-field" style={{ gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)`, gridColumn: span ? `span ${span}` : undefined }}>
      <label style={{ textAlign: align }}>{label}</label>
      <div className="fb-value">{children}</div>
    </div>
  );
}

/** Ô nhập có nhãn (cùng cỡ với Field): children là input / select / ô chọn mã. */
export function InputField({ label, children, labelWidth = 84, span, req }: { label: string; children: ReactNode; labelWidth?: number; span?: number; req?: boolean }) {
  return (
    <div className="fb-field fb-input" style={{ gridTemplateColumns: `${labelWidth}px minmax(0, 1fr)`, gridColumn: span ? `span ${span}` : undefined }}>
      <label className={req ? 'req' : undefined}>{label}</label>
      <div className="fb-input-cell">{children}</div>
    </div>
  );
}

export function FormGrid({ cols, children, gap = '4px 10px' }: { cols: number; children: ReactNode; gap?: number | string }) {
  // Màn hẹp: dồn còn 2 cột rồi 1 cột (theme.css, .fb-grid).
  return <div className="fb-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap }}>{children}</div>;
}

export function FormTabs<K extends string>({ tabs, value, onChange }: { tabs: [K, string][]; value: K; onChange: (k: K) => void }) {
  return (
    <div className="fb-tabs">
      {tabs.map(([k, label]) => (
        <button key={k} type="button" className={value === k ? 'active' : ''} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}

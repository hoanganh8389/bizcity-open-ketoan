/**
 * Ô lọc riêng của các báo cáo bán hàng: loại chứng từ (bán / trả lại) và phạm vi sổ.
 */
export interface SalesFilterValue {
  from: string;
  to: string;
  branchCodes: string;
  kind: string;
  scope: string;
}

export function KindSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label>Loại</label>
      <select className="select input w-md" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="all">Bán và trả lại</option>
        <option value="sale">Chỉ bán hàng</option>
        <option value="return">Chỉ hàng trả lại</option>
      </select>
    </div>
  );
}

export function ScopeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="field">
      <label>Phạm vi</label>
      <select className="select input w-md" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="all">Tất cả chứng từ</option>
        <option value="invoiced">Có hoá đơn</option>
        <option value="internal">Chỉ nội bộ</option>
      </select>
    </div>
  );
}

/** Số lượng: tối đa 3 số lẻ, 0 để trống. */
export function Qty({ value }: { value: number }) {
  if (!value) return null;
  return <span className={value < 0 ? 'neg' : ''}>{value.toLocaleString('vi-VN', { maximumFractionDigits: 3 })}</span>;
}

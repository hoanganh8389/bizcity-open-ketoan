/**
 * Nhãn hàng NCC đang bán (đầu hồ sơ NCC) — CHỈ XEM. Nhãn là thuộc tính của mặt hàng (danh mục Ngành → Nhãn → Nhóm), khai
 * một chỗ ở danh mục mặt hàng; ở đây chỉ tổng hợp từ mặt hàng NCC bán / đã nhập. Phiếu mua tự suy nhãn từ các dòng hàng.
 */
import { Link } from 'react-router-dom';
import { useSupplierBrands } from '../du-lieu';

export function NhanHangNcc({ code }: { code: string }) {
  const brands = useSupplierBrands(code);
  return (
    <div className="mh-brand-row" title="Nhãn lấy theo danh mục mặt hàng — muốn đổi nhãn của một mã thì sửa ở Danh mục mặt hàng">
      Nhãn hàng đang bán: {brands.length ? brands.slice(0, 8).map((b) => <span key={b.brandCode} className="mh-brand-chip">{b.name} · {b.skus} mã</span>)
        : <span className="muted">chưa có — khai mặt hàng NCC bán (thẻ Mặt hàng & giá mua) hoặc nhập phiếu</span>}
      {brands.length > 8 && <span className="muted"> +{brands.length - 8} nhãn</span>}
      <span className="muted" style={{ fontSize: 11.5 }}> · theo <Link to="/danh-muc/mat-hang">danh mục mặt hàng</Link>, phiếu tự lấy nhãn theo từng dòng</span>
    </div>
  );
}

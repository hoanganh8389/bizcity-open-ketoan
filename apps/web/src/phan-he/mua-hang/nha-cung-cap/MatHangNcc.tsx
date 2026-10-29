/**
 * MẶT HÀNG & GIÁ MUA (thẻ trong Hồ sơ NCC) — NCC bán mã nào, theo ĐVT nào, giá bao nhiêu, mã / tên hàng bên NCC, ghi chú: một
 * bảng (BangGiaMua), sửa ngay trên bảng. Lập đơn / phiếu cho NCC bấm "Điền mặt hàng của NCC" là có sẵn các dòng.
 * Đặt hàng theo tồn max: màn Phân tích đặt hàng (MH02) lọc sẵn NCC này.
 */
import { Link } from 'react-router-dom';
import { type MhData } from '../du-lieu';
import { BangGiaMua } from '../thanh-phan/BangGiaMua';

export function MatHangNcc({ code, data, onChanged }: { code: string; data: MhData; onChanged: () => void }) {
  return (
    <div>
      <BangGiaMua partnerCode={code} data={data} onChanged={onChanged} />
      <div className="mh-panel" style={{ marginTop: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
        <span>Cần đặt bao nhiêu (theo tồn max kho + shop, hàng đi đường, đơn chưa về)?</span>
        <Link className="btn btn-sm btn-primary" to={`/mua-hang/dat-hang?ncc=${encodeURIComponent(code)}`}>Mở Phân tích đặt hàng của NCC này →</Link>
      </div>
    </div>
  );
}

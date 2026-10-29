/**
 * Phiếu chuyển kho (KHO01): chi nhánh / kho xuất → nhận, dòng hàng + số lượng (không tiền). Màn dùng chung
 * components/phieu-hang, dữ liệu mẫu ở mau-chuyen-kho.json (đến khi có API thật: docs/api/13-phieu-nhap-tay.md).
 */
import type { TradeDoc } from '@/lib/tradeDocs';
import { PhieuHangPage } from '@/components/phieu-hang/PhieuHangPage';
import mau from './mau-chuyen-kho.json';

export function ChuyenKhoPage() {
  return <PhieuHangPage kind="transfer" code="KHO01" seed={mau as unknown as TradeDoc[]} subtitle="Chuyển hàng giữa chi nhánh / kho: chọn nơi xuất, nơi nhận, mã hàng và số lượng" />;
}

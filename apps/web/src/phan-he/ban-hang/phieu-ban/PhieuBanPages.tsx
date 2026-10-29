/**
 * Phiếu bán hàng (BH10) và hàng bán trả lại (BH11) — màn dùng chung components/phieu-hang, dữ liệu mẫu ở các tệp JSON
 * cùng thư mục (đến khi có API thật: lib/tradeDocs.ts, docs/api/13-phieu-nhap-tay.md).
 */
import type { TradeDoc } from '@/lib/tradeDocs';
import { PhieuHangPage } from '@/components/phieu-hang/PhieuHangPage';
import mauBan from './mau-ban-hang.json';
import mauTraLai from './mau-tra-lai.json';

export function PhieuBanPage() {
  return <PhieuHangPage kind="sale" code="BH10" seed={mauBan as unknown as TradeDoc[]} subtitle="Hoá đơn / phiếu bán hàng: khách hàng, dòng hàng, thuế, thu tiền (để trống = ghi công nợ)" />;
}

export function HangBanTraLaiPage() {
  return <PhieuHangPage kind="sale_return" code="BH11" seed={mauTraLai as unknown as TradeDoc[]} subtitle="Khách trả lại hàng: dòng hàng trả, thuế giảm, trả tiền khách (để trống = trừ công nợ)" />;
}

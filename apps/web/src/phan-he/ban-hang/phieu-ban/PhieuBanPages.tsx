/**
 * Phiếu bán hàng (BH10) và hàng bán trả lại (BH11) — màn dùng chung components/phieu-hang, dữ liệu thật của module phieu-ban
 * (lib/tradeDocs.ts → /api/v1/m/phieu-ban/docs, phiếu NT-BH-015). Phiếu thử cũ lưu ở trình duyệt không chuyển sang sổ: báo một lần.
 */
// [2026-11-13 11:55 PM Võ Hoàng] NGHIEM-THU — NT-BH-015: BH10 / BH11 chạy API thật, bỏ dữ liệu mẫu, báo phiếu thử cũ (đóng góp)
import { useState } from 'react';
import { hasMockChanges, type TradeDoc, type TradeKind } from '@/lib/tradeDocs';
import { PhieuHangPage } from '@/components/phieu-hang/PhieuHangPage';

/** Không còn dữ liệu mẫu: màn chạy API thật (giữ mảng cố định để tradeApi không dựng lại mỗi lần vẽ). */
const NO_SEED: TradeDoc[] = [];

/** Phiếu thử đã lập ở máy này khi màn còn chạy dữ liệu giả: không vào sổ, không chuyển — báo một lần rồi bỏ. */
function OldMockNotice({ kind }: { kind: TradeKind }) {
  const [show, setShow] = useState(() => hasMockChanges(kind));
  if (!show) return null;
  const dismiss = () => {
    try { localStorage.removeItem(`ketoan.mock.trade.${kind}`); } catch { /* bỏ qua */ }
    setShow(false);
  };
  return (
    <div className="alert alert-warn" style={{ margin: '0 0 8px', display: 'flex', gap: 8, alignItems: 'center' }}>
      <span>Màn này giờ ghi phiếu thật vào sổ kế toán. Các phiếu thử đã lập trên máy này trước đây (dữ liệu giả) <b>không còn dùng</b> và không chuyển sang sổ — lập lại nếu cần.</span>
      <button type="button" className="btn btn-xs" onClick={dismiss}>Đã hiểu</button>
    </div>
  );
}

export function PhieuBanPage() {
  return (
    <>
      <OldMockNotice kind="sale" />
      <PhieuHangPage kind="sale" code="BH10" seed={NO_SEED} subtitle="Phiếu bán buôn, bán nợ, bán ngoài quầy: số theo cửa hàng, duyệt là vào sổ, bỏ duyệt là đảo bút toán (để trống thu tiền = ghi công nợ)" />
    </>
  );
}

export function HangBanTraLaiPage() {
  return (
    <>
      <OldMockNotice kind="sale_return" />
      <PhieuHangPage kind="sale_return" code="BH11" seed={NO_SEED} subtitle="Khách trả lại hàng: ghi số phiếu bán gốc để nối và không trả quá số đã bán; trả tiền khách (để trống = trừ công nợ)" />
    </>
  );
}

/**
 * CHUYỂN CHI NHÁNH LÀM VIỆC (HT04): chọn chi nhánh đang làm việc (lib/workBranch). Phiếu lập mới tự điền chi nhánh này; màn
 * theo chi nhánh cha (tồn max, đặt hàng, chuyển hàng shop…) tự mở đúng cây. Cũng đổi được ở nút chi nhánh trên thanh trên cùng.
 */
import { PageHeader } from '@/components/PageHeader';
import { ChonChiNhanh } from '@/components/ChiNhanhLamViec';

export function ChiNhanhLamViecPage() {
  return (
    <>
      <PageHeader title="Chuyển chi nhánh làm việc" code="HT04" helpKey="chi-nhanh-lam-viec" subtitle="Chọn chi nhánh bạn đang làm việc — mọi phiếu lập mới (đơn đặt, phiếu nhập, chuyển kho, phiếu thu chi…) tự điền chi nhánh này" />
      <div className="card" style={{ padding: 12, maxWidth: 820 }}>
        <ChonChiNhanh autoFocus />
        <div className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>
          Đổi nhanh ở bất kỳ màn nào: bấm nút <b>📍 chi nhánh</b> trên thanh trên cùng (phím tắt <kbd>Alt</kbd> + <kbd>B</kbd>). Lựa chọn lưu theo tài khoản trên máy này.
          Phiếu đã lập giữ nguyên chi nhánh của nó; trên phiếu mới vẫn đổi được chi nhánh khác nếu cần.
        </div>
      </div>
    </>
  );
}

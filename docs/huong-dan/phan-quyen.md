# Phân quyền (HT12)
<!-- [2026-11-06 09:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W4: hướng dẫn màn Phân quyền (Role Editor), module modules/phan-quyen, ADR-0027 -->

**Màn này trả lời một câu:** *ai được làm gì* trong đơn vị của bạn, và cho bạn sửa điều đó mà không phải nhờ lập trình viên.

Chỉ người có quyền **Quản trị người dùng** (`users:write`, thường là chủ đơn vị) vào được màn này.

## Ba thẻ

- **Ma trận quyền** — hàng là từng quyền (nhóm theo module), cột là vai trò. Ô **Có** nghĩa vai trò làm được; **Cấm** nghĩa bị chặn dù chỗ khác có cho; **—** là chưa có gì. Ba cột đầu là vai trò hệ thống (Chủ đơn vị, Kế toán trưởng, Kế toán…) chỉ để xem. Bấm ô của **vai trò đơn vị** để Cho, Cấm hoặc gỡ luật.
- **Vai trò** — tạo vai trò riêng của đơn vị (ví dụ *Thủ kho*): chọn **vai trò nền** (nhận sẵn quyền của nền) rồi thêm luật Cho / Cấm. Mã, loại, vai trò nền không đổi được sau khi tạo; muốn đổi nền thì tạo vai trò mới. Đổi tên và vô hiệu / bật lại được.
- **Người dùng** — chọn một người: **Xem như** cho thấy đúng các quyền họ đang có và vì sao (vai trò chính, bổ sung, nền, Cho, Cấm). Gán hoặc thu hồi vai trò ở đây; mỗi lần cần ghi lý do.

## Vài điều nên biết

- **Cấm thắng.** Một luật Cấm làm mất quyền dù vai trò chính hay vai trò khác cho phép. Riêng **chủ đơn vị** không bị Cấm, để không ai tự khoá mình khỏi quản trị.
- **Có hiệu lực ngay.** Gán, thu hồi, thêm hay gỡ luật có tác dụng với người dùng mà không cần họ đăng nhập lại (tối đa 15 giây nếu có nhiều máy chủ).
- **Quyền rủi ro cao** (khoá kỳ, sửa phiếu người khác, quản trị người dùng…) có nhãn *Cao*. Cho quyền đó, hoặc gán vai trò đang có quyền đó, bắt **nhập lại mật khẩu của bạn**; màn không lưu mật khẩu.
- **Không cấp được quyền bạn không có.** Bạn chỉ Cho / gán được những quyền chính bạn đang giữ.
- **Cấp quyền của một module** cho một nhóm người: tạo vai trò đơn vị, Cho quyền module đó, rồi gán vai trò cho những người cần.
- Mọi thay đổi được ghi nhật ký kèm lý do; lịch sử gán và luật không bị xoá, chỉ thu hồi.

## Với kế toán

Một người làm hai việc (vừa nhập liệu vừa duyệt) thì gán thêm vai trò bổ sung có thời hạn, rồi thu hồi khi xong. Muốn chặn một người xem sổ cái mà vẫn giữ nguyên các quyền khác: tạo vai trò *Hạn chế*, Cấm `ledger:*`, gán cho người đó.

## Với người phát triển

Màn là module giao diện `modules/phan-quyen/` gọi API Core (`/api/v1/roles`, `/api/v1/users/:id/roles`). Quyền do máy chủ quyết; ẩn nút ở giao diện chỉ là tiện. Thiết kế: [ADR-0027](../adr/ADR-0027-core-authorization-plugin-role-editor.md), hợp đồng [`bizcity_authorization@1`](../contracts/BIZCITY-AUTHORIZATION-v1.md).

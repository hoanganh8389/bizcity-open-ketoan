# ADR-0015 · Duyệt rulepack tại bản cài: bản cài tự chủ tự duyệt, nhãn tách khỏi nhãn Bizcity
<!-- [2026-11-02 05:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — ADR-0015 chấp nhận: bản cài self-host (dev, CEO) tự duyệt rulepack cho đơn vị mình; lượt duyệt gắn phiên bản + băm nội dung; nhãn "Đạt theo duyệt của đơn vị" tách khỏi nhãn Bizcity; chốt Q020-4. -->

- Trạng thái: **Chấp nhận** — chủ dự án (Johnny Chu) 2026-11-02: "chúng ta làm code, cho dev, và CEO tự chủ selfhost, cho nên việc này hãy để họ có quyền quản lý là tự duyệt"
- Ngày: 2026-11-02 · Người quyết: chủ dự án · Mức Kernel: **K1** — thêm bảng chỉ thêm `rulepack_approvals` (migration 0056), ba action, một quyền; **không** đổi sổ, luật định khoản, cửa nạp, kỳ kế toán
- Luật / hợp đồng liên quan: [ADR-0012](ADR-0012-conformance-engine-tru-cot-kernel.md) (Conformance Engine), [R-VNC-3, R-VNC-8, R-VNC-11](../rules/RULE-VN-CONFORMANCE.md), [Q020-4](../phases/PHASE-020-KIEM-CHUAN-PHAP-LY-VN/00-MASTER-PLAN.md)

## Bối cảnh

R-VNC-3 (Tier 0) chỉ cho rulepack `approved` khi nguồn pháp lý đã rà và có người duyệt kế toán / thuế được chỉ định ở thượng nguồn. Q020-4 (ai duyệt) chưa có người. Kết quả: mọi ca trên mọi bản cài đứng ở "Chờ duyệt" vô thời hạn.

Open Kế Toán là mã nguồn để dev và doanh nghiệp **tự cài, tự chủ** (self-host). Người chịu trách nhiệm pháp lý về sổ sách là chính doanh nghiệp (kế toán trưởng, người đại diện). Chờ một người duyệt chung ở thượng nguồn trái với mô hình đó.

## Quyết định

1. **Đơn vị tự duyệt rulepack trên bản cài của mình.** Quyền mới `conformance:approve`: chủ đơn vị (mọi quyền) và kế toán trưởng. Kế toán viên, người xem, nhà phát triển không có. Khoá API và AI không duyệt được (action kiểm `actor.kind = user`, `ai: deny`, không phơi MCP).
2. **Lượt duyệt gắn đúng phiên bản + băm nội dung** (`packHash` = SHA-256 rulepack + mọi ca). Cập nhật gói `@bizcity/vn-rulepacks` làm đổi băm thì lượt duyệt cũ **tự hết hiệu lực**: ca trở lại "Chờ duyệt", màn hiện "lệch nội dung — cần duyệt lại". Không có lượt duyệt "vĩnh viễn".
3. **Nhãn tách bạch.** Nhãn "Passed Bizcity VN Conformance [...]" chỉ khi mọi ca PASS dựa trên rulepack `approved` ở thượng nguồn. Có ca PASS dựa trên duyệt tại đơn vị thì nhãn là **"Đạt theo duyệt của đơn vị [...]"**; báo cáo ghi `approval_basis` (`upstream` / `local` / `mixed` / `none`) và từng ca ghi `approval`.
4. **Điều kiện tối thiểu vẫn giữ**: có người duyệt kế toán (họ tên, ≥ 3 ký tự); miền thuế / hoá đơn / quản lý thuế / lương có thêm người duyệt thuế; ghi phạm vi đã rà (≥ 10 ký tự); phạm vi chưa xác định (hồ sơ kế toán chưa khai) vẫn "Chờ duyệt" — không ai duyệt được một quy định chưa biết có áp hay không.
5. **Chỉ thêm, có bằng chứng.** `rulepack_approvals` chỉ thêm (trigger), RLS theo đơn vị; thu hồi là dòng `revoke`; mỗi lượt duyệt / thu hồi có một dòng `audit_logs` (`core.conformance.approve` / `revoke`).
6. **Thượng nguồn không đổi.** SC-VNC-2 vẫn fail closed với `status: approved` trong kho (R-VNC-3); `--certify` (CI, hồ sơ giả lập) không dùng lượt duyệt của bản cài nào.

## Hệ quả

- Doanh nghiệp tự chủ có kết luận PASS / FAIL thật cho ca có bằng chứng, thay vì "Chờ duyệt" mãi.
- Người đọc báo cáo luôn biết kết luận dựa trên duyệt của ai: nhãn, `approval_basis`, thẻ "duyệt tại đơn vị" ở từng ca, tên người duyệt.
- Rủi ro: đơn vị duyệt ẩu. Giảm bằng: tên người duyệt bắt buộc, bằng chứng chỉ thêm, nhãn không mượn uy tín Bizcity, hết hiệu lực khi nội dung đổi. Engine vẫn chỉ phân tích, không chặn ghi sổ (R-VNC-10).

## Phương án đã cân nhắc

| Phương án | Vì sao không chọn |
|---|---|
| Chờ người duyệt chung ở thượng nguồn (Q020-4 ban đầu) | Trái mô hình self-host; mọi bản cài kẹt ở "Chờ duyệt" |
| Cho owner bật `approved` ngay trong JSON của gói | Sửa gói đã phát hành, mất truy vết, lẫn với duyệt thượng nguồn, mất khi cập nhật |
| Tự duyệt nhưng dùng chung nhãn Bizcity | Nhãn đọc như Bizcity bảo đảm luật đã được chuyên gia rà — gây hiểu lầm |

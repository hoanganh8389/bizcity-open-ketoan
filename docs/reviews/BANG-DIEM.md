# Bảng điểm review — matrix
<!-- [2026-11-08 12:40 PM Johnny Chu - Chu Hoàng Anh] REVIEW — bảng điểm matrix: trục × review, trục × trụ cột, phase × phiên bản; cột R1 chấm từ REVIEW-R1-FOUNDATION-2026-11-08 -->

> Nguồn số: [review-board.json](review-board.json). Thang và trục: [TIEU-CHI.md](TIEU-CHI.md). Mỗi review thêm **một cột**, không sửa cột cũ. Cột "Đích v1.0" là mức Core phải đạt để phát hành 1.0.0 (chủ dự án duyệt khi đóng v0.5.0).
> Bảng này hiện ghi tay cùng PR review; sinh tự động từ JSON là việc đề xuất cho R2 (tránh hai nguồn — LEAN-3).

## 1. Trục × review

| Trục | Cổng | R1 · 2026-11-08 | Đích v1.0 | Khoảng cách R1 |
|---|---|---|---|---|
| A1 Nền tảng lõi & hợp đồng | | **3** | 4 | `library@1`, `document@1` đủ mã; bằng chứng chạy thật |
| A2 Bảo toàn số & một cửa | ● | **2** | 4 | RV-R1-01 cờ thoát · RV-R1-07 hai cửa · RV-R1-14 E2 |
| A3 Liên tục & truy vết | | **2** | 3 | màn truy vết; `correlation_id` xuyên suốt; lineage giá vốn |
| A4 Cross-module & sự kiện | | **3** | 4 | bằng chứng chạy thật (lane diagnostics) |
| A5 Minh bạch & nhật ký vận hành | | **2** | 3 | RV-R1-09 nhật ký sự kiện từng dòng, giữ dead |
| A6 Cổng kiểm & thư viện lỗi | | **3** | 4 | RV-R1-10 Commit Guard; thực tập sinh thử thật (S021-17) |
| A7 Kernel báo lỗi cho module | ● | **2** | 4 | RV-R1-02 ánh xạ mã · RV-R1-06 ngữ cảnh + remedy |
| A8 Chứng từ: phiên bản · workflow · transition · quyền | | **2** | 3 | RV-R1-08 · RV-R1-11 |
| A9 Policy Registry | | **2** | 3 | RV-R1-04 · 05 · 12; Rule Contract + evaluate; API plugin |
| A10 Cấu hình UI/UX & tài liệu dev | | **2** | 3 | RV-R1-16 ui-kit, GateResult; RV-R1-15 tài liệu dev |
| A11 Module thi hành | | **2** | 3 | RV-R1-18: ≥ 3 phân hệ đạt mẫu mua hàng, ở `modules/` |
| A12 Lean & vận hành cộng đồng | ● | **2** | 3 | RV-R1-03 `main` xanh; độ phủ luật ≥ C; tài liệu khớp mã |
| **Tổng** | | **27 / 48 · 56 %** | **41 / 48** | |
| **Kết luận** | | **ĐẠT có điều kiện** | ĐẠT | |

## 2. Trục × trụ cột 0–VIII — chỗ hai bảng nói khác nhau

Mức trụ cột lấy từ `docs/standard/tru-cot.json` (`updated` 2026-11-07, nguồn ghi tay có bằng chứng). Cột cuối chỉ ra tiêu chí mà review R1 **tìm được kẽ hở** dù trụ cột đang ghi "đạt" — đó là nơi phải chạy bộ kiểm chứ không ghi tay (R-ECP-SCORE, D026-6).

| Trụ cột | Tiêu chí (đạt / một phần / tài liệu / chưa) | Trục review tựa vào | R1 | Lệch cần xem lại |
|---|---|---|---|---|
| 0 Quản trị dữ liệu gốc | 2 / 12 / 0 / 1 | A9, A10 | 2 | — |
| I Sổ cái bất biến | **4 / 0 / 0 / 0** | A2 | **2** | **L-2 (chỉ thêm) đang "đạt" nhưng RV-R1-01 cờ thoát tự bật, RV-R1-14 E2 sửa đầu không cờ** |
| II Định danh, mã có phiên bản | 4 / 0 / 1 / 2 | A1, A9 | 3 | — |
| III Liên tục kế toán | 2 / 0 / 3 / 2 | A3, A8 | 2 | khớp (RV-R1-17) |
| IV Một cửa nạp, cổng kiểm, một ngôn ngữ mã | 4 / 1 / 0 / 0 | A6, A7 | 3 / **2** | **G-2…G-5 "đạt" nhưng lỗi Kernel trả sai mã (RV-R1-02) — "một ngôn ngữ mã" đứt ở tầng CSDL → HTTP** |
| V Chính sách có phiên bản | 2 / 1 / 3 / 1 | A9, A2 | 2 | P-7 lỗi thời (cửa nạp đã nhận tham chiếu) |
| VI Bằng chứng, quan sát được | 2 / 3 / 0 / 0 | A5, A3 | 2 | khớp |
| VII Cô lập đơn vị, phân quyền | 2 / 0 / 0 / 2 | A8, A10 | 2 | S-3 / S-4 chưa: khớp RV-R1-11 (SoD) |
| VIII Mở rộng bằng module, kiểm chuẩn | 2 / 1 / 0 / 2 | A1, A4, A11, A12 | 2–3 | khớp (RV-R1-18) |

Nền móng 01–17 (`nen-mong.json`): 1 đạt (08 Command & Event Contracts) · 15 một phần · 1 chưa (14 Semantic Metrics & KPI). Review R1 đồng ý với 08 = đạt (A4 = 3) và với 14 = chưa.

## 3. Phase × phiên bản × trạng thái

Trạng thái phase chép từ [phases/README.md](../phases/README.md) tại ngày review (không phải nguồn). Phiên bản theo [PHIEN-BAN.md](PHIEN-BAN.md) (chủ dự án duyệt nhóm phase 2026-11-08).

| Phiên bản | Phase | Trạng thái phase (2026-11-08) | Phát hiện R1 chạm vào | Đóng được? |
|---|---|---|---|---|
| **v0.1.0 Nền móng** | 001 Chốt chuẩn | 🟡 82 % — việc tay của chủ (0.2 CI, 0.6, 0.7) | RV-03 | ☐ |
| | 002 Audit, phân lớp | 🟡 60 % | — | ☐ |
| | 003 Action, bằng chứng, MCP đọc | ✅ | — | ✅ |
| | 004 Một cửa ghi sổ | ✅ (50 % tín hiệu) | **RV-01, RV-07, RV-14** | ☐ |
| | 005 Chính sách có phiên bản | ✅ (kế toán trưởng chưa ký ADR) | RV-12 | 🟡 |
| | 006 Outbox sự kiện | ✅ | RV-09 (giữ dead) | 🟡 |
| | 007 Cô lập đơn vị RLS | ✅ | — | ✅ |
| | 008 Sao lưu PITR | 🟡 máy dev; ⛔ máy chủ thật | — | ⛔ |
| | 009 MCP ghi | 🟡 `journal.post` ⛔ | — | 🟡 |
| | 010 Tách gói Kernel | ✅ | RV-07 (cửa thứ 2 export) | 🟡 |
| **v0.2.0 Module SDK** | 011 Module SDK | ✅ 95 % — còn K2 | RV-11 | 🟡 |
| | 012 Gói định khoản, workflow | ✅ | RV-11 | 🟡 |
| | 013 ui-kit, chuyển module | 🟡 | RV-16, RV-18 | ☐ |
| | 014 CLI, template, ca chuẩn | 🟡 52 % | — | ☐ |
| **v0.3.0 Kiểm chuẩn & bằng chứng** | 018 Giám sát vận hành | ✅ 20/24 | RV-09 | 🟡 |
| | 019 Bàn điều tra | ✅ | RV-09 | 🟡 |
| | 020 Kiểm chuẩn pháp lý VN | 🟡 14/24 | — | ☐ |
| | 021 Trạm tiền kiểm | 🟡 mã xong; S021-17, -21 còn | RV-10 | 🟡 |
| | 022 Giả định lỗi, Bàn đánh giá theo vai | 🟡 W0 | RV-06 | ☐ |
| **v0.4.0 Dữ liệu gốc & liên tục** | 023 Thẻ tài khoản | 🟡 W0 | RV-16 | ☐ |
| | 024 Item Master | 🟡 B2a / B2b | — | ☐ |
| | 025 Accounting Continuity | 🟡 W1 chỉ đọc | RV-17 | ☐ |
| | 026 Master Data Governance | 🟡 W0 | RV-16 | ☐ |
| **v0.5.0 Enterprise continuity & chính sách** | 027 Core kế toán cho dev | 🟡 W0 | RV-15 | ☐ |
| | 028 Core Authorization, Role Editor | 🟡 W1 | RV-11 | ☐ |
| | 029 Chứng từ gốc, truy vết | 🟡 W1 | **RV-02, RV-03**, RV-08, RV-13 | ☐ |
| | 030 Thư viện nghiệp vụ | 🟡 W0 | RV-05, RV-16, RV-18 | ☐ |
| | 031 Policy Registry | ✅ W0; W1 + W2a đã merge (README còn ghi "chưa") | RV-04, RV-10, RV-12, RV-15 | ☐ |
| **v1.0.0 Hệ sinh thái** | 015 Cell, WordPress | ☐ cần Hub | — | ☐ |
| | 016 Tải lớn, adapter | ☐ | — | ☐ |
| | 017 Beta hệ sinh thái | ☐ | — | ☐ |

Ký hiệu cột cuối: ✅ đóng được theo R1 · 🟡 đóng được khi việc nặng có người nhận · ☐ chưa · ⛔ chờ chủ / người ngoài nhóm.

## 4. Nhịp review

| Review | Sau phase | Ngày | Điểm | Kết luận | Phiên bản xét |
|---|---|---|---|---|---|
| R1 nền móng | 031 | 2026-11-08 | 27/48 | ĐẠT có điều kiện | v0.1.0 chưa đóng |
| R2 | 034 | — | — | — | v0.1.0, v0.2.0 |
| R3 | 037 | — | — | — | v0.3.0 |

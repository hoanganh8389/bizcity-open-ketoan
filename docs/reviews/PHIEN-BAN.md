# Phase → phiên bản Core: đóng gì, khi nào, nhật ký Kernel theo phiên bản
<!-- [2026-11-08 12:40 PM Johnny Chu - Chu Hoàng Anh] REVIEW — bản đồ 31 phase vào sáu phiên bản v0.1 → v1.0, điều kiện đóng từng phiên bản (cổng R-REL-4 + review ĐẠT + checklist), nhật ký Kernel K0–K3 theo phiên bản; trạng thái: ĐỀ XUẤT chờ chủ dự án duyệt nhóm phase -->

> **Trạng thái: Đề xuất** (nhóm phase vào phiên bản chờ chủ dự án duyệt; đánh số theo [standard/VERSIONING.md](../standard/VERSIONING.md), phát hành theo [RULE-RELEASE](../rules/RULE-RELEASE.md)).
> Hôm nay `package.json` gốc, `packages/kernel`, `packages/platform`, `packages/contracts` đều `0.1.0`; **chưa có tag phát hành nào**; toàn bộ thay đổi nằm trong `## [Chưa phát hành]` của `CHANGELOG.md`. Tệp này cho mọi người thấy **một phase đóng thì đi vào phiên bản nào**, và **phiên bản đóng cần gì**, để cộng đồng làm song song mà vẫn biết mình đang góp vào bản nào.

## 1. Vì sao gom phase thành phiên bản

Phase là gói việc (có checklist, có bằng chứng). Phiên bản là **lời hứa với người cài**: nâng lên bản này thì có gì, phải làm gì, Kernel đổi mức nào. 31 phase không thể là 31 bản phát hành; gom theo **năng lực hoàn chỉnh** mà người dùng cảm nhận được. Một phase mở sau vẫn có thể đóng trước (ví dụ 029 K3 đóng trước 013), nhưng **phiên bản chỉ đóng khi mọi phase trong nhóm đã đóng hoặc được chủ dự án hoãn (⏸) có chữ**.

## 2. Bản đồ

| Phiên bản | Tên | Phase | Người cài nhận được | Mức Kernel lớn nhất |
|---|---|---|---|---|
| **v0.1.0** | Nền móng | 001, 002, 003, 004, 005, 006, 007, 008, 009, 010 | Sổ cái chỉ thêm qua một cửa, chính sách có phiên bản, outbox, RLS, PITR, MCP đọc / ghi chờ duyệt, gói Kernel tách riêng | K3 (trigger sổ, cờ thoát — RV-R1-01 thêm chặt) |
| **v0.2.0** | Module SDK | 011, 012, 013, 014 | Viết module bằng SDK + manifest, gói định khoản, workflow YAML, ui-kit, CLI `bizcity`, template | K1 |
| **v0.3.0** | Kiểm chuẩn & bằng chứng | 018, 019, 020, 021, 022 | Giám sát, bàn điều tra, kiểm chuẩn pháp lý VN, trạm tiền kiểm đầu vào, giả định lỗi theo vai | K1 (RV-R1-06 `details` chuẩn) |
| **v0.4.0** | Dữ liệu gốc & liên tục | 023, 024, 025, 026 | Thẻ tài khoản, Item Master, liên tục kế toán (giá vốn, Gate C), quản trị dữ liệu gốc | K2 (lớp giá vốn) |
| **v0.5.0** | Enterprise continuity & chính sách | 027, 028, 029, 030, 031 | Core cho dev, phân quyền + Role Editor, chứng từ gốc có truy vết + SoD, thư viện nghiệp vụ, Policy Registry có evaluate | K3 (K3 đợt 1–2 của 029) |
| **v1.0.0** | Hệ sinh thái | 015, 016, 017 + mọi cổng R-REL-4 | Cell / WordPress adapter, tải lớn, beta cộng đồng; Standard `bizcity_standard@1` ổn định | — |

Phase mở sau 031 (032, 033, …) được gán phiên bản **khi mở** (dòng trong README phase) và xét lại ở review kế tiếp (RV-7).

## 3. Điều kiện đóng một phiên bản (áp cho mọi bản, ≤ 4 bước)

1. **Phase đóng.** Mọi phase trong nhóm: checklist chỉ còn ✅ hoặc ⏸ có chữ chủ dự án; README phase ghi ngày đóng; tiến độ lộ trình của việc trong phase = 100 % hoặc được chủ hoãn.
2. **Review ĐẠT.** Review theo nhịp gần nhất bao phủ nhóm phase đó kết luận **ĐẠT** hoặc **ĐẠT có điều kiện mà mọi phát hiện chặn trong nhóm đã xong** (xác nhận bằng bằng chứng, không bằng lời).
3. **Cổng phát hành R-REL-4.** CI xanh, diagnostics 0 error trên bản sao ẩn danh, thử nâng cấp, `npm audit`, hiệu năng, khoá migration — theo [ops/RELEASE.md](../ops/RELEASE.md) §2.
4. **Hồ sơ.** `CHANGELOG.md`: chuyển các mục của nhóm từ `[Chưa phát hành]` sang `[X.Y.Z] - YYYY-MM-DD`, đủ sáu mục, chia ba trục Standard / hợp đồng / Kernel (VER-5); `package.json` cùng số; tag ký; bảng ở §4 dưới cập nhật; [BANG-DIEM.md](BANG-DIEM.md) §3 đánh ✅.

## 4. Trạng thái đóng

| Phiên bản | Trạng thái | Việc chặn còn lại | Review xét |
|---|---|---|---|
| v0.1.0 | **chưa đóng** | RV-R1-01 (cờ thoát), RV-R1-02 (ánh xạ lỗi), RV-R1-03 (`main` đỏ), RV-R1-07 (hai cửa), RV-R1-14 (chủ chốt E2); PHASE-001 việc tay 0.2 / 0.6 / 0.7; PHASE-008 diễn tập máy chủ thật (⛔) | R1 → xét lại ở R2 |
| v0.2.0 | chưa đóng | PHASE-013 S013-3..8, S013-12; PHASE-014 lane runtime 4.3, ca chuẩn 4.5–4.7; RV-R1-11 | R2 |
| v0.3.0 | chưa đóng | PHASE-020 10/24; PHASE-021 S021-17, -21; PHASE-022 W1+; RV-R1-06, RV-R1-09, RV-R1-10 | R3 |
| v0.4.0 | chưa đóng | PHASE-023 / 026 W1+; PHASE-024 B2c+; PHASE-025 W2+ (giá vốn, Gate C); RV-R1-17 | — |
| v0.5.0 | chưa đóng | PHASE-027 CK; PHASE-028 W2–W5; PHASE-029 W2+, E1–E9; PHASE-030 W1+; PHASE-031 W2b–W3; RV-R1-04, 05, 08, 12, 13, 15 | — |
| v1.0.0 | chưa mở | PHASE-015 cần Hub; 016; 017 | — |

## 5. Nhật ký Kernel theo phiên bản (tóm tắt; chi tiết ở `CHANGELOG.md`)

Mỗi dòng: mức K lớn nhất, thay đổi định khoản có / không, nâng cấp cần làm tay. **Nguồn chi tiết vẫn là `CHANGELOG.md` gốc** (R-REL-2); bảng này chỉ gom theo phiên bản để người cài đọc một lần.

| Phiên bản | Kernel | Thay đổi định khoản | Nâng cấp cần làm | Ghi chú |
|---|---|---|---|---|
| v0.1.0 | K3: trigger sổ cái chỉ thêm (`0006`), khoá đầu bút toán (`0049`), `event_id` bắt buộc (`0077`), khoá kỳ ở CSDL (`0081`), `created_by` bắt buộc (`0080`); cổng Kernel `@bizcity/kernel` | không | chạy migration tới 0081; `DB_APP_USER=ketoan_app` (0.7); sau RV-R1-01: cấp vai trò bảo trì cho cờ purge | số migration 0080 trùng đang sửa (RV-R1-03) |
| v0.2.0 | K1: manifest module, `ctx.ledger.submit`, gói định khoản `vn-tt99-nen`, workflow YAML | không | cài gói định khoản cho đơn vị (có xem trước, không đụng sổ cũ) | |
| v0.3.0 | K1: trạm tiền kiểm L1–L5 (`intake_inbox` 0059), `policy_check` (0080-mới), remedy; chẩn đoán ban đêm | không | bật `bizcity.intake.policy_check` = advice (mặc định) | sau RV-R1-06: `details` chuẩn cho lỗi Kernel |
| v0.4.0 | K2: Item Master (`0065`/`0066`, `item_id` ở sổ / kho), lớp giá vốn (dự kiến) | **có** (giá vốn bình quân gia quyền tháng là mặc định, D025-2) — liệt kê khác biệt tình huống mẫu khi đóng | chạy Item Resolver; đối chiếu `item_id` | |
| v0.5.0 | K3: `policy_registry` (`0079`), SoD ở luồng ghi sổ, `authorize` trong workflow, lịch sử chứng từ, E1–E9 | tuỳ E-x; ghi khi đóng | đăng ký lại chính sách định khoản vào Registry nếu chốt RV-R1-12 | |
| v1.0.0 | — (ổn định Standard @1) | không | — | |

## Nhật ký tệp

- **2026-11-08** — khởi tạo (đề xuất) sau review R1; chờ chủ dự án duyệt nhóm phase và tên phiên bản.

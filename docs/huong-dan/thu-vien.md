# Thư viện dùng chung
<!-- [2026-11-07 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45 (ADR-0032): hướng dẫn thư viện dùng chung cho người dùng và dev -->

Thư viện là bộ **dữ liệu tham chiếu có sẵn trong open-ketoan**, giống nhau ở mọi đơn vị: tham số pháp lý theo ngày (lương cơ sở, lương tối thiểu vùng, tỷ lệ bảo hiểm, biểu thuế TNCN…), ngày nghỉ lễ, Tết… Đơn vị không sửa thư viện. Giá trị riêng của đơn vị (ví dụ giờ làm việc một ngày) đặt ở **Cấu hình hệ thống** và ghi đè thư viện.

## Có những thư viện nào

| Thư viện | Dùng cho | Trạng thái |
|---|---|---|
| [`vn.tham-so-phap-ly`](../../libraries/vn.tham-so-phap-ly/README.md) | 120 tham số pháp lý, 9 nhóm, mỗi giá trị có ngày hiệu lực và căn cứ | chưa duyệt |
| [`vn.ngay-nghi-le`](../../libraries/vn.ngay-nghi-le/README.md) | ngày nghỉ lễ, Tết để đếm ngày làm việc | chưa đủ, chưa duyệt |

## Khi ô nhập báo mã `LIB-…`

| Mã | Nghĩa | Làm gì |
|---|---|---|
| `LIB-UNKNOWN-001` | mã không có trong thư viện | chọn một gợi ý gần nhất, hoặc chọn từ ô chọn |
| `LIB-DEPRECATED-001` | mã đã ngừng dùng | đổi sang mã thay thế trong gợi ý |
| `LIB-REMOVED-001` | mã đã bỏ | chọn mã thay thế |
| `LIB-EFFECTIVE-001` | không có giá trị tại ngày chứng từ | kiểm lại ngày; báo người giữ thư viện nếu văn bản mới chưa cập nhật |
| `LIB-SCHEMA-001` | dữ liệu sai khuôn | sửa trường được chỉ ra |
| `LIB-VALUE-001` | giá trị khác thư viện tại ngày | dùng giá trị gợi ý; nếu đúng là văn bản mới, ghi căn cứ |
| `LIB-UNVERIFIED-001` | mục chưa được duyệt | đối chiếu văn bản trước khi dùng để tính tiền |

Đầy đủ (kèm mã luật riêng của từng thư viện): [Tra mã phát hiện](ma-loi/README.md), mục Cổng L.

## Cho dev

- API: [docs/api/16-thu-vien.md](../api/16-thu-vien.md). Hợp đồng: [BIZCITY-LIBRARY-v1](../contracts/BIZCITY-LIBRARY-v1.md).
- Thêm thư viện: thư mục `libraries/<miền>.<tên>/` với `library.json`, `README.md`, nếu sinh từ nguồn thì `sources/` + `build.mjs` (mẫu: `libraries/vn.ngay-nghi-le/build.mjs`). Phần dùng chung: `scripts/thu-vien/thu-vien.mjs` (băm, đóng dấu phiên bản).
- Lệnh cho dev <!-- [2026-11-08 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-50 -->: `npx bizcity library list` (có gì), `library search "<từ khoá>" --at <ngày>` (lấy mã đúng, xem giá trị tại ngày), `library check <id> <giá trị>` (kiểm ô bằng bộ kiểm của Core; PASS 0 · FAIL 1 · SKIP 2 · WARN 3), `library new <id> --kind … --title … --source …` (khung thư viện mới), `library diff <id>` (bản cần lên so với main). AI agent: skill [use-bizcity-library](../../skills/use-bizcity-library/SKILL.md).
- Kiểm: `node tests/conformance/selfcheck.mjs --only SC-LIB-1` — khuôn, mã không mất, băm + phiên bản, sinh lại khớp, luật khai báo.
- Không xoá mục: đổi `status` sang `deprecated` (kèm `replacedBy`) rồi `removed`. Không sửa tay `library.json` sinh từ nguồn.

# ADR-0024 · Phân hệ nghiệp vụ nằm ở `modules/<key>/`; `phan-he/` đóng băng và chuyển theo đợt
<!-- [2026-11-03 11:45 PM Johnny Chu - Chu Hoàng Anh] ADR-0024 — phân hệ nghiệp vụ nằm ở modules/<key>/; phan-he/ đóng băng, chuyển theo đợt (chỉ đạo của chủ dự án) -->

- Trạng thái: **Chấp nhận** — yêu cầu kiến trúc của chủ dự án Johnny Chu – Chu Hoàng Anh, 2026-11-03: *"thư mục `phan-he/` cần chuyển sang `modules/` và khuyến nghị rõ cho Thủy và anh em dev, cộng đồng developer: đây là yêu cầu kiến trúc từ Johnny Chu"*.
- Ngày: 2026-11-03 · Người quyết: Johnny Chu – Chu Hoàng Anh · Mức: **K0** (nguyên tắc + chỉ đạo cho người đóng góp); việc chuyển từng phân hệ là K1–K3 theo từng đợt, mỗi đợt có chữ chốt riêng (R-FLOW-2).
- Luật / hợp đồng liên quan: [R-BOUND](../rules/RULE-MODULE-BOUNDARY.md), [R-FLOW](../rules/RULE-FLOW.md), [bizcity_module@1](../contracts/BIZCITY-MODULE-v1.md), [PHASE-013](../phases/PHASE-013-UI-KIT-CHUYEN-MODULE/README.md) (việc 3.9), [PHASE-014](../phases/PHASE-014-CLI-TEMPLATE-CA-CHUAN/README.md).
- Hướng dẫn thi hành cho người đóng góp: [docs/standard/CHUYEN-PHAN-HE-SANG-MODULES.md](../standard/CHUYEN-PHAN-HE-SANG-MODULES.md).

## Bối cảnh

Repo đang có **hai chỗ đặt mã phân hệ** và tài liệu chỉ dẫn lẫn lộn giữa chúng:

| | `apps/*/src/phan-he/<key>/` (cũ) | `modules/<key>/` (chuẩn đích) |
|---|---|---|
| Là gì | thư mục nằm **trong** ứng dụng, đăng ký tay ở `API_MODULES` / `WEB_MODULES` | module độc lập: `bizcity.module.json`, `api/`, `web/`, `migrations/`; API và web tự nạp |
| Ràng buộc | import được nội bộ ứng dụng (`db/client`, `kysely`, `@bizcity/platform/*`) | chỉ `@bizcity/module-sdk`, `@bizcity/ui-kit`, `zod`, `react` (SC-MOD-1, chế độ module); dữ liệu trong schema `mod_<key>`, quyền `<key>:*`, đường dẫn `/api/v1/m/<key>/…` |
| Ai tạo | người đóng góp, theo `docs/framework/03-MO-RONG.md` | `npx bizcity module new`, theo `templates/starter-module` và `AGENTS.md` |

Hiện trạng đo ngày 2026-11-03 (`main` `be700e4`):

| Phân hệ | API (tệp / dòng) | Vi phạm chuẩn module (API) | Web (tệp / dòng) |
|---|---|---|---|
| mua-hang | 22 / 5 383 | **106** | 68 / 10 852 |
| ke-toan | 16 / 3 825 | 70 | 39 / 6 962 |
| thue | 8 / 1 278 | 44 | 13 / 1 875 |
| quy | 2 / 323 | 11 | 5 / 349 |
| ban-hang | 2 / 86 | 12 | 9 / 720 |
| kho | 2 / 95 | 9 | 9 / 1 141 |
| tai-san | 1 / 9 | 4 | 8 / 1 613 |
| api · he-thong · danh-muc · dev | 1 · 1 · 0 · 0 | 1 · 1 · — · — | 6 · 2 · 1 · 14 |

Hệ quả của việc không chốt:

1. Người đóng góp (và trợ lý AI của họ) làm theo `docs/framework/03-MO-RONG.md` và vài dòng của `AGENTS.md` rồi **thêm mã mới vào `phan-he/`** — chỗ đáng lẽ sẽ phải chuyển đi.
2. Tiêu chí lộ trình 3.9 ("`phan-he/*` → `modules/*`") đang **đạt bằng phép kiểm** (SC-MOD-1/2, không import chéo, không ghi bảng lõi) trong khi thư mục chưa chuyển: `modules/` mới có `mua-hang/domain` (gói mã thuần).
3. Cộng đồng không thể viết một module độc lập theo cùng cách với phân hệ chính thức, trái mục tiêu Phase 5.

## Quyết định

1. **Chỗ của mã.** Mọi phân hệ nghiệp vụ và add-in **mới** nằm ở `modules/<key>/` (API, web, migration, manifest), theo `templates/starter-module`, tạo bằng `npx bizcity module new <key> --label "Tên"`. **Không tạo thư mục phân hệ mới dưới `apps/api/src/phan-he/` hoặc `apps/web/src/phan-he/`.**
2. **`phan-he/` đóng băng.** Phân hệ đang có ở đó vẫn chạy và được sửa lỗi, mở rộng vừa phải cho tới **đợt chuyển của chính nó**; nhưng một chức năng **mới và độc lập** làm thành module mới ở `modules/`, không nhét thêm vào phân hệ cũ. Phần mới viết trong phân hệ cũ nên **"sạch SDK"** (xem hướng dẫn) để chuyển rẻ.
3. **"Chuyển" là chuyển chuẩn, không phải đổi tên thư mục.** Một phân hệ coi là đã chuyển khi: nằm ở `modules/<key>/` có `bizcity.module.json`; `selfcheck --module modules/<key>` ĐẠT; ghi qua `defineAction`; dữ liệu riêng ở schema `mod_<key>`; bảng/đường dẫn cũ giữ tương thích theo kế hoạch của đợt; thư mục cũ trong `phan-he/` được xoá. Đổi tên thư mục mà không đạt các điều này là vô nghĩa (hiện 106 vi phạm ở `mua-hang`).
4. **Phân loại.**
   - *Phân hệ nghiệp vụ* → `modules/`: `ke-toan`, `quy`, `mua-hang`, `ban-hang`, `kho`, `tai-san`, `thue`.
   - *Giao diện quản trị của chính Core* (không phải module cắm): `he-thong` (đơn vị, người dùng, phân quyền, khoá API, kết nối, cài đặt), `api` (thử API, khoá API), `danh-muc`, `dev` (Bàn điều tra). Các mục này **ở lại ứng dụng**; việc đổi tên / dời khỏi thư mục `phan-he/` (để tên không gợi ý "cắm được") làm ở đợt cuối — xem câu hỏi mở Q1.
   - Mã miền của một phân hệ đang nằm ngoài `phan-he/` (ví dụ `apps/api/src/modules/assets` cho `tai-san`) **chuyển cùng đợt** với phân hệ đó. Phân định "lõi hay của phân hệ" cho từng thư mục `apps/api/src/modules/*` là **bước 0** của mỗi đợt, ghi trong chữ chốt của đợt.
5. **Thứ tự đợt (đề xuất, chủ dự án đổi được):** mỏng và ít rủi ro trước, nặng và đang phát triển tích cực sau cùng.

   | Đợt | Phân hệ | Lý do |
   |---|---|---|
   | 1 | `quy` | nhỏ nhưng đã có 11 `defineAction`: thử đường chuyển đầu tiên |
   | 2 | `tai-san`, `kho`, `ban-hang` | API mỏng, chủ yếu web; mã miền nằm ở `apps/api/src/modules/*` cần phân định |
   | 3 | `thue` | vừa; đã có 10 action |
   | 4 | `ke-toan` | lớn, nhiều báo cáo đọc sổ qua `ledger.query` |
   | 5 | `mua-hang` | lớn nhất, **đang phát triển tích cực** bởi người đóng góp: chuyển sau cùng, cùng người đang giữ phân hệ để tránh xung đột; bộ nạp 25 trường hợp là bài kiểm đúng-sai trước và sau |
   | 6 | giao diện lõi (`he-thong`, `api`, `danh-muc`, `dev`) | quyết theo Q1 |

6. **Quy trình mỗi đợt.** Theo [R-FLOW](../rules/RULE-FLOW.md): dòng giữ chỗ vào `docs/phases/CLAIMS.md` trên `main` trước; một PR tài liệu **chốt đợt** (phạm vi, phân định lõi / phân hệ, kế hoạch tương thích đường dẫn và dữ liệu, cách kiểm trước / sau); rồi nhánh code ngắn. PR cuối xoá thư mục cũ, cập nhật `API_MODULES` / `WEB_MODULES` và nhật ký checklist [PHASE-013](../phases/PHASE-013-UI-KIT-CHUYEN-MODULE/40-MASTER-CHECKLIST.md). Phân hệ có dữ liệu sản xuất phải nêu cách chuyển dữ liệu **không mất, không sao chép rồi xoá** (ví dụ chuyển bảng sang schema `mod_<key>`), thuộc mức K2 trở lên khi chạm bảng có sổ.
7. **Thi hành bằng phép kiểm (đề xuất, cần chữ chốt riêng vì là phép kiểm mức chặn — [RULE-QUALITY-GATE](../rules/RULE-QUALITY-GATE.md), R-FLOW §3):** (a) SC-MOD-4 — **không thêm tệp mới** vào `apps/*/src/phan-he/` (ratchet, baseline = số tệp hôm nay, chỉ giảm); (b) tiêu chí lộ trình 3.9 đo bằng số tệp còn lại ở `phan-he/`, không chỉ bằng SC-MOD-1/2.

## Hệ quả

- **Được:** một chỗ đặt duy nhất cho mọi phân hệ, cộng đồng viết module cùng cách với phân hệ chính thức; ranh giới được CSDL thực thi (vai trò `mod_<key>_rw`) thay vì chỉ quy ước; mỗi phân hệ bật/tắt, kiểm và phát hành độc lập.
- **Mất:** mỗi đợt là một lượt viết lại có kiểm (phân hệ lớn mất nhiều tuần); trong thời gian chuyển, hai kiểu cùng tồn tại; cần tương thích đường dẫn (`/api/v1/purchase/…` → `/api/v1/m/mua-hang/…`) và dữ liệu.
- **Việc phải làm:** (1) sửa `AGENTS.md`, `CONTRIBUTING.md`, `docs/framework/03-MO-RONG.md`, CANON §5 cho khớp quyết định này — **làm cùng PR với ADR này**; (2) mở các dòng việc đợt 1 đến 6 ở checklist PHASE-013; (3) chữ chốt SC-MOD-4; (4) mỗi đợt: giữ chỗ → chữ chốt đợt → code.
- **Không đổi:** bốn câu không thương lượng, [ADR-0020](ADR-0020-ton-chi-core-nguoi-dung-quyet-dinh-mot-ngon-ngu-ma.md) (quyền, không chức danh), danh mục có phiên bản. Chuyển phân hệ không được làm yếu bất kỳ điều nào trong số đó.

## Câu hỏi mở (chủ dự án quyết)

- **Q1.** Bốn mục giao diện lõi (`he-thong`, `api`, `danh-muc`, `dev`): đề xuất giữ ở `apps/web` và đổi tên thư mục chứa chúng (ví dụ `apps/web/src/loi/`) ở đợt 6, để `phan-he/` chỉ còn nghĩa "phân hệ cắm được" cho tới khi xoá hẳn. Đồng ý, hay đặt chỗ khác?
- **Q2.** Thứ tự đợt ở Quyết định 5: giữ hay đổi (ví dụ chuyển `mua-hang` sớm hơn vì người đóng góp đang cần)?
- **Q3.** Tương thích đường dẫn cũ (`/api/v1/purchase/…`) sau khi chuyển: giữ bao lâu, dùng cơ chế nào (chuyển tiếp ở tầng route, hay đổi một lần kèm thông báo cho hệ thống nguồn)? Mỗi đợt nêu lựa chọn trong chữ chốt, nhưng cần nguyên tắc chung.
- **Q4.** SC-MOD-4 ở mức ratchet từ ngày ADR vào `main`, hay chờ hết đợt 1?

## Phương án đã cân nhắc

- **Đổi tên thư mục hàng loạt trong một PR (big-bang).** Bị loại: không đạt chuẩn module (106 vi phạm ở `mua-hang`), vi phạm R-FLOW-4 (nhánh ngắn), rủi ro cao với phân hệ đang phát triển.
- **Giữ `phan-he/` vĩnh viễn, chỉ sửa tài liệu.** Bị loại: cộng đồng không thể viết module độc lập; ranh giới chỉ nhờ quy ước, mâu thuẫn mục tiêu Phase 5 (module do người ngoài nhóm viết chỉ bằng SDK).
- **Cho phép thêm mã mới vào `phan-he/` "tạm thời" tới khi chuyển.** Bị loại: đó chính là cách nợ hôm nay đã tích lại; quyết định 1 và 2 chặn ở nguồn.
- **Chuyển theo thứ tự lớn trước (để người chuyển gánh phần khó).** Bị loại: chưa có đường chuyển đã được kiểm; thử trên phân hệ nhỏ rồi mới đến phân hệ nặng.

## Quyết định của chủ dự án (2026-11-04)
<!-- [2026-11-04 12:15 AM Johnny Chu - Chu Hoàng Anh] ADR-0024 — ghi quyết định chủ dự án 2026-11-04 -->

Chủ dự án trả lời **"đồng ý"** cho bản đề xuất ở trên. Ghi nhận: Q1 (giao diện lõi ở lại `apps/web`, đổi tên thư mục ở đợt 6) và Q2 (giữ thứ tự đợt) theo đề xuất. Q3 (tương thích đường dẫn cũ) và Q4 (SC-MOD-4 ratchet) được hiểu là nhận mặc định đề xuất; **chờ chủ dự án xác nhận lại** ở chữ chốt [đợt 1](../phases/PHASE-013-UI-KIT-CHUYEN-MODULE/10-DOT-1-QUY.md) §3 và PR chốt SC-MOD-4 riêng (RULE-FLOW §3). Đợt 1 giữ chỗ ở CLAIMS.md.

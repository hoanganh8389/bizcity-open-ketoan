# 01 · Chín trụ cột (0–VIII), đi theo một chứng từ
<!-- [2026-11-04 12:25 AM Johnny Chu - Chu Hoàng Anh] PHASE-027 — CK-1 (D027-1): giải thích khung trụ cột 0–VIII bằng một chứng từ bán hàng đi hết vòng đời; ai không được làm gì -->

> Khung trụ cột duy nhất của Core là **0–VIII** (quyết định D027-1). Nguồn số liệu: [docs/standard/tru-cot.json](../standard/tru-cot.json) (tiêu chí, trạng thái, bằng chứng từng trụ), bảng ở [PHASE-026](../phases/PHASE-026-MASTER-DATA-GOVERNANCE/10-DANH-GIA-ADAPT.md), vai trò "giúp ai việc gì" ở [PHASE-027 §4](../phases/PHASE-027-CORE-KE-TOAN-CHO-DEV/00-MASTER-PLAN.md). Tài liệu này giải thích **bằng ví dụ** để người mới hiểu mỗi trụ cột nằm ở đâu trong một ngày làm việc. Trạng thái từng tiêu chí đọc ở `tru-cot.json`, không chép sang đây.

## Một dòng mỗi trụ

| | Trụ cột | Câu hỏi nó giữ |
|---|---|---|
| 0 | **Quản trị dữ liệu gốc** (nền móng) | Hàng này, khách này, chi nhánh này là ai, mã gì, thuộc nhóm hạch toán nào, tại ngày đó? Ai được tạo, đổi, gộp? |
| I | **Sổ cái bất biến** | Sổ có chỉ thêm, Nợ = Có, sai thì đảo rồi ghi lại không? |
| II | **Định danh bất biến, mã có phiên bản** | Đổi mã hàng có làm đứt lịch sử không? |
| III | **Liên tục kế toán** | Chuỗi mua → kho → bán → giá vốn → lãi lỗ có liền qua các kỳ không, số này đến từ đâu? |
| IV | **Một cửa nạp, các cổng kiểm chuẩn, một ngôn ngữ mã** | Sự việc gửi vào có đúng khuôn không; bị chặn thì nằm ở đâu, mã gì, ai sửa? |
| V | **Chính sách, chế độ kế toán có phiên bản** | Ghi Nợ / Có tài khoản nào, giá vốn theo phương pháp nào, theo chế độ nào (TT99/2025)? |
| VI | **Bằng chứng, quan sát được** | Mỗi bút toán có biên nhận, `requestId`, truy được về chứng từ không? |
| VII | **Cô lập đơn vị, phân quyền** | Đơn vị này có đọc được dữ liệu đơn vị khác không; ai được lập, ai được duyệt? |
| VIII | **Mở rộng bằng module, kiểm chuẩn tự động** | Module mới có chạm sổ, tự chọn tài khoản, tự tính giá vốn không? |

Tất cả nằm trong **một Kernel và một cơ sở dữ liệu PostgreSQL**, không phải chín dịch vụ. Ranh giới giữa các trụ do bộ kiểm chuẩn giữ (ví dụ ngoài Kernel chỉ được đọc sổ qua `bizcity_read.*`).

## Đi theo một chứng từ: bán 1 hộp sữa

Cửa hàng bán 1 hộp sữa mã `110054057`, giá 100.000 đồng chưa thuế.

| Bước | Chuyện gì xảy ra | Trụ cột | Công cụ bạn chạy |
|---|---|---|---|
| 1 | POS lập chứng từ `sale`: `docKey` ổn định, dòng hàng, tổng tiền, hình thức thanh toán. **Không** có số tài khoản, không có giá vốn | IV | `event check don-ban.json` |
| 2 | Cửa nạp tra mã hàng ra mặt hàng (`item_id`) theo mã có hiệu lực tại ngày chứng từ, tra nhóm hạch toán của nó. Mã lạ: hôm nay cửa nạp còn tự thêm mặt hàng mới và báo gợi ý `IN-MD-004`; về sau sẽ chặn vào bể chờ | 0, II | `explain IN-MD-004` |
| 3 | Luật định khoản chọn Nợ / Có theo gói định khoản của đơn vị (TT99/2025) và nhóm hạch toán. App không chọn | V | `event check` lớp L5 in bút toán thử |
| 4 | Kernel ghi sổ trong một giao dịch: Nợ = Có, kỳ chưa khoá, dòng sổ mang `item_id` và ảnh chụp mã tại ngày hạch toán, có biên nhận bằng chứng | I, VI | Biên nhận `meta.receipt` |
| 5 | Sai khuôn, sai tổng, mã chi nhánh lạ, kỳ đã khoá: chứng từ **không** vào sổ. Nó nằm ở **bể chờ** kèm mã, người sửa, bước sửa. App hiện mã cho người dùng, sửa ở nguồn rồi gửi lại cùng `docKey` | IV | `explain <MÃ>` |
| 6 | Khoá API chỉ ghi được vào sổ của đúng đơn vị đã cấp khoá | VII | Màn Khoá API (HT02) |
| 7 | Cuối tháng kế toán bấm **Tính giá vốn** (ACC49): giá vốn bình quân gia quyền theo tháng ghi Nợ 6321 / Có 1561 (theo kịch bản của test `apps/api/test/costing.test.ts`) | V, I | Màn Tính giá vốn |
| 8 | Bạn hỏi: mặt hàng này có liền mạch từ nhập đến lãi lỗ không? Tồn có âm không? Sổ kho có khớp sổ cái không? | III | `flow check --sku … --period … --to …` |
| 9 | Kế toán kiểm bảng trước khoá kỳ, kết chuyển lãi lỗ, khoá kỳ. Còn lỗi toàn vẹn thì không khoá được, trừ khi kế toán trưởng ghi lý do chấp nhận | III, I | Bảng kiểm khoá kỳ |
| 10 | Khách trả hàng: chứng từ `sale_return` có `originalDocKey` trỏ phiếu bán gốc | IV, III | Bảng kiểm khoá kỳ bắt phiếu trả mồ côi |

Ví dụ tài khoản chỉ để minh hoạ. Tài khoản thật do gói định khoản và nhóm hạch toán của **đơn vị** quyết.

## Mỗi trụ cột: dùng khi nào, đừng làm gì

### 0 · Quản trị dữ liệu gốc
- **Dùng khi:** tạo mặt hàng, khách, chi nhánh; đổi nhóm hạch toán; đặt mã; nối POS với danh mục.
- **Đừng:** tạo mã ngầm từ app, suy tài khoản từ đuôi mã, dùng lại mã cũ cho hàng khác.
- **Hôm nay:** quy tắc mã hàng ([03](03-ma-hang-va-vong-doi.md)), Quy định dữ liệu hàng hoá (HT09), trạng thái nháp / đang dùng / ngừng, `IN-ITEM-009` nối nháp với bể chờ. Khuôn có phiên bản cho khách, chi nhánh, kho còn ở PHASE-026.

### I · Sổ cái bất biến
- **Dùng khi:** luôn, mọi thứ vào sổ đều qua đây.
- **Đừng:** `UPDATE` / `DELETE` bảng sổ, tắt trigger, đổi ngày chứng từ sang tháng khác để né khoá kỳ.
- **Hôm nay:** trigger chỉ thêm, đảo bút toán khi gửi `version + 1`. `npx bizcity ledger verify` kiểm toàn vẹn (cần CSDL).

### II · Định danh bất biến, mã có phiên bản
- **Dùng khi:** đặt mã cho mặt hàng, nối mã của POS với mã của sổ.
- **Đừng:** đổi mã hàng đã có sổ, gộp mã bằng tay.
- **Hôm nay:** mặt hàng có `item_id` bất biến; mã có phiên bản và ngày hiệu lực; dòng sổ cái, sổ kho, giá vốn tháng mang `item_id` (migration 0066); giá vốn, nhập xuất tồn, sổ chi tiết hàng hoá gom theo `item_id` (PHASE-024 G2). Chưa có: API danh mục trả `itemId`, khuôn nạp nhận `itemId`, thao tác đổi mã / gộp mã (`core.item.add-code`, `merge`). Vì vậy hôm nay vẫn giữ **một mã gửi sang sổ, suốt đời**.

### III · Liên tục kế toán
- **Dùng khi:** hỏi "số này đến từ đâu" và "chuỗi có đứt không".
- **Đừng:** gửi phiếu điều chỉnh kho để làm khớp số. Sửa ở nguồn.
- **Hôm nay:** `flow check --to` (tồn chuyển kỳ), đối chiếu sổ kho với sổ cái (`GET /api/v1/inventory/reconcile` + mã tự chẩn đoán `INVENTORY_LEDGER_MISMATCH`, mức cảnh báo), bảng kiểm khoá kỳ (phiếu trả không nối phiếu gốc). Chưa có: truy vết giá vốn về phiếu nhập.

### IV · Một cửa nạp, các cổng kiểm chuẩn, một ngôn ngữ mã
- **Dùng khi:** viết bất cứ thứ gì gửi tiền vào sổ; khi app bị từ chối chứng từ.
- **Đừng:** gửi số tài khoản, thuế suất tự nghĩ, giá vốn tự tính; gửi một nghiệp vụ từ hai hệ thống; nuốt lỗi; thử lại lỗi `retryable: false`.
- **Hôm nay:** 10 loại chứng từ, tiền kiểm L1–L5, bể chờ, mỗi mã có bước sửa ([R-GATE](../rules/RULE-GATE.md), [R-INTAKE](../rules/RULE-INTAKE.md)). Sản xuất là cổng chờ.

### V · Chính sách, chế độ kế toán có phiên bản
- **Dùng khi:** cấu hình chính sách, gói định khoản, lý do; tính giá vốn.
- **Đừng:** viết số tài khoản hay công thức giá vốn trong app. Phương pháp giá vốn là chính sách kế toán của đơn vị, không phải tham số của app.
- **Hôm nay:** định khoản theo gói; giá vốn **bình quân gia quyền theo tháng** là mặc định cho mọi đơn vị. FIFO là tuỳ chọn, làm sau đổi mã an toàn (PHASE-024 B5, B7).

### VI · Bằng chứng, quan sát được
- **Dùng khi:** cần chứng minh một bút toán đến từ chứng từ nào, ai gửi, lúc nào.
- **Đừng:** vứt `requestId`, biên nhận; ghi log ra tệp riêng thay cho bằng chứng của Core.
- **Hôm nay:** biên nhận `meta.receipt`, `requestId`, bộ kiểm chuẩn (`selfcheck`, lane `diagnostics`).

### VII · Cô lập đơn vị, phân quyền
- **Dùng khi:** cấp khoá API, phân quyền người dùng.
- **Đừng:** dùng một khoá cho nhiều đơn vị, đọc chéo dữ liệu.
- **Hôm nay:** khoá API theo đơn vị và phạm vi, RLS trên bảng của đơn vị.

### VIII · Mở rộng bằng module, kiểm chuẩn tự động
- **Dùng khi:** thêm tính năng bằng module trong `modules/<key>/`.
- **Đừng:** ghi bảng `ledger_*` / `inventory_*`, viết số tài khoản, tự điền giá vốn trong module.
- **Hôm nay:** `module new`, `module check`, `module accounting-check` ([02](02-cong-cu-kiem.md)).

## Kế toán và CEO đọc gì ở đây

- **Kế toán trưởng:** bạn sở hữu V (chính sách, lý do, nhóm hạch toán) và 0 (duyệt danh mục), và là người quyết khi bộ kiểm báo cảnh báo. Mỗi mã phát hiện có phần "việc của kế toán trưởng": `npx bizcity explain <MÃ> --role chief_accountant`.
- **CEO:** đọc trạng thái từng trụ ở [PHASE-026](../phases/PHASE-026-MASTER-DATA-GOVERNANCE/10-DANH-GIA-ADAPT.md). Cái gì chưa có thì đừng hứa với khách (FIFO, đổi mã không đứt lịch sử, sản xuất). Cái gì đã có thì có lệnh kiểm chứng.

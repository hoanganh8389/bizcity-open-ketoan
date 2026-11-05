# Core kế toán: bắt đầu từ đâu
<!-- [2026-11-03 08:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — L5 định khoản thử đã nằm trong tiền kiểm (W5 merge) -->
<!-- [2026-11-03 07:23 PM Johnny Chu - Chu Hoàng Anh] ADR-0020 — bộ hướng dẫn Core: bản đồ đọc theo vai, bảng tra "muốn làm gì thì chạy gì", thuật ngữ -->
<!-- [2026-11-04 12:25 AM Johnny Chu - Chu Hoàng Anh] PHASE-027 — CK-1: khung trụ cột 0–VIII (D027-1); trạng thái item_id theo main (0066) -->

> Bộ hướng dẫn này nối **chín trụ cột 0–VIII**, **công cụ kiểm**, **bộ kiểm chuẩn**, **mã hàng và vòng đời mặt hàng**, và **skill cho AI**. Mỗi thứ đã có tài liệu riêng ở nơi khác. Bộ này chỉ trả lời: *tôi là ai, tôi muốn làm gì, thì đọc và chạy gì*.

## Core là gì, một đoạn

open-ketoan là **lõi sổ cái**. App của bạn (POS, bán hàng online, CRM, kho, tài sản…) chỉ **kể sự việc kinh tế đã xảy ra**: bán một hộp sữa, nhập hàng, thu tiền. Core quyết định ghi Nợ / Có tài khoản nào, tính giá vốn thế nào, khoá kỳ khi nào. Sổ chỉ thêm, sửa là đảo rồi ghi lại, mỗi dòng sổ truy được về một chứng từ có phiên bản.

## Đọc theo vai

| Bạn là | Đọc theo thứ tự | Bạn làm gì |
|---|---|---|
| **Kế toán, kế toán trưởng** | [01 Trụ cột 0–VIII](01-tru-cot.md) (đọc phần "đi theo một chứng từ") → [03 Mã hàng, vòng đời](03-ma-hang-va-vong-doi.md) → [Bắt đầu sử dụng](../huong-dan/00-bat-dau.md) | Chọn chính sách, tính giá vốn, kết chuyển, khoá kỳ; đọc phát hiện theo vai (`explain --role chief_accountant`) |
| **CEO, chủ đơn vị** | [01 Trụ cột 0–VIII](01-tru-cot.md) (mỗi trụ có mục "Hôm nay"; bảng đầy đủ ở [PHASE-026](../phases/PHASE-026-MASTER-DATA-GOVERNANCE/10-DANH-GIA-ADAPT.md)) → [05 Tiết kiệm được gì](05-tiet-kiem-thoi-gian-va-token.md) → mục "Trạng thái thật" bên dưới | Biết cái gì chắc, cái gì chưa, để hỏi đúng người |
| **Dev viết app / plugin bên ngoài** (POS, CRM, WordPress…) | [05 Tiết kiệm được gì](05-tiet-kiem-thoi-gian-va-token.md) → [01](01-tru-cot.md) → [02 Công cụ kiểm](02-cong-cu-kiem.md) → [Hợp đồng nạp chứng từ](../contracts/BIZCITY-LEDGER-INTAKE-v1.md) → [pos-mini](../../examples/pos-mini/README.md) | Gửi chứng từ đúng khuôn; chạy `event check`, `flow check` |
| **Dev viết module trong repo** | [01](01-tru-cot.md) → [02](02-cong-cu-kiem.md) → [03](03-ma-hang-va-vong-doi.md) → [AGENTS.md](../../AGENTS.md) → [Hợp đồng module](../contracts/BIZCITY-MODULE-v1.md) | `module new`, `module check`, `module accounting-check` |
| **Cộng đồng đóng góp vào lõi** | [tru-cot.json](../standard/tru-cot.json) → [PHASE-027](../phases/PHASE-027-CORE-KE-TOAN-CHO-DEV/00-MASTER-PLAN.md) → [PHASE-024](../phases/PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/70-LO-TRINH-ON-DINH-CORE.md) → [Bộ kiểm chuẩn](../standard/CONFORMANCE.md) | Đổi mã / gộp mã, FIFO, cổng sản xuất: ADR trước, mã sau |
| **AI agent** (Claude Code, Codex, Cursor…) | [04 Hướng dẫn cho AI](04-huong-dan-cho-ai.md) → [skills/README.md](../../skills/README.md) | Đọc hợp đồng, sinh mã tích hợp, chạy lệnh kiểm, báo thật |

## Tôi muốn… thì chạy gì

Chưa `npm install` thì thay `npx bizcity` bằng `node packages/cli/bin/bizcity.mjs`.

| Tôi muốn | Chạy | Cần gì |
|---|---|---|
| Biết một chứng từ có vào sổ được không, và bút toán sẽ ra sao | `npx bizcity event check <tệp.json>` | Máy chủ + khoá API để thấy bút toán; không có thì chỉ kiểm khuôn và tổng tiền |
| Hiểu một mã lỗi / mã phát hiện | `npx bizcity explain <MÃ> [--role chief_accountant]` | Không cần máy chủ |
| Biết một mặt hàng có liền mạch từ mua đến lãi lỗ | `npx bizcity flow check --sku <mã> --period YYYY-MM [--to YYYY-MM]` | Máy chủ + khoá đọc báo cáo |
| Biết sổ kho có khớp sổ cái | `GET /api/v1/inventory/reconcile?period=YYYY-MM`, hoặc dòng C1.5 của `flow check` | Máy chủ + khoá đọc báo cáo |
| Tạo module mới | `npx bizcity module new <key> --label "Tên" --code XX` | Repo này |
| Kiểm module trước khi cài | `npx bizcity module check <key>` (gồm kiểm kế toán tĩnh) | Cần `npm ci` và CSDL test cho phần typecheck, test hợp đồng |
| Kiểm riêng phần kế toán của module | `npx bizcity module accounting-check <key>` | Không cần CSDL (mục chứng từ mẫu cần máy chủ) |
| Kiểm cả repo | `node tests/conformance/selfcheck.mjs --lane selfcheck` | Không cần cài gì |
| Kiểm sổ có toàn vẹn | `npx bizcity ledger verify` | CSDL |
| Xem Core đã làm sẵn gì (số đếm) | `node scripts/do-bang-chung-core.mjs` | Không cần cài gì |
| Ước tính tiết kiệm giờ và token cho dự án của tôi | `node scripts/uoc-tinh-tiet-kiem.mjs --sensitivity` (số mặc định là **giả định**) | Không cần cài gì |
| Cài skill cho AI vào dự án | `npx bizcity skills install --to <thư mục>` | — |
| **Định danh xuyên suốt, đổi mã, gộp mã, nối hệ ngoài** | Xem [06 Xương cá](06-xuong-ca-dinh-danh.md) (tài liệu sống của đợt) | |
| **Đổi mã một mặt hàng đã có sổ** | **Chưa có thao tác đổi mã** (sổ và giá vốn đã theo `item_id`, API chưa). Giữ một mã suốt đời, xem [03](03-ma-hang-va-vong-doi.md) | — |
| **Tính giá vốn FIFO** | **Chưa có.** Mặc định cho mọi đơn vị: bình quân gia quyền theo tháng | — |
| **Ghi sản xuất (MRP)** | **Cổng chờ**, Kernel chưa mở. Xem [skill mở cổng](../../skills/contribute-production-module/SKILL.md) | — |

## Trạng thái thật

✅ có và có kiểm · 🟡 một phần · ☐ đã duyệt thiết kế, Kernel chưa thi hành.

| Việc | Trạng thái |
|---|---|
| Sổ chỉ thêm, một cửa ghi, phiên bản chứng từ, bể chờ, khoá kỳ | ✅ |
| Giá vốn bình quân gia quyền theo tháng, lãi gộp | ✅ |
| Đối chiếu sổ kho với sổ cái | ✅ API và mã tự chẩn đoán, mức **cảnh báo** (chưa chặn khoá kỳ) |
| `item_id` bất biến, mã hàng có phiên bản, `item_id` trên dòng sổ / sổ kho, giá vốn gom theo `item_id` | ✅ (migration 0065, 0066; PHASE-024 G2) |
| API / khuôn nạp nhận `itemId`, đổi mã / gộp mã, trang vòng đời | ☐ (PHASE-024 S024-11, S024-17) |
| FIFO | ☐ tuỳ chọn (PHASE-024 B7, sau đổi mã an toàn) |
| Chứng từ sản xuất, giá thành | ☐ cổng chờ |
| Sổ tay nghiệp vụ theo từng action của module | 🟡 chưa có trong repo |

## Thuật ngữ

| Từ | Nghĩa |
|---|---|
| **Chứng từ / sự việc** | Một việc đã xảy ra, gửi vào sổ theo [bizcity_ledger_intake@1](../contracts/BIZCITY-LEDGER-INTAKE-v1.md) |
| **docType** | Loại chứng từ: `sale`, `sale_return`, `purchase`, `purchase_return`, `transfer`, `stock_adjustment`, `cash_transfer`, `customer_payment`, `supplier_payment`, `manual_journal` |
| **docKey + version** | Định danh chứng từ. Gửi lại cùng `docKey` với `version` lớn hơn thì Core đảo bút toán cũ rồi ghi mới |
| **Kernel** | Phần ghi sổ: định khoản, sổ kép, khoá kỳ, bằng chứng |
| **Cửa nạp, tiền kiểm (preflight)** | Nơi chứng từ được kiểm trước khi vào sổ: L1–L5: khuôn, số học, danh mục, nghiệp vụ, định khoản thử (hoàn tác hết; trường `l5` cho biết đã chạy hay chưa) |
| **dryRun** | Dựng bút toán thử rồi huỷ, không ghi sổ |
| **Bể chờ** | Chứng từ bị chặn không bị vứt: nằm đó kèm mã, người sửa, bước sửa |
| **Mã hàng (SKU)** | Chuỗi để người đọc, ví dụ `110054057`. Có quy tắc đặt (xem 03) |
| **`item_id`** | Định danh hàng bất biến (ULID), cấp một lần. Dòng sổ cái, sổ kho, giá vốn tháng đã mang nó, giá vốn gom theo nó; cửa nạp và API vẫn nhận / trả mã |
| **Nhóm hạch toán** | Gắn mặt hàng với tài khoản kho, giá vốn, doanh thu. Tài khoản do nhóm này quyết, không do mã |
| **Giá vốn bình quân tháng** | Đơn giá = (giá trị tồn đầu + giá trị nhập trong tháng) / (số lượng tồn đầu + số lượng nhập); kế toán bấm tính ở màn Tính giá vốn (ACC49) |
| **Selfcheck, lane** | Bộ kiểm chuẩn của repo. Lane `selfcheck` đọc mã, không cần CSDL; lane `diagnostics` đọc sổ thật |
| **F22-…** | Danh mục 93 tình huống lỗi, mỗi ca có cách khắc phục theo vai |
| **Cổng chờ** | Chỗ đã giữ cho một nghiệp vụ (sản xuất) nhưng Kernel chưa mở |
| **PASS / FAIL / SKIP / WARN / N/A** | Xem [02](02-cong-cu-kiem.md): **SKIP không phải PASS** |

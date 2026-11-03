# PHASE-024 — Item Master & Accounting Classification: định danh hàng hoá, phân loại hạch toán, validator danh mục
<!-- [2026-11-02 09:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — mở phase theo chỉ đạo chủ dự án: sáu nguyên tắc Item Master, bất biến ADR-0017, chuỗi Plugin → Ledger, số đo Prometheus, trang quy định + trace + validator -->

> **Trạng thái:** 🟡 W0 tài liệu + bản mẫu 2026-11-02 · chờ chủ duyệt D024-1..8, trả lời Q024-1..5 · **Code:** chưa
> **Giai đoạn:** Phase 2 của [PHASES](../../standard/PHASES.md) (trụ cột Data / Kernel) · **Mức Kernel:** K0 cho W0; W1 K1 (hợp đồng, bảng mới, validator chỉ cảnh báo); W2 **K3** (đổi khoá sổ phụ kho / dòng sổ sang `item_id`, bất biến Tier 0 mới — ADR-0017, hai người Lõi + kế toán trưởng ký)
> **Mục tiêu:** Mỗi hàng hoá có **một định danh bất biến**; mã hàng có **phiên bản và ngày hiệu lực**; tài khoản đi từ **chính sách hạch toán có phiên bản**, không từ tiền tố mã; mọi mã hàng từ POS / ERP / kho / plugin **qua validation** trước khi chạm sổ; người dùng nhìn là thấy **thiếu cấu hình ở đâu và sửa từ gốc**.
> **Việc lộ trình:** 2.22, 2.23
> **Checklist công bố:** —
> **Tuân thủ / nguyên tắc:** [ADR-0018](../../adr/ADR-0018-danh-muc-co-phien-ban-toan-framework.md) (đề xuất) · [ADR-0017](../../adr/ADR-0017-dinh-danh-hang-hoa-bat-bien.md) · [R-ITEM](../../rules/RULE-ITEM.md) · R-MD · R-LEDGER · R-INTAKE (ADR-0014) · R-POST · R-DIAG · R-FIX (PHASE-022) · bốn câu không thương lượng
> **Phụ thuộc phase:** 021 (trạm tiền kiểm, mã `IN-*`), 005 (chính sách có phiên bản), 012 (gói định khoản), 022 (`remedy`) · **Liên quan:** 018 / 019 (số đo, trace, Bàn điều tra), 023 (thẻ tài khoản — cùng ngôn ngữ "chú giải tại chỗ")
> **Nguồn yêu cầu:** chủ dự án 2026-11-02 — *"chuẩn hóa thành một hệ thống Item Master & Accounting Classification nằm trong bộ hợp đồng dữ liệu (Core Contracts)… core master data validation, cùng bộ trụ cột accounts rule engine, conformance engine cùng triết lý luồng event-driven. Yếu nhất của các hệ thống hiện nay nằm ở phần validation này và cảnh báo."*

| Tài liệu | Một câu |
|---|---|
| [10-DANH-MUC-CO-PHIEN-BAN](10-DANH-MUC-CO-PHIEN-BAN.md) <!-- [2026-11-02 10:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — mở rộng theo ADR-0018 --> | **nguyên tắc chung cho mọi đối tượng** (ADR-0018): định danh ≠ mã ≠ số hiệu tài khoản; bốn hạng thay đổi và quy trình; tài khoản 156 → 152; hai cổng kiểm chuẩn đối chiếu Kernel; checklist plugin → ca chạy máy |
| [60-HAI-CONG-KIEM-CHUAN](60-HAI-CONG-KIEM-CHUAN.md) <!-- [2026-11-02 11:10 PM Johnny Chu - Chu Hoàng Anh] --> | **hai cổng** (ADR-0019 / R-GATE): Gate A danh mục → nháp, Gate B nghiệp vụ → bể chờ; quy trình từng bước, vòng đời, khuôn JSON chung cho dev / AI, sáu tình huống; bản mẫu [mockups/hai-cong.html](mockups/hai-cong.html) |
| [50-TUAN-THU](50-TUAN-THU.md) <!-- [2026-11-02 09:50 PM Johnny Chu - Chu Hoàng Anh] --> | **dev và CEO tuân thủ thế nào**: năm lớp — SDK không cho sai, lỗi dạy tại chỗ (`why`), manifest `conformsTo` + `module check`, AGENTS.md cho AI của dev, trang Quy định cho CEO |
| [00-MASTER-PLAN](00-MASTER-PLAN.md) | sáu nguyên tắc, vai trò từng trụ cột, **chuỗi** Plugin → Ledger (trả lời câu hỏi "có nhất thiết là…?"), thành phần Core cần thêm, quyết định D024-*, câu hỏi Q024-*, đợt W0–W4 |
| [20-KIEN-TRUC](20-KIEN-TRUC.md) | mô hình dữ liệu (`items`, `item_codes`, `item_classification`, biến thể), Item Resolver, Accounting Mapping Resolver, validator (IN-ITEM-*, DG-ITEM-*, SC-ITEM-*), **số đo Prometheus + span Tempo**, migration K3 điền ngược |
| [30-UI-UX](30-UI-UX.md) | trang **Quy định dữ liệu hàng hoá** (HT09), **thẻ mặt hàng** (định danh · lịch sử mã · hạch toán · nơi dùng · kiểm), **validator** trong form, **trace** một dòng sổ ngược về nguồn |
| [mockups/item-master.html](mockups/item-master.html) | bản mẫu tĩnh: ba thẻ (Quy định · Thẻ mặt hàng · Trace), bấm thử |
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | việc con `S024-*`, ca bằng chứng `T024-*`, log |

## Trả lời ngắn các câu hỏi của chủ dự án

- **Hiến pháp ban hành thế nào?** Một bất biến Tier 0 **R-ITEM-0** + sáu nguyên tắc **R-ITEM-1…6** ở [RULE-ITEM](../../rules/RULE-ITEM.md), ghi vào CANON §3; ADR-0017 là quyết định; hợp đồng `bizcity_item_master@1` là khuôn máy đọc; kiểm tự động (trigger, DG-ITEM-*, SC-ITEM-*) là cách thi hành — không có luật nào chỉ nằm trên giấy.
- **Thể hiện khi người dùng làm việc?** Cột "Thể hiện khi người dùng làm việc" của RULE-ITEM §2 và màn ở [30-UI-UX](30-UI-UX.md): đổi mã có ngày hiệu lực và lịch sử; mã lạ vào trạm tiền kiểm chứ không lặng lẽ vào danh mục; thẻ mặt hàng nói rõ "hạch toán theo chế độ nào, từ ngày nào"; trang Quy định hiện **tình trạng thật** của đơn vị theo từng nguyên tắc.
- **Prometheus theo dõi gì?** [20-KIEN-TRUC §6](20-KIEN-TRUC.md): tra định danh (kết quả, nguồn), phát hiện validator theo mã / mức, số item chưa phân loại, xung đột ánh xạ tài khoản, giá vốn (thời lượng, item chưa có giá, lần chạy đạt gần nhất), tồn âm, lệch kho – sổ. Không nhãn `tenant` (R-OBS-4).
- **Bổ sung gì vào Core?** [00-MASTER-PLAN §4](00-MASTER-PLAN.md): hợp đồng `bizcity_item_master@1`; bảng `items` / `item_codes` / `item_classification`; **Item Resolver** (Kernel); **Accounting Mapping Resolver** (mở rộng AccountResolver: phân loại + ngữ cảnh + phát hiện xung đột); validator ba lớp (IN-ITEM / DG-ITEM / SC-ITEM); khung nhìn `bizcity_read.items*`; action `core.item.*`; số đo + dashboard 09; trang HT09 + thẻ mặt hàng.
- **Chuỗi có nhất thiết là POS → Accounting Event → Item Resolution → Validation → Rules → Costing → Ledger Commit → Domain Event?** Không hẳn — hai chỗ khác với Kernel hiện có và nên giữ như Kernel: (1) **Item Resolution nằm trong Validation**, và cả hai đi **trước** khi sự việc được nhận (chứng từ chưa đạt vào bể chờ, không vào `accounting_events`); (2) **Costing đứng sau Ledger Commit**: giá vốn bình quân tính theo tháng, ghi đè dòng giá vốn chờ (`costFill`) — không thể xác định giá trị trước khi ghi sổ. Chuỗi chuẩn ở [00-MASTER-PLAN §3](00-MASTER-PLAN.md).

## Hiện trạng (đọc mã, 2026-11-02)

| Có sẵn | Ở đâu | Thiếu |
|---|---|---|
| Danh mục mặt hàng, nhóm hạch toán, ĐVT quy đổi, bảng giá, mã cha / biến thể, phân loại ngành – nhãn – nhóm – loại | `products`, `product_posting_groups`, `product_units`, `product_prices`, `parent_sku`, `item_classes` | định danh bất biến; mã có phiên bản; phân loại có ngày hiệu lực |
| Quy tắc mã hàng (`skuInfo`) + kiểm IN-MD-002 | `@bizcity/mua-hang-domain/ma-hang.ts` | tách "gợi ý" khỏi "định khoản" (R-ITEM-4) |
| AccountResolver: lý do → nhóm hạch toán → tài khoản; nhóm mặc định khi thiếu | `kernel/posting/account-resolver.ts` | phân loại là đầu vào có phiên bản; thiếu nhóm phải **nhìn thấy** (R-ITEM-8); phát hiện xung đột |
| Trạm tiền kiểm L1–L5, mã IN-MD-* | PHASE-021 | IN-ITEM-*; bỏ tự thêm mặt hàng từ chứng từ |
| Giá vốn bình quân tháng theo nhóm tính giá, ghi đè dòng chờ | `costing.service.ts` | khoá theo `item_id`; số đo chạy giá vốn |
| Kiểm `INVENTORY_NEGATIVE`, `COGS_STALE`, `STOCK_ADJUST_NO_REASON`, `DEBT_MATCH_LEDGER` | PHASE-020 / 022 | `DG-ITEM-*`, `STOCK_LEDGER_MATCH` theo item |
| Số đo `bizcity_postings_total`, `bizcity_posting_failures_total`, diagnostics | PHASE-018 | nhóm số đo item / mapping / costing; dashboard 09 |

## Xong khi

Phase xong khi 2.22, 2.23 **done** trên bảng điểm (`node tests/conformance/selfcheck.mjs` có CSDL): năng lực `item.master`, `item.validation` chuyển `available`; `DG-ITEM-1…5` xanh trên đơn vị test; `SC-ITEM-1…3` block và xanh; ca bằng chứng T024-1…9 đạt; migration K3 chạy qua `kiem-nang-cap.sh` với tồn kho theo mã trước / sau trùng nhau.

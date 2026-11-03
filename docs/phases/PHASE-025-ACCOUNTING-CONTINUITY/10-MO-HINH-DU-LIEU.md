# PHASE-025 · 10 — Mô hình dữ liệu: mười một định danh nối vòng đời
<!-- [2026-11-03 06:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — mô hình dữ liệu Accounting Continuity: định danh, lớp giá vốn, phân bổ, truy vấn lineage -->

## 1. Định danh

| Nhóm | Định danh | Mục đích | Hôm nay | Đích |
|---|---|---|---|---|
| Đối tượng | `item_id` | bất biến xuyên vòng đời sản phẩm | chưa có — khoá theo `sku` | `items.item_id` (ULID, PHASE-024 B2) |
| Tồn kho | `variant_id` | biến thể theo dõi tồn riêng | chưa có | item con `parent_item_id` (D024-7) — `variant_id` **là** `item_id` của biến thể, không thêm khoá riêng |
| Tồn kho | `valuation_pool_id` | phạm vi tính giá vốn | ngầm định: đơn vị hạch toán của chi nhánh | `valuation_pools` (đơn vị hạch toán × [kho] theo chính sách) |
| Nghiệp vụ | `economic_event_id` | liên kết mua, nhập, xuất, bán, trả, điều chỉnh | `accounting_events.id` (+ `doc_key`, `version`) | giữ nguyên |
| Nghiệp vụ | `document_line_id` | dòng cụ thể của chứng từ | `inventory_movements` (`event_id`, `line_no`); `lineKey` ở khuôn nạp | `document_lines` hoặc khoá `(event_id, line_key)` ổn định giữa phiên bản |
| Giá vốn | `valuation_layer_id` | lớp giá: phiếu nhập (FIFO / đích danh) hoặc bể kỳ (bình quân) | `inventory_costs` (bể tháng, không có id lớp) | `valuation_layers` |
| Giá vốn | `cost_allocation_id` | dòng xuất lấy bao nhiêu từ lớp nào | chưa có | `cost_allocations` |
| Kế toán | (`chart_version`, `account_code`) | số hiệu tài khoản có hiệu lực | số hiệu trên dòng sổ | + phiên bản hệ thống tài khoản, ánh xạ (ADR-0018, S024-21) — **không** thêm `account_id` nhân tạo |
| Kế toán | `journal_entry_id` | bút toán | id bút toán sổ cái | giữ nguyên |
| Phiên bản | `item_version_id` | mã / phân loại tại ngày | chưa có | `item_codes` (hiệu lực) + `item_classification` |
| Phiên bản | `policy_version_id` | chính sách hạch toán, phương pháp tính giá tại ngày | `posting_policy_versions.version` | + `costing_method` |

## 2. Bảng mới (W2)

```text
valuation_layers (CHỈ THÊM)
  layer_id        ULID PK
  tenant_id, pool_id, item_id
  kind            receipt | period_pool | opening | adjustment
  source_line     (event_id, line_key)   — phiếu nhập; null với period_pool
  period          YYYY-MM                — với period_pool
  qty_in, value_in                       — lượng / giá trị vào lớp
  unit_cost       numeric
  policy_version  int                    — phương pháp tính giá lúc tạo lớp
  superseded_by   ULID null              — tính lại → lớp mới, lớp cũ trỏ sang
  created_at

valuation_layer_sources (bình quân: phiếu nhập nào góp vào bể)
  layer_id, source_line, qty, value

cost_allocations (CHỈ THÊM)
  allocation_id   ULID PK
  tenant_id, item_id, pool_id
  issue_line      (event_id, line_key)   — dòng xuất / bán / trả NCC
  layer_id        → valuation_layers
  qty, value
  journal_entry_id                       — bút toán giá vốn mang giá trị này
  run_id                                 — lần tính giá (period run)
  superseded_by   ULID null
```

Ràng buộc (R-CONT-2): không UPDATE / DELETE ngoài đặt `superseded_by` một lần; Σ `cost_allocations.value` (bản hiện hành) của một dòng xuất = giá vốn đã ghi sổ của dòng đó (`CT-COST-003`); Σ `qty` phân bổ ≤ `qty_in` của lớp (`CT-COST-002`).

## 3. Một phương pháp, một mô hình

| Phương pháp | Lớp | Phân bổ dòng xuất |
|---|---|---|
| Nhập trước – xuất trước | mỗi dòng nhập = một lớp `receipt` | lấy lớp cũ nhất còn lượng, có thể nhiều lớp |
| Bình quân gia quyền kỳ (đang chạy) | một lớp `period_pool` / nhóm tính giá / mặt hàng / tháng, nguồn = các phiếu nhập trong kỳ + tồn đầu | một phân bổ về lớp bể |
| Bình quân liên hoàn | lớp `period_pool` mới sau mỗi lần nhập | về lớp hiện hành lúc xuất |
| Thực tế đích danh | lớp `receipt` theo lô / serial | về đúng lớp dòng xuất chỉ định |

## 4. Truy vấn lineage

- **Ngược** (bút toán → nguồn): `journal_entry_id` → `cost_allocations` → `valuation_layers` → `source_line` (phiếu nhập) → `accounting_events` (mua) → nhà cung cấp, hoá đơn.
- **Xuôi** (phiếu nhập → nơi tiêu thụ): `source_line` → lớp → mọi phân bổ → dòng bán → doanh thu, giá vốn, lãi gộp từng lần bán.
- **Theo mặt hàng**: `item_id` → mọi phiên bản mã + mọi lớp + mọi phân bổ + mọi sự kiện, theo thời gian (màn Hành trình mặt hàng).

Hợp đồng đọc: `bizcity_lineage@1` (W1) — nút (`event`, `line`, `layer`, `allocation`, `entry`, `code_version`), cạnh, `effect` (`accounting` / `operational`), mã `CT-*` gắn vào nút bị đứt.

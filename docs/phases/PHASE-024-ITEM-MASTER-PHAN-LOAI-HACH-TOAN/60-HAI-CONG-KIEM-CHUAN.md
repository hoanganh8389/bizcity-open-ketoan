# PHASE-024 · 60 — Hai cổng kiểm chuẩn: quy trình, trạng thái, khuôn phản hồi, trải nghiệm
<!-- [2026-11-02 11:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — kiến trúc Gate A (nháp) + Gate B (bể chờ) theo ADR-0019 / R-GATE: quy trình tường minh, vòng đời, khuôn JSON chung, ca tình huống, bản mẫu -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> Quyết định: [ADR-0019](../../adr/ADR-0019-hai-cong-kiem-chuan-nhap-va-be-cho.md) · Luật: [R-GATE](../../rules/RULE-GATE.md) · Gate B chi tiết: [PHASE-021](../PHASE-021-TRAM-TIEN-KIEM-DAU-VAO/README.md) / [R-INTAKE](../../rules/RULE-INTAKE.md).
> Bản mẫu bấm thử: [mockups/hai-cong.html](mockups/hai-cong.html).

## 1. Toàn cảnh

```text
                ┌──────────────── GATE A · DANH MỤC ────────────────┐
 Kế toán / plugin│ khai báo → khung Vì sao (ℹ ▶ ⚠ ✘)                   │
 core.item.*     │   còn ✘ ─────────────────► DRAFT (nháp)            │──┐ kích hoạt → sự kiện
 core.partner.*  │   chỉ ⚠ + lý do ─────────► ACTIVE                  │  │ bizcity.masterdata.*.activated
                 │   hạng 3 ────────────────► phiên bản nháp → duyệt  │  │
                └───────────────────────────────────────────────────┘  │
                                                                         ▼ kiểm lại tự động
                ┌──────────────── GATE B · NGHIỆP VỤ ───────────────┐
 POS / ERP /     │ L1 khuôn → L2 số học → L3 danh mục (+ Item         │
 module / người  │ Resolution; DRAFT → IN-ITEM-009) → L4 kỳ, chủ      │
 ctx.ledger.submit│ chứng từ → L5 định khoản thử → Commit Guard        │
                 │   có ✘ ─────────────────► BỂ CHỜ (intake_inbox)    │
                 │   chỉ ⚠ + lý do / đạt ──► SỰ VIỆC (accounting_events)
                └───────────────────────────────────────────────────┘
                                 ▼
          Rules → Ledger commit (trigger: Nợ = Có, kỳ, bất biến) + Outbox → Costing (sau) → Conformance (đêm)
```

## 2. Gate A — vòng đời danh mục

| Trạng thái | Khi nào | Dùng trên chứng từ? | Thoát bằng |
|---|---|---|---|
| `draft` | lưu khi còn ✘ (thiếu ĐVT, mã trùng hiệu lực, chưa phân loại khi đơn vị tắt fallback…); hoặc tạo từ "Tạo mặt hàng từ dòng" ở bể chờ | **không** — Gate B giữ chứng từ với `IN-ITEM-009` | sửa hết ✘ → **Kích hoạt** (ghi lý do nếu còn ⚠) |
| `active` | không còn ✘ | có | Ngừng dùng → `retired` (kiểm còn tồn / số dư, ⚠ ACC-HINT-006 / DG-ITEM-4) |
| phiên bản nháp (hạng 3) | đổi bản chất / phân loại / tài khoản | phiên bản **đang hiệu lực** vẫn dùng | kế toán trưởng duyệt → hiệu lực từ ngày D (+ chứng từ phân loại lại) |
| `retired` | ngừng dùng | không (mã cũ vẫn tra được cho chứng từ cũ) | — |

Luật nhỏ: nháp có hạn giữ (đề xuất 30 ngày không sửa → nhắc chủ; 90 ngày → kế toán trưởng xoá / kích hoạt); nháp không vào báo cáo, không vào ô chọn của phiếu (trừ ô có nhãn "nháp" ở màn danh mục).

## 3. Gate B — bước và nơi giữ

| Bước (R-GATE-8) | Kiểm | Mã | Không đạt |
|---|---|---|---|
| L1 khuôn | zod `bizcity_ledger_intake@1`, version, chủ chứng từ | `IN-SHAPE-*` | bể |
| L2 số học | tổng tới xu | `IN-SUM-*` | bể |
| L3 danh mục | chi nhánh, kho, đối tượng, **Item Resolution** (mã → item_id tại ngày), ĐVT, **danh mục nháp** | `IN-MD-*`, `IN-ITEM-001…009` | bể; link tới nháp liên quan |
| L4 nghiệp vụ | kỳ khoá, khoá ngày, phiên bản, trùng hoá đơn | `IN-BIZ-*` | bể |
| L5 định khoản thử | lý do, tài khoản, nhóm hạch toán, cân, **điều kiện kho** (đủ tồn khi đơn vị chặn âm, kho thuộc chi nhánh) | `IN-POST-*` | bể |
| Commit Guard | băm (phiên bản chính sách + phiên bản danh mục) lúc tiền kiểm = lúc commit | `IN-GUARD-001` | chạy lại L3–L5 một lần; vẫn khác → bể với lý do "cấu hình vừa đổi" |
| Commit | trigger sổ (Nợ = Có, kỳ, bất biến), outbox cùng giao dịch | lỗi `bizcity_errors@1` | huỷ giao dịch; nếu từ cửa HTTP → bể (R-INTAKE-1) |

Costing **không** ở trước commit: giá vốn bình quân tính cuối kỳ, ghi đè dòng chờ (R-POST-7).

## 4. Khuôn phản hồi chung (dev / AI đọc một kiểu)

```json
{
  "ok": false,
  "gate": "B",
  "held": { "kind": "inbox", "id": "inb_01JC…", "url": "/chung-tu?tab=can-sua&id=inb_01JC…" },
  "findings": [
    { "code": "IN-ITEM-009", "gate": "B", "step": "L3", "level": "block",
      "title": "Mặt hàng SUA01 còn nháp: thiếu đơn vị tính quy đổi \"thùng\"",
      "why": "Chứng từ không ghi sổ được với mặt hàng chưa kích hoạt — sổ kho không biết 1 thùng là bao nhiêu hộp.",
      "fix": [{ "text": "Mở bản nháp SUA01, khai quy đổi thùng = 12 hộp, Kích hoạt", "screen": { "code": "DM", "path": "/danh-muc/mat-hang/01JBX…K7" } },
              { "text": "Sau khi kích hoạt, chứng từ này được kiểm lại tự động" }],
      "path": "lines[2].unit", "got": "thùng", "expected": "hộp | lốc",
      "rule": "R-GATE-6", "learn": "docs/huong-dan/ma-loi/IN-ITEM-009.md" }
  ],
  "requestId": "req_…", "traceId": "4f2a…"
}
```

Gate A dùng cùng khuôn với `"gate": "A"`, `"held": { "kind": "draft", "id": "<item_id>" }`. `?dryRun=1` trả đúng khuôn này nhưng `held` rỗng (R-INTAKE-9).

## 5. Ca tình huống (mỗi ca một màn trong bản mẫu)

| # | Tình huống | Cổng | Người dùng thấy | Dev / AI thấy |
|---|---|---|---|---|
| 1 | POS gửi mã hàng lạ | B · L3 | thẻ "Cần sửa": IN-ITEM-001, nút "Tạo mặt hàng từ dòng" / "Thêm mã vào mặt hàng có sẵn" | JSON `held.inbox`, gợi ý `core.item.add-code` |
| 2 | Tạo mặt hàng thiếu ĐVT quy đổi | A | form: ✘ thiếu ĐVT → nút "Lưu nháp"; thẻ mặt hàng nhãn **Nháp** | `held.draft` |
| 3 | Chứng từ dùng mặt hàng nháp | B · L3 | IN-ITEM-009 + link nháp; kích hoạt xong mục tự chuyển "Đã kiểm lại, đạt" | sự kiện `item.activated` → `resubmitted` |
| 4 | NCC không MST (⚠) | A | "Ghi (có 1 cảnh báo)" + lý do → active ngay | `meta.findings` + `catalog.warn.unacked` nếu API |
| 5 | Đổi nhóm hạch toán có tồn (hạng 3) | A | phiên bản nháp "chờ kế toán trưởng", phiên bản cũ vẫn chạy; xem tác động | `held.draft` kind `classification` |
| 6 | Cấu hình đổi giữa tiền kiểm và commit | B · Guard | không thấy gì nếu chạy lại đạt; nếu không: bể với "cấu hình vừa đổi" | `IN-GUARD-001` |

## 6. Việc thêm vào checklist

| ID | Việc | Đợt |
|---|---|---|
| S024-27 | Hợp đồng `bizcity_findings@1` (khuôn chung) + chuyển `catalog-hint`, `intake-findings` về khuôn này; SC-FIND-1; trang `docs/huong-dan/ma-loi/` sinh từ tệp | W1 |
| S024-28 | Trạng thái `draft` / `active` / `retired` cho `items`, `partners` (+ `catalog_drafts` cho phiên bản phân loại hạng 3); "Lưu nháp" khi còn ✘; nháp không vào ô chọn / báo cáo | W1–W2 (K1) |
| S024-29 | Gate B: `IN-ITEM-009`, Commit Guard (`IN-GUARD-001`), kiểm lại bể khi `bizcity.masterdata.*.activated` — phối hợp PHASE-021 PR-I2 / I3 | W2 |
| S024-30 | Số đo `bizcity_catalog_drafts{entity}`, `bizcity_catalog_draft_oldest_seconds`; alert; Bàn đánh giá hiện bể / nháp theo tuổi | W3 |
| S024-31 | MCP đọc: `core.findings.explain(code)`, `core.intake.get(inboxId)`, `core.item.get(itemId)` có trạng thái nháp — AI của dev đọc đúng nguồn | W3 |
| S024-32 | UI theo [mockups/hai-cong.html](mockups/hai-cong.html): nút "Lưu nháp", nhãn Nháp, thẻ "Cần sửa" có link nháp, màn tra mã | W4 |

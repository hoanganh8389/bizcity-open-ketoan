# PHASE-035 · 00 — Kế hoạch & thiết kế: HT11 Modules & mức đạt
<!-- [2026-11-11 03:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-035 — W0: sổ bizcity_modules@1, gắn phân hệ vào bảng việc (R-FLOW-10 đề xuất), API /system/modules, màn HT11, SC-MODS-1/2, nếp rà hằng tuần của Thuy2k; bước thắng nhỏ B1..B6 -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> Đọc trước: [README](README.md) · [PHASE-034 · 00](../PHASE-034-HT10-BANG-HOAN-THIEN-CORE/00-MASTER-PLAN.md) (khuôn HT10) · [RULE-FLOW §4](../../rules/RULE-FLOW.md) (bảng việc).

## 1. Quyết định (chủ dự án duyệt 2026-11-11 theo đề xuất) <!-- [2026-11-11 03:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-035 — chủ dự án duyệt D035-1..8, Q035-1..3 theo đề xuất (2026-11-11: "đồng ý theo đề xuất"); giữ chỗ B1 -->

| Mã | Quyết định | Ở đâu |
|---|---|---|
| D035-1 | **Một sổ** `docs/standard/modules.json` (`bizcity_modules@1`): 12 phân hệ × 8 mặt. Ô = danh sách việc `S###-n` + màn + phép kiểm + tài liệu. Mức ô **tự suy** từ bảng việc; không trường `status` gõ tay | §3 |
| D035-2 | Mức ô: **Đạt** = mọi việc xong và ô có test hoặc phép kiểm; **Một phần** = có việc xong hoặc chờ đủ tín hiệu; **Mới tài liệu** = chỉ có việc tài liệu / chữ chốt xong; **Chưa** = không việc nào bắt đầu. Mức phân hệ = trung bình 8 mặt (đạt 1 · một phần ½ · tài liệu ¼ · chưa 0), cùng trọng số HT10 | §3 |
| D035-3 | **Không ai tích đạt** trên giao diện (R-CONT-7). Muốn đổi mức thì sửa checklist của phase (việc xong, có bằng chứng) rồi `bang-viec.mjs --write` | §3 |
| D035-4 | **Việc gắn phân hệ** (R-FLOW-10 đề xuất): README phase khai dòng `> **Phân hệ:** kho · mua-hang`; dòng việc ghi đè bằng `{kho}` ở cuối ô Việc khi khác. `bang-viec.mjs` phát `modules[]`; việc thiếu phân hệ → SC-MODS-2 cảnh báo (không chặn) | §4 |
| D035-5 | **Phủ 100 %**: SC-MODS-1 (chặn) — mọi thư mục `apps/web/src/phan-he/*` (trừ `dev`, `api` gom vào M12) có đúng một phân hệ trong sổ; mọi mã màn trong `menu.ts` thuộc đúng một phân hệ; sổ không có phân hệ "mồ côi" | §4 |
| D035-6 | **API chỉ đọc** `GET /api/v1/system/modules` (quyền đăng nhập, như `/engines`): sổ + mức tính + việc kèm trạng thái, người giữ (CLAIMS). Cùng thư mục `system/`, cùng cache và `readJson` của `engines.routes.ts` | §4 |
| D035-7 | **Thuy2k là người rà HT11**: thứ Hai hằng tuần mở HT11, ghi nhận xét vào checklist 40 của phase liên quan (dòng nhật ký `Rà HT11 tuần N`); việc M01..M04 (danh mục, mua, kho, bán) mặc định người làm Thuy2k; cột Người làm đọc từ CLAIMS (ai đang giữ) hoặc `owner` của ô | §5 |
| D035-8 | **Thẻ Việc hôm nay theo phân hệ** (B5): mỗi phân hệ có thẻ *Việc <phân hệ> hôm nay* đọc cùng lượt tự kiểm L3 (lọc `remedy.owner` + `closeRef` thuộc PC của phân hệ) — không phép kiểm mới, chỉ lọc | §6 |

## 2. Danh sách phân hệ (phủ 100 %)

| Mã | Phân hệ | Thư mục `phan-he/` | Mã màn | Người làm mặc định |
|---|---|---|---|---|
| M01 | Danh mục & cấu hình | `danh-muc`, phần cấu hình của `he-thong` | DM*, HT01..04 | Thuy2k |
| M02 | Mua hàng | `mua-hang` | MH* | Thuy2k |
| M03 | Kho · Inventory Engine · giá vốn | `kho` + `packages/kernel/src/modules/inventory` | KHO*, HH*, ACC49, ACC50 | Thuy2k |
| M04 | Bán hàng · POS | `ban-hang` (+ module `pos`) | BH* | Thuy2k (POS: TrongKien125) |
| M05 | Quỹ · thu · chi · ngân hàng | `quy` | ACC51..54, Q* | H-Joyy |
| M06 | Chứng từ & định khoản | `ke-toan` nhóm 1 | ACC1x, SC*, BT*, YC* | nhóm Lõi |
| M07 | Công nợ | `ke-toan` nhóm công nợ | CN* | H-Joyy |
| M08 | Tổng hợp · kết chuyển · khoá sổ · Bàn làm việc kế toán | `ke-toan` nhóm 4 + HT08 | ACC4x, HT08 | nhóm Lõi |
| M09 | Thuế | `thue` | THUE*, TNDN*, TT* | H-Joyy |
| M10 | Tài sản · khấu hao | `tai-san` | TS*, ACC6x | H-Joyy |
| M11 | Báo cáo tài chính · sổ · dashboard | `ke-toan` nhóm 2 + tổng quan | ACC8x, KQ*, B* | nhóm Lõi |
| M12 | Hệ thống · bộ kiểm · công cụ dev | `he-thong`, `dev`, `api` | HT*, DEV* | nhóm Lõi (trỏ HT10) |

Phân hệ mới (ví dụ module `pos`, `kho` tách module) thêm một dòng vào sổ; SC-MODS-1 bắt khi thư mục có mà sổ chưa có.

## 3. Sổ `bizcity_modules@1` — tám mặt, mức tự suy

```jsonc
{
  "contract": "bizcity_modules@1", "version": "0.1.0-draft", "updated": "2026-11-11",
  "facets": { "F1": "Chứng từ & nghiệp vụ", "F2": "Danh mục & cấu hình", "F3": "Lõi tính (engine)", "F4": "Báo cáo & sổ",
              "F5": "Bộ kiểm (cổng, chẩn đoán, điều kiện khoá sổ)", "F6": "Bàn làm việc & dashboard", "F7": "Tài liệu & hướng dẫn", "F8": "API / SDK / module hoá" },
  "modules": [
    { "id": "M03", "key": "kho", "title": "Kho · Inventory Engine · giá vốn", "dirs": ["apps/web/src/phan-he/kho", "packages/kernel/src/modules/inventory"],
      "screens": ["KHO", "HH", "ACC49", "ACC50"], "owner": "Thuy2k", "phases": ["PHASE-032"],
      "cells": {
        "F3": { "tasks": ["S032-11", "S032-12", "S032-13", "S032-14", "S032-16", "S032-17", "S032-20"], "tests": ["apps/api/test/tra-hang-gia-von-goc.test.ts"], "gap": "lớp giá + phân bổ; FIFO; chốt giá vốn trước khoá kỳ" },
        "F5": { "tasks": ["S032-20", "S032-30"], "checks": ["INVENTORY_NEGATIVE", "INVENTORY_LEDGER_MISMATCH", "COGS_STALE", "TRANSIT_NONZERO", "STOCK_ADJUST_NO_REASON"], "pcs": ["PC-004", "PC-005", "PC-008", "PC-009"] },
        "F7": { "docs": ["docs/nghiep-vu/16-lo-hang.md", "docs/huong-dan/tinh-gia-von.md"] }
      } }
  ]
}
```

- `tasks` là nguồn chính của mức; `tests` / `checks` / `docs` / `screens` là **bằng chứng** (phép kiểm SC-MODS-3 bắt đường dẫn, mã, màn không tồn tại — như SC-DOC-4, SC-ENG-1).
- Ô không có `tasks` nhưng có `checks` hoặc `screens` tồn tại → **Đạt** (đã có mã chạy, không còn việc). Ô trống hẳn → **Chưa**.
- `gap` là chữ cho kế toán đọc, lấy mặc định từ tiêu đề các việc chưa xong nếu không ghi.
- Việc gắn phân hệ qua R-FLOW-10 (§4) được **gom thêm** vào ô theo luật mặt: việc có từ khoá `màn / phiếu / chứng từ` → F1; `danh mục / cấu hình` → F2; `engine / tính / giá vốn / kết chuyển` → F3; `báo cáo / sổ / bảng kê` → F4; `kiểm / CT- / DG- / IN- / PC-` → F5; `thẻ / bàn làm việc / dashboard / việc hôm nay` → F6; `hướng dẫn / tài liệu / ADR / luật` → F7; `API / SDK / hợp đồng / module` → F8; không khớp → F1. Ô liệt kê tay thắng luật từ khoá.

## 4. Luồng tự động map

```text
checklist 40 của phase (main) ──bang-viec.mjs──► bang-viec.json { id, phase, column, modules[] }
                                                        │
modules.json (ô liệt kê tasks / luật từ khoá) ◄─────────┘        CLAIMS.md (ai đang giữ)
                                                        │                │
                                   GET /api/v1/system/modules ◄──────────┘   (chỉ đọc, cache, cùng khuôn /engines)
                                                        │
                                   HT11 ModulesPage: dải tổng · thẻ phân hệ · bảng 12 × 8 · lọc người / ưu tiên / chưa đạt
```

- **R-FLOW-10 (đề xuất, thêm vào RULE-FLOW):** README phase có dòng `> **Phân hệ:** …` (một hay nhiều `key` của §2). Dòng việc có thể ghi đè bằng `{key, key}` cuối ô Việc. `bang-viec.mjs` phát `modules[]`; thiếu cả hai → `modules: []` và SC-MODS-2 cảnh báo (nợ cũ được ghi baseline, phase mới không được thiếu).
- Phase cũ (001..034): B1 bổ sung dòng Phân hệ cho 34 README, một PR tài liệu; không sửa từng dòng việc.
- Người làm: ô `owner` của phân hệ là mặc định; việc đang giữ ở CLAIMS hiện tên người giữ; lọc *Người làm = Thuy2k* = ô có owner Thuy2k hoặc việc Thuy2k đang giữ.

## 5. Nếp rà hằng tuần (Thuy2k)

1. Thứ Hai: mở HT11, lọc *chỉ mặt chưa đạt* và *Người làm = Thuy2k*.
2. Mỗi mặt chưa đạt: xác nhận `gap` còn đúng, việc tiếp còn đúng; sai thì sửa checklist 40 của phase (không sửa sổ bằng tay ngoài `gap`).
3. Ghi một dòng nhật ký `Rà HT11 tuần N` vào 40 của phase có thay đổi; việc mới phát hiện thì thêm dòng việc `S###-n` (R-FLOW-8), từ đó HT11 tự đếm.
4. Thuy2k **không** tích đạt; mức chỉ đổi khi việc xong có bằng chứng. Chủ dự án xem dải tổng và tile *Phần Thuy2k*.

## 6. Bước thắng nhỏ (R-FLOW-9)

| Bước | Ai dùng được gì sau bước | Việc (40) | Mức | Cần |
|---|---|---|---|---|
| **B1** | `modules.json` 12 phân hệ × 8 mặt (liệt kê việc hiện có); 34 README phase có dòng Phân hệ; `bang-viec.mjs` phát `modules[]`; R-FLOW-10 | S035-2, S035-3 | K1 | chữ chốt = 00 này được duyệt; giữ chỗ `scripts/bang-viec.mjs`, `tests/conformance/checks/flow/board.lib.mjs` |
| **B2** | `GET /api/v1/system/modules` trả mức từng ô; `COPY modules.json` vào ảnh (R-REL-11) | S035-4 | K1 | — |
| **B3** | Màn **HT11** ở Hệ thống → Modules & mức đạt: dải tổng, thẻ phân hệ, bảng, lọc; thêm tile *Phân hệ* vào HT10 Summary trỏ sang HT11 | S035-5 | K1 | — |
| **B4** | SC-MODS-1 (phủ 100 % thư mục + mã màn), SC-MODS-2 (việc có phân hệ), SC-MODS-3 (bằng chứng tồn tại) | S035-6 | K1 | — |
| **B5** | Thẻ *Việc <phân hệ> hôm nay* trong từng phân hệ (đọc lượt L3, lọc theo PC + owner) | S035-8 | K1 | sổ PC (B2c-2 đã có) |
| **B6** | `docs/huong-dan/modules-muc-dat.md`; nếp rà §5 ghi vào AGENTS / RULE-FLOW; in HT11 | S035-7 | — | — |

## 7. Câu hỏi (đã trả 2026-11-11: theo đề nghị — Q035-1 tách ba, Q035-2 cảnh báo phase cũ / chặn phase mới, Q035-3 thẻ riêng trong phân hệ)

| Mã | Câu hỏi | Đề nghị | Ai trả |
|---|---|---|---|
| Q035-1 | `ke-toan` tách ba phân hệ (M06, M08, M11) hay giữ một? | **Tách ba**: chứng từ, tổng hợp, báo cáo là ba nhóm việc, ba người rà khác nhau | chủ dự án |
| Q035-2 | SC-MODS-2 (việc thiếu phân hệ) chặn hay cảnh báo? | Cảnh báo với phase ≤ 034 (baseline), **chặn** với phase mới | chủ dự án |
| Q035-3 | Mặt F6 *Bàn làm việc* của từng phân hệ: thẻ riêng trong phân hệ, hay bộ lọc trên HT08? | Thẻ riêng trong phân hệ (người dùng kho không mở HT08), cùng component, chỉ lọc | chủ dự án |

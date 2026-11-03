# PHASE-026 · 50 — Bản đồ việc theo trụ cột: HT10 nói rõ nhiệm vụ, ranh giới, tài liệu, việc con và bằng chứng
<!-- [2026-11-04 01:08 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — chữ chốt thiết kế S026-19 (bizcity_pillars@1 0.2) + S026-15 (SC-PILLAR-1), theo chỉ đạo chủ dự án 2026-11-04: "explain nhiệm vụ chi tiết hơn, gắn tài liệu cụ thể, từng task nhỏ có bằng chứng, check lại; đặc biệt cho dev cộng đồng làm phân hệ ngoài kernel" -->

**Bản mẫu (duyệt trước khi code):** [mockups/tru-cot-ban-do-viec.html](mockups/tru-cot-ban-do-viec.html) — ô trụ cột, khối trụ cột mở rộng (nhiệm vụ · ranh giới · vai · tài liệu), tiêu chí mở ra bảng việc con, bốn trạng thái, bản di động. Dữ liệu trong bản mẫu là ví dụ.

## 1. Vì sao

Màn HT10 bản W0 (S026-16) cho thấy **đạt tới đâu**, nhưng chưa trả lời ba câu dev hỏi: *trụ cột này giao cho tôi việc gì, đọc tài liệu nào, và làm xong thì chứng minh bằng gì*. Với dev cộng đồng xây phân hệ **ngoài ranh giới kernel** (bán hàng, mua hàng, thu chi, kho, với nhiều chính sách), còn một câu nữa: *tôi được chạm tới đâu, và giao tiếp với Core qua đâu*. Chỉ đạo chủ dự án 2026-11-04 (nguyên văn rút gọn): giải thích nhiệm vụ chi tiết hơn và gắn tài liệu cụ thể từng mục; mỗi mục tách việc nhỏ có bằng chứng và kiểm lại; phân hệ giao tiếp qua module và API; chuẩn giao tiếp ngoài kernel là REST API, chuẩn hoá vào bể sự kiện để kiểm; trụ cột II và III là gốc của tính xuyên suốt — bóc tách kỹ từ tài liệu đã có trên `main`.

## 2. Quyết định (D026-9 … D026-12, chờ chủ duyệt bằng cách merge PR này)

| Mã | Quyết định |
|---|---|
| **D026-9** | `bizcity_pillars@1` lên **0.2.0** (thêm trường, không bỏ trường — màn cũ vẫn đọc được). Mỗi **trụ cột** có `mission` (nhiệm vụ 2–4 câu), `boundary` (kernel · phân hệ / app · giao tiếp), `roles` (dev phân hệ ngoài · cộng đồng Core · kế toán · CEO, theo [PHASE-027 §4](../PHASE-027-CORE-KE-TOAN-CHO-DEV/00-MASTER-PLAN.md)), `docs[]`. Mỗi **tiêu chí** có `docs[]`, `tasks[]`; mỗi **việc con** có `id`, `text`, `status`, `evidence` (chữ), `proof[]` (đường dẫn tệp), `check` (lệnh / ca kiểm lại), `role`, `docs[]`. |
| **D026-10** | **Một nguồn, ba mặt**: `docs/standard/tru-cot.json` → màn HT10 + thẻ Trụ cột (web) · `10-DANH-GIA-ADAPT.md` (sinh bằng `scripts/tru-cot-md.mjs`) · phép kiểm SC-PILLAR-1. Checklist `40-MASTER-CHECKLIST.md` của từng phase vẫn là **nơi ghi tiến độ**; `tasks[]` chỉ trỏ tới mã việc `S###-n` / `T###-G#` / mã `CT-*`, không sao chép trạng thái mà không có bằng chứng. |
| **D026-11** | **SC-PILLAR-1** (S026-15, enforce `block`): (a) tiêu chí / việc con `dat` phải có `proof[]` và mọi đường dẫn trong `proof`, `docs`, `mockup`, `check` phải tồn tại; (b) `tasks[].id` dạng `S###-n` phải có trong checklist của phase, và mức trong JSON không được **cao hơn** ký hiệu checklist (checklist ☐ mà JSON `dat` ⇒ phát hiện); (c) không tiêu chí nào thiếu `docs[]`. Ca tự kiểm: `fixtures/repo-bad/docs/standard/tru-cot.json`. |
| **D026-12** | **Chuẩn giao tiếp ngoài kernel** ghi thành một câu ở `boundary.api` của mọi trụ cột liên quan: phân hệ / app gọi **REST `bizcity_api@1`** để đọc danh mục và nộp sự việc vào **một cửa nạp** (`bizcity_ledger_intake@1`, bể chờ `intake_inbox`, Gate B); mở rộng trong repo thì qua **action `bizcity_action@1`** và **SDK**; nhận biến đổi qua **sự kiện `bizcity_event@1`**. Không có đường ghi thẳng bảng sổ / kho / danh mục từ ngoài kernel. |

## 3. Khuôn dữ liệu 0.2 (bổ sung vào `bizcity_pillars@1`)

```jsonc
{ "contract": "bizcity_pillars@1", "version": "0.2.0-draft",
  "roles": { "dev": "Dev phân hệ ngoài", "core": "Cộng đồng Core", "ketoan": "Kế toán", "ceo": "CEO" },
  "pillars": [{
    "id": "II", "key": "identity", "role": "trụ cột", "title": "…", "one": "…",
    "mission": "2–4 câu: bảo đảm gì, cho ai, vì sao là gốc",
    "boundary": { "kernel": "…", "modules": "…", "api": "…" },
    "roles": { "dev": "…", "core": "…", "ketoan": "…", "ceo": "…" },
    "docs": [{ "kind": "rule|adr|contract|phase|mockup|guide|api", "path": "docs/rules/RULE-ITEM.md", "title": "RULE-ITEM (R-ITEM-0…9)" }],
    "criteria": [{
      "id": "ID-4", "text": "…", "status": "chua", "evidence": "", "gap": "…", "next": "S024-11", "phase": "PHASE-024", "level": "P0", "modules": ["danh-muc"],
      "docs": [ … ], "mockup": "docs/phases/PHASE-024-…/mockups/item-master.html#vitem",
      "tasks": [{ "id": "S024-11", "text": "…", "status": "chua", "evidence": "", "proof": [], "check": "apps/api/test/item-master.test.ts", "role": "core", "docs": [ … ] }]
    }]
  }] }
```

- `status` của việc con dùng cùng bốn mức (`dat` · `mot-phan` · `tai-lieu` · `chua`); mức của **tiêu chí** vẫn ghi tay có bằng chứng (W0), không tự suy từ việc con (đợt sau, D026-6).
- `docs[].path` là đường dẫn từ gốc repo; `guide` là `docs/huong-dan/<key>.md` (mở trong app bằng `HelpDrawer`); các loại khác mở tệp trên kho mã.
- Trụ cột **II** và **III** bóc tách đủ việc con từ: RULE-ITEM §4 (mã kiểm), RULE-CONTINUITY (R-CONT-0…9), ADR-0017 D-1…D-9, ADR-0018 (hạng A–E), ADR-0021 (6 quyết định), PHASE-024 70 (B1…B6), PHASE-024 checklist (S024-4, -9…-13, -16, -17, -19…-21), PHASE-025 10 / 20 (CT-*) và checklist (S025-3…S025-18), PHASE-026 checklist (S026-3, -4, -8, -13), Golden Tests T026-G1…G6. Các trụ cột còn lại: nhiệm vụ, ranh giới, vai, tài liệu; việc con lấy từ cột *Việc tiếp* đang có.

## 4. Giao diện (HT10 + thẻ Trụ cột)

- Ô trụ cột thêm **số việc mở**. Bấm ô ⇒ bảng chỉ còn trụ cột đó **và** hiện khối trụ cột mở rộng: nhiệm vụ · bảng ranh giới (kernel / phân hệ / giao tiếp) · bảng vai · chip tài liệu.
- Mỗi tiêu chí có nút ▸ mở **bảng việc con** (việc · phải làm · mức · bằng chứng (tệp) · kiểm lại bằng · vai) và chip tài liệu + mockup của tiêu chí. Lọc **vai** (dev / core / kế toán / CEO) chỉ hiện việc con của vai đó.
- Vị trí đọc từ URL (R-ROUTE của dự án: `?tru=II&tieu-chi=ID-4&vai=dev`); F5 vẫn ở đúng chỗ. Thẻ Trụ cột ở trang chủ phân hệ dùng cùng component, chế độ `compact` (không khối mở rộng, vẫn mở việc con).
- Bốn trạng thái và bản di động: xem bản mẫu. Không có nút ghi (R-CONT-7).

## 5. Checklist A — code theo bản mẫu (lớp cài đặt: không có, màn chỉ đọc)

| # | Màn / phần | Việc | Trạng thái |
|---|---|---|---|
| A1 | HT10 ô trụ cột | thêm số việc mở; giữ % và đếm | ☐ |
| A2 | Khối trụ cột mở rộng | nhiệm vụ, ranh giới, vai, chip tài liệu; chỉ hiện khi chọn một ô | ☐ |
| A3 | Bảng tiêu chí | nút ▸ mở việc con; chip tài liệu + mockup của tiêu chí | ☐ |
| A4 | Lọc vai | bốn vai, hiệu lực trên việc con; cùng URL | ☐ |
| A5 | URL | `tru`, `tieu-chi`, `vai` đọc / ghi bằng `useSearchParams` | ☐ |
| A6 | Thẻ Trụ cột phân hệ | `compact`: không khối mở rộng, vẫn mở việc con | ☐ |
| A7 | Bốn trạng thái + di động | theo bản mẫu | ☐ |
| A8 | Hướng dẫn `docs/huong-dan/tru-cot-muc-dat.md` | mục "Việc con, bằng chứng, kiểm lại" + "Dev phân hệ ngoài đọc gì" | ☐ |

## 6. Checklist B — giải pháp (dữ liệu, kiểm, tài liệu)

| # | Việc | Trạng thái |
|---|---|---|
| B1 | `docs/standard/tru-cot.json` 0.2.0: trường mới cho 9 trụ cột; việc con đầy đủ cho II, III; việc con từ *Việc tiếp* cho các trụ còn lại; `proof[]` cho mọi tiêu chí `dat` | ☐ |
| B2 | `scripts/tru-cot-md.mjs`: sinh thêm nhiệm vụ / ranh giới / vai / tài liệu / việc con vào `10-DANH-GIA-ADAPT.md`; `--kiem` giữ nguyên | ☐ |
| B3 | `tests/conformance/checks/pillars/pillars.check.mjs` SC-PILLAR-1 (D026-11); fixture `repo-bad/docs/standard/tru-cot.json` (+ checklist mẫu) với ≥ 3 phát hiện; dòng ở `fixtures/expect.json`; dòng ở `docs/standard/CONFORMANCE.md` | ☐ |
| B4 | `GET /api/v1/system/pillars` giữ nguyên (trả nguyên tệp); kiểu `PillarsBoard` ở web thêm trường mới, trường cũ bắt buộc | ☐ |
| B5 | `20-KIEN-TRUC.md §7` và `30-UI-UX.md §4` trỏ tới tài liệu này; CANON §0.2 một câu "bản đồ việc" | ☐ |
| B6 | CHANGELOG; checklist S026-19 🟡 → ✅ khi A1–A8, B1–B5 có bằng chứng | ☐ |

## 7. Bằng chứng (điền khi code)

| Kiểm | Lệnh | Kết quả |
|---|---|---|
| Bộ kiểm chuẩn | `node tests/conformance/selfcheck.mjs --lane selfcheck --strict` | ☐ |
| Tự kiểm | `node tests/conformance/selfcheck.mjs --self-test` (SC-PILLAR-1 ra đúng số phát hiện mẫu) | ☐ |
| Một nguồn | `node scripts/tru-cot-md.mjs --kiem` (trong `kiem-chuan.sh`) | ☐ |
| Kiểu | `npm run typecheck -w @ketoan/web` | ☐ |
| Màn thật | HT10 ở bản chạy từ `main` (4180): mở trụ cột II, mở ID-4, lọc vai dev, F5 giữ vị trí | ☐ |

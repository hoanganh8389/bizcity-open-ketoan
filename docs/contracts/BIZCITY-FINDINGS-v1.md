# `bizcity_findings@1` — Thư viện phát hiện của hai cổng kiểm chuẩn
<!-- [2026-11-02 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-27 (ADR-0019, R-GATE-5): hợp đồng thư viện phát hiện — một khuôn cho mã Gate A (danh mục) và Gate B (trạm tiền kiểm) -->

> **Phiên bản:** 1.0.0-draft · 2026-11-02 · **Trạng thái:** Đề xuất (ADR-0019 chủ duyệt 2026-11-02; thi hành đợt 1)
> **Nguồn sự thật:** `packages/contracts/src/findings.ts` (`FINDINGS_LIBRARY`, `explainFinding`) — gom từ `catalog-hint.ts` (Gate A) và `intake-findings.ts` (Gate B)
> **Luật:** [R-GATE](../rules/RULE-GATE.md) · [R-INTAKE](../rules/RULE-INTAKE.md) · **Kiểm:** SC-FIND-1 · **Trang người đọc:** [docs/huong-dan/ma-loi](../huong-dan/ma-loi/README.md)

## 1. Ý nghĩa

Mọi lần một trong hai cổng không cho qua — khai báo danh mục (Gate A) hay chứng từ trước khi ghi sổ (Gate B) — người dùng, dev và trợ lý AI nhận **một mã**. Hợp đồng này định nghĩa khuôn chung của mã đó và nơi tra nó. Danh mục mã gốc giữ ở chỗ cũ (mã ổn định; đổi nghĩa = mã mới, R-INTAKE-11).

## 2. Khuôn một mục

| Trường | Kiểu | Nghĩa |
|---|---|---|
| `code` | chuỗi | `IN-*` (Gate B), `ACC-*` / `PART-*` / sau này `ITEM-*` (Gate A). Duy nhất trên cả thư viện |
| `gate` | `A` \| `B` | cổng |
| `level` | `block` \| `warn` \| `info` | `block` giữ lại (Gate A → bản nháp, Gate B → bể chờ); `warn` qua cổng khi có lý do; `info` chỉ để biết (`hint` / `guide` gom về đây) |
| `step` | chuỗi | Gate B: `L1`…`L5`; Gate A: tên danh mục (`account`, `partner`…) |
| `title`, `why` | chuỗi | nghĩa một dòng; vì sao kế toán cần — viết cho người mới |
| `fix` | chuỗi | cách sửa; **bắt buộc** với `block` / `warn` (R-GATE-2) |
| `rule` | chuỗi | luật / hợp đồng gốc |
| `learn` | chuỗi \| null | trang học thêm |
| `status` | `draft` \| `approved` | nội dung nghiệp vụ đã được duyệt chưa (luật kế toán: kế toán trưởng) |
| `source` | chuỗi | danh mục gốc |

Phát hiện **cụ thể** cho một bản khai / một chứng từ thêm các trường ngữ cảnh: Gate B `path`, `got`, `expected`, `layer`, `stage` (`bizcity_intake_findings@1`); Gate A `field`, `fix` sửa một chạm `{ label, set }`, `howTo` (`bizcity_catalog_hint@1`).

## 3. Nơi tra

| Ai | Ở đâu |
|---|---|
| Người dùng | trang [Tra mã phát hiện](../huong-dan/ma-loi/README.md) (sinh tự động: `node scripts/sinh-ma-loi.mjs --write`) |
| Dev | `GET /api/v1/findings?gate=&level=&q=` (`core.findings.list`), `GET /api/v1/findings/:code` (`core.findings.explain`) — quyền `catalog:read` |
| Trợ lý AI (MCP) | công cụ `core.findings.explain`, `core.findings.list` (`ai: 'read'`) — đọc đúng nguồn, không đoán nghĩa mã |

## 4. Bảo đảm

- Mã không trùng giữa các danh mục; mỗi mã có tiêu đề, vì sao; `block` / `warn` có cách sửa — SC-FIND-1 (block).
- Trang tra mã có đúng các mã của thư viện — SC-FIND-1.
- Gate B: mã `IN-*` còn chịu SC-INTAKE-1 (bảng hợp đồng + trang bài học từng mã).

## 5. Changelog

- **1.0.0-draft (2026-11-02):** khuôn chung; gom 12 mã Gate A + 20 mã Gate B; API và công cụ MCP tra mã; SC-FIND-1.

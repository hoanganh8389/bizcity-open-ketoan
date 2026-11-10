# `bizcity_modules@1` — Sổ phân hệ nghiệp vụ × tám mặt: nguồn của HT11 Modules & mức đạt
<!-- [2026-11-11 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-035 — B1 (S035-3): hợp đồng sổ docs/standard/modules.json; mức từng ô suy từ bảng việc (R-FLOW-10), không ghi tay -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Phiên bản:** 0.1.0-draft · 2026-11-11 · **Trạng thái:** Đề xuất, chủ dự án duyệt thiết kế 2026-11-11 (PHASE-035 D035-1..3)
> **Nguồn sự thật:** `docs/standard/modules.json` · bảng việc `docs/phases/bang-viec.json` (`bizcity_task_board@1`) · API `GET /api/v1/system/modules` (S035-4) · màn HT11 (S035-5)
> **Luật:** [R-FLOW-10](../rules/RULE-FLOW.md) (mỗi việc thuộc một phân hệ), R-CONT-7 (không tích đạt tay) · **Kế hoạch:** [PHASE-035](../phases/PHASE-035-HT11-MODULES-MUC-DAT/README.md) · **Người rà:** Thuy2k

## 1. Ý nghĩa

HT10 (`bizcity_pillars@1`, `bizcity_engines@1`) đo **Core bảo đảm điều gì**. Sổ này đo **kế toán dùng được gì ở từng phân hệ**: 12 phân hệ (danh mục, mua, kho, bán, quỹ, chứng từ, công nợ, tổng hợp, thuế, tài sản, báo cáo, hệ thống) × 8 mặt (chứng từ · danh mục · lõi tính · báo cáo · bộ kiểm · bàn làm việc · tài liệu · API/SDK) = 96 ô.

## 2. Khuôn

```ts
interface ModulesFile {
  contract: 'bizcity_modules@1'; version: string; updated: string; doc: string; reviewer: string;
  facets: Record<'F1'|'F2'|'F3'|'F4'|'F5'|'F6'|'F7'|'F8', string>;
  levels: Record<'dat'|'mot-phan'|'tai-lieu'|'chua', string>;
  modules: {
    id: `M${string}`; key: string;               // key = khoá trong R-FLOW-10 và MODULE_KEYS của board.lib.mjs
    title: string; owner: string;                // người làm mặc định (lọc "Người làm" ở HT11)
    dirs: string[];                              // thư mục mã của phân hệ (SC-MODS-1: mọi apps/web/src/phan-he/* phải thuộc đúng một module)
    screens: string[];                           // tiền tố / mã màn trong menu.ts (SC-MODS-1)
    phases: string[];                            // phase chính; việc của phase vào phân hệ qua R-FLOW-10, không cần liệt kê ở đây
    cells: Partial<Record<Facet, { tasks?: string[]; screens?: string[]; checks?: string[]; pcs?: string[]; tests?: string[]; docs?: string[]; gap?: string }>>;
  }[];
}
```

Không có trường `status`. **Mức ô** do API suy (D035-2):

| Mức | Khi |
|---|---|
| `dat` | mọi việc của ô (liệt kê tay ∪ việc có `modules[]` chứa `key` và `facet` = mặt) ở cột *Xong*, **và** ô có ít nhất một bằng chứng chạy được (`screens` / `checks` / `tests` tồn tại) — hoặc ô không có việc nhưng có bằng chứng |
| `mot-phan` | có việc *Xong* hoặc *Chờ đủ tín hiệu*, chưa đủ điều kiện trên |
| `tai-lieu` | chỉ việc có mặt F7 xong, hoặc chỉ có `docs` |
| `chua` | không việc nào bắt đầu, không bằng chứng |

Mức phân hệ = trung bình 8 ô (đạt 1 · một phần ½ · tài liệu ¼ · chưa 0). Dải tổng = trung bình các phân hệ. Cùng trọng số HT10.

## 3. Bằng chứng phải tồn tại (SC-MODS-3)

`tasks` có trong bảng việc; `screens` là tiền tố hoặc mã có trong `apps/web/src/phan-he/*/menu.ts`; `checks` có trong `listDiagnostics()`; `pcs` có trong `CLOSE_CONDITIONS`; `tests` / `docs` là đường dẫn có thật. Sai thì selfcheck trượt, như SC-ENG-1 / SC-DOC-4.

## 4. Đổi sổ

Thêm phân hệ: một dòng `modules[]` + khoá vào `MODULE_KEYS` (board.lib.mjs). SC-MODS-1 bắt thư mục `phan-he/` chưa có trong sổ. Đổi `gap`, `owner`: sửa tệp, không cần chữ chốt. Đổi mặt hoặc công thức mức: chữ chốt (R-FLOW-2).

## 5. Changelog

- **0.1.0-draft (2026-11-11):** khuôn đầu: 12 phân hệ, 8 mặt, 4 mức suy; ô liệt kê việc hiện có theo bản mẫu PHASE-035.

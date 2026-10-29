# RULE · Thay đổi Kernel (R-KER)

> **Cấp:** Tier 0 / 1 (ghi từng luật) · **Phiên bản:** 1.0 · 2026-10-29 · **Chỉ mục:** [../00-CANON.md](../00-CANON.md)
> **Vì sao có tệp này:** RULE-LEDGER, RULE-POSTING, RULE-EVENT nói *Kernel phải đúng thế nào*. Tệp này nói *được sửa Kernel thế nào*: phân loại mức thay đổi, ai duyệt, phải chứng minh gì. Module cộng đồng không sửa Kernel (P2). Luật này áp cho nhóm Lõi.
> **Liên quan:** [RULE-RELEASE.md](RULE-RELEASE.md) (phát hành), [RULE-SELF-DIAGNOSTICS.md](RULE-SELF-DIAGNOSTICS.md), [../standard/TARGET-LAYOUT.md](../standard/TARGET-LAYOUT.md), [../standard/VERSIONING.md](../standard/VERSIONING.md)

## 1. Kernel gồm gì

Danh sách đóng. Thêm hoặc bớt thư mục khỏi danh sách cần ADR.

| Hiện tại (`apps/api/src/…`) | Đích (Phase 2.3) |
|---|---|
| `modules/{documents,posting,posting-config,ledger,periods,accounts,debts,inventory,tax-*,closing,default-data}`, `db/seed.ts` | `packages/kernel` |
| Migration nền `db/migrations/000{1..9}_goc_*.sql` và mọi trigger / hàm bảo vệ sổ | `packages/kernel/migrations` |
| `packages/contracts/src/documents.ts` (khuôn `bizcity_ledger_intake@1`) | `packages/kernel/contracts` |

Bề mặt công khai của Kernel: `submit`, `cancel`, `get`, `query` (sổ, báo cáo), hợp đồng `bizcity_ledger_intake@1`, `bizcity_posting_template@1`, `bizcity_mcp@1` phần `ketoan.*`. Mọi thứ khác là nội bộ.

## 2. Bốn mức thay đổi

| Mức | Là gì | Ví dụ | Phiên bản Kernel |
|---|---|---|---|
| **K0** | Không đổi hành vi | tài liệu, thêm test, đổi tên biến nội bộ, tối ưu không đổi kết quả | patch |
| **K1** | Thêm, tương thích | `docType` mới, khoá ngầm định mới, cờ lý do mới, trường tuỳ chọn, báo cáo mới, công cụ MCP đọc mới | minor |
| **K2** | Đổi **hành vi ghi sổ** cho chứng từ **mới** | đổi luật định khoản một `docType`, đổi thứ tự AccountResolver, đổi cách tính giá vốn, đổi luật khoá kỳ / khoá dữ liệu | minor + mục "Thay đổi định khoản" trong CHANGELOG; major nếu module / gói phải sửa theo |
| **K3** | Đụng **lớp bảo vệ** hoặc **dữ liệu đã ghi** | lược đồ / trigger `ledger_*`, cách đảo, một cửa ghi, cờ thoát trigger (E1–E4), định khoản lại hàng loạt, `cost_overwrite` | major (trừ khi chỉ *thêm chặt*: minor) |

## 3. Luật

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **R-KER-1** *(T0)* | Mỗi PR đụng tệp Kernel ghi **mức K0–K3** trong mô tả PR. Không ghi thì coi là K3 | Mẫu PR; CODEOWNERS |
| **R-KER-2** | Người duyệt: K0–K1 một người nhóm Lõi. K2 hai người, một người hiểu nghiệp vụ kế toán. K3 hai người nhóm Lõi + ADR + kế toán trưởng ký duyệt phần nghiệp vụ | CODEOWNERS; ADR |
| **R-KER-3** *(T0)* | Lớp bảo vệ ở CSDL (trigger, CHECK, UNIQUE của R-LEDGER) chỉ được **thêm chặt** (R-DB-2). Mọi trigger khai trong migration phải **có và đang bật** trên mọi bản cài | DG-DB-2 (bộ kiểm, mọi bản cài) |
| **R-KER-4** *(T0)* | K2 / K3 **không đổi bút toán đã ghi**. Hành vi mới áp cho lần định khoản sau (R-POST-8, R-MATRIX-6). Muốn sửa sổ cũ thì định khoản lại bằng bút toán đảo, có người duyệt, theo kỳ chưa khoá | `ledger-flow.test.ts`; trigger |
| **R-KER-5** | K2: chạy lại bộ test luật định khoản (5 ca của R-POST-9) **và** mọi tình huống mẫu của các gói định khoản `official`. Mọi khác biệt bút toán so với bản trước được liệt kê trong CHANGELOG mục "Thay đổi định khoản" | `npm test`; lane runtime (Phase 4) |
| **R-KER-6** | K3 phải có thêm: kế hoạch dữ liệu (thời gian chạy ước tính, R-DB-13); diễn tập trên **bản sao ẩn danh** của dữ liệu thật; lane diagnostics **0 mục error trước và sau**; cách quay lui đã thử | ADR; bằng chứng trong PR |
| **R-KER-7** *(T0)* | Đường ghi sổ **tất định**: cùng sự việc + cùng cấu hình → cùng bút toán (`content_hash`, `body_hash`). Không đọc giờ máy, số ngẫu nhiên, mạng, LLM trong luật định khoản; múi giờ cố định `Asia/Ho_Chi_Minh` | test luật; SC-KERNEL-*; DG-DB-3 |
| **R-KER-8** | Kernel không thêm phụ thuộc npm mới, không gọi dịch vụ ngoài nếu không có ADR. AI chỉ đứng ngoài, gọi vào qua MCP (P1, CELL-1) | duyệt PR; SC-MOD-1 |
| **R-KER-9** | Hiệu năng: đo ở bản 1.0 làm **mốc** cho (a) ghi một sự việc 20 dòng, (b) đảo + ghi lại, (c) cân đối phát sinh một tháng một đơn vị, (d) nhập lô 200 sự việc. Mỗi bản phát hành đo lại; xấu hơn mốc **> 20%** thì chặn phát hành trừ khi có ADR | `bizcity bench` (Phase 4); RULE-RELEASE R-REL-4 |
| **R-KER-10** | Kernel có phiên bản SemVer riêng (VERSIONING §1), trả ở `GET /api/v1/system/health` (`kernel`), ghi vào mỗi bút toán qua `posting_log` để truy được bút toán do bản nào định khoản | test health (Phase 2.9) |

## 4. Mẫu ghi trong PR

```text
Mức Kernel: K2
Đổi gì: AccountResolver ưu tiên tài khoản của hình thức thanh toán trước tài khoản ngầm định `cash` cho phiếu thu.
Bút toán cũ: không đổi (R-KER-4).
Khác biệt tình huống mẫu: bizcity.vn-tt99.thuong-mai TM-04 — Nợ 11211 thay vì 1111 (đã ghi CHANGELOG).
Bằng chứng: npm test (… passed), selfcheck ĐẠT, diagnostics bản sao: error=0.
```

# PHASE-030 · 30 — Khuôn một blueprint nghiệp vụ
<!-- [2026-11-06 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-030 — khuôn 9 mục cho mọi nghiệp vụ; cách dev / AI đi từ blueprint tới module theo bizcity_module@1 -->

Blueprint là **đặc tả nghiệp vụ đủ để người hoặc AI viết module mà không cần hỏi lại kế toán**. Một blueprint = một mã nghiệp vụ (giữ mã Erp-vn: `MH01`, `KHO07`…; D030-2). Các tệp 50–55 là blueprint theo nhóm, mỗi nghiệp vụ một mục theo đúng 9 phần dưới đây. Mục nào không áp dụng ghi `—`, không bỏ.

## 1. Chín mục

| # | Mục | Ghi gì | Thành gì trong module |
|---|---|---|---|
| 1 | **Mục đích** | một câu: ai, cần gì, vì sao | `README.md` của module |
| 2 | **Chứng từ và trạng thái** | tên `docType` (`<key>.<doc>`), bảng trạng thái, chuyển trạng thái: *từ → đến, ai, điều kiện, bắt lý do?*; nhóm trạng thái `draft / submitted / approved / done / cancelled` | `api/documents/<doc>.workflow.yaml` |
| 3 | **Trường dữ liệu** | đầu phiếu và dòng: tên, kiểu, bắt buộc, nguồn (danh mục chuẩn `core.*` hay bảng module), ràng buộc duy nhất | `api/schemas/*.ts` (zod), `migrations/0001_*.sql` |
| 4 | **Luật và công thức** | điều kiện hợp lệ, công thức số, làm tròn, tham số dùng (`setting_values` key) | `domain/src/*.ts` hàm thuần + test |
| 5 | **Phân quyền và duyệt** | quyền `<key>:<verb>`, SoD, ngưỡng cấp 2, ai `override` | manifest `permissions`, workflow `permission:` |
| 6 | **Ngoại lệ** | tình huống lệch chuẩn và cách xử lý (cảnh báo / chặn / duyệt ngoại lệ có lý do) — mã `IN-<KEY>-*` nếu là trạm tiền kiểm | `analysis` trả `blocking[] / warnings[]` |
| 7 | **Hạch toán** | từng điểm ghi sổ: *khi nào* (chuyển trạng thái nào), `docType` Kernel, `reasonCode`, "tài khoản theo chính sách"; **không số tài khoản** (D030-3). Mục *Căn cứ* bên dưới mới nêu số tài khoản để kế toán đối chiếu | `ctx.ledger.submit(...)` trong action |
| 8 | **Căn cứ và mẫu biểu** | văn bản pháp lý, điều khoản; mẫu in theo TT99 (01-VT, 02-TT, S23-DN…); ví dụ định khoản bằng số tài khoản cho kế toán trưởng đọc | `docs/can-cu`, `print_template_settings` |
| 9 | **Golden test** | mã `T030-<NHÓM>-<n>` + *cho – khi – thì* trên bất biến sổ; nguồn tham chiếu Erp-vn (tệp) | `apps/api/test/golden/T030-*.test.ts` |

Thêm ở đầu mỗi nhóm: **Điểm mở (hook)** mà module khác cắm vào (M12), và **Năng lực Kernel cần** (K-030-*).

## 2. Quy ước viết

- Tên trạng thái tiếng Anh ngắn (`draft`, `pending_approval`, `approved`, `done`, `cancelled`) vì đi vào YAML; nhãn tiếng Việt ở cột bên.
- Mỗi chuyển trạng thái phải có **ai** (quyền) và **điều kiện** (hàm thuần kiểm được). Chuyển "theo sự kiện" ghi `by: event, on: bizcity.ledger.entry.posted`.
- Công thức viết bằng ký hiệu toán, kèm ví dụ số **khớp golden test**.
- Tham số: tên khoá `setting_values` theo mẫu `<key>.<nhom>.<ten>` (vd `kho.han_dung.ngay_can_han`), giá trị mặc định, phạm vi, có `legalRef` nếu là luật.
- Ngoại lệ phân ba mức như mua hàng hiện có: **chặn** (không nộp được), **cảnh báo** (nộp được, hiện trên phiếu), **duyệt ngoại lệ** (chặn nhưng `override` có lý do bởi quyền cao hơn).
- Không viết "Odoo", không viết tên model `lfood.*` ngoài cột Nguồn.
- Phần open-ketoan đã có: ghi `✅ đã có: <đường dẫn>` và **không** đặc tả lại; chỉ đặc tả phần thiếu.

## 3. Từ blueprint tới module (đường đi của dev / AI)

```
blueprint 50–55 ──► npx bizcity module new <key> --label "…"      (PHASE-014 CLI, templates/starter-module)
      │
      ├─ mục 2 ──► api/documents/*.workflow.yaml
      ├─ mục 3 ──► api/schemas/*.ts · migrations/0001_*.sql (schema mod_<key>, RLS, COMMENT)
      ├─ mục 4 ──► domain/src/*.ts (hàm thuần) + vitest bảng số
      ├─ mục 5 ──► bizcity.module.json permissions · workflow permission
      ├─ mục 6 ──► api/actions/<doc>-analyze.ts → { blocking, warnings }
      ├─ mục 7 ──► api/actions/<doc>-approve.ts: ctx.ledger.submit({ docType, docKey, reasonCode, … })
      └─ mục 9 ──► apps/api/test/golden/T030-<NHÓM>-*.test.ts  (khuôn ở 60)
      │
      ▼
node tests/conformance/selfcheck.mjs --strict · npm test · bizcity module check <key>
      │
      ▼
R-FLOW: dòng CLAIMS.md → PR tài liệu chốt thiết kế (nếu đụng thứ dùng chung) → PR code
```

Đọc trước: `AGENTS.md`, `docs/standard/README.md`, `GOLDEN-CASE-HOP-DONG.md`, 7 hợp đồng. Không đọc Kernel.

## 4. Mẫu rút gọn (điền cho một nghiệp vụ)

```markdown
### KHO07 Kiểm kê kho
1. Mục đích: thủ kho đếm thực tế theo kho / lô, kế toán ghi chênh lệch có duyệt.
2. Chứng từ `kho.stock_count`: draft → counting → submitted → approved → done; cancelled
   | từ | đến | ai | điều kiện | lý do |
   | draft | counting | kho:count | có ≥ 1 dòng | — |
   …
3. Trường: đầu phiếu (kho*, ngày kiểm*, người kiểm*, kỳ); dòng (item_id*, lot_ref, tồn sổ (đọc), tồn đếm*, chênh (tính), lý do)
4. Luật: chênh = đếm − sổ; tồn sổ chụp lúc chuyển `counting`, khoá chứng từ kho của kho đó tới khi `done` hoặc `cancelled`
5. Quyền: kho:count, kho:approve (≠ người đếm); chênh |giá trị| ≥ kho.kiem_ke.duyet_cap2_tu → kế toán trưởng
6. Ngoại lệ: chênh > kho.kiem_ke.nguong_canh_bao_pct → cảnh báo; lô không tồn tại → chặn IN-KHO-LOT-UNKNOWN
7. Hạch toán: approved → done: mỗi dòng chênh ≠ 0 nộp `stock_adjustment` reasonCode NDC (thừa) / XDC (thiếu), docKey `kho.stock_count:<id>:<line>`
8. Căn cứ: TT99/2025 Điều …; mẫu 05-VT biên bản kiểm kê; ví dụ: thừa Nợ 156 / Có 3381; thiếu Nợ 1381 / Có 156
9. Golden: T030-KHO-4, T030-KHO-5 (nguồn: lfood_stock/models/count.py)
```

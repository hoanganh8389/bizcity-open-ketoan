# RULE · Bị chặn thì phải nói lý do và cách gỡ (R-BLOCK)
<!-- [2026-11-10 10:50 PM Johnny Chu - Chu Hoàng Anh] R-BLOCK — chủ dự án chỉ đạo 2026-11-10: mọi nút bị chặn, mờ (disable) hoặc chặn cứng đều có thông báo rõ nguyên nhân và cách khắc phục -->

> **Cấp:** Tier 0 · **Phiên bản:** 1.0 · 2026-11-10 · **Chỉ mục:** [../00-CANON.md](../00-CANON.md)
> **Liên quan:** [BIZCITY-ERRORS-v1](../contracts/BIZCITY-ERRORS-v1.md) (R-ERR-3, §4b remedy) · [RULE-WORKFLOW](RULE-WORKFLOW.md) · [RULE-REVIEW](RULE-REVIEW.md)

**Nguyên tắc (chủ dự án, 2026-11-10):** người dùng không bao giờ gặp một nút mờ, một ô khoá hay một lần bị từ chối mà không biết
**vì sao** và **làm gì để gỡ**. "Không được phép", "Không thực hiện được", nút xám im lặng đều là lỗi giao diện, không phải
hành vi đúng.

## 1. Ba loại chặn

| Loại | Ví dụ | Phải hiện |
|---|---|---|
| **Đang xử lý** (tạm thời) | `disabled={busy}` lúc đang lưu, đang tải | chữ trên nút đổi ("Đang lưu…") hoặc vòng quay — không cần lý do |
| **Chặn theo điều kiện** (nút mờ, ô khoá) | thiếu quyền, kỳ đã khoá, phiếu đã ghi sổ, chưa chọn dòng, thiếu cấu hình, module chưa bật, chưa đủ cấp duyệt | **lý do + cách gỡ** ngay tại chỗ (§2) |
| **Chặn cứng** (máy chủ từ chối khi bấm) | 403 / 409 / 422, cổng kiểm, khoá kỳ, trigger CSDL | lỗi theo BIZCITY-ERRORS: `message` nói cái gì sai và làm gì tiếp (R-ERR-3), `details.remedy` hiện bằng `RemedyView`, có Mã tra cứu |

## 2. Luật

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **R-BLOCK-1** | Mọi điều khiển **bị chặn theo điều kiện** (nút, ô nhập, mục menu, thao tác hàng loạt) mang lời giải thích hai ý: **vì sao** (điều kiện cụ thể, vd "Kỳ 10/2026 của chi nhánh CN01 đã khoá") và **cách gỡ** (bắt đầu bằng động từ, kèm nơi làm — mã màn / liên kết — hoặc người cần nhờ, vd "Nhờ kế toán trưởng mở khoá ở ACC2"). Chỉ "Không được phép" là không đạt | SC-UI-1 (bánh cóc); RULE-REVIEW |
| **R-BLOCK-2** | Lời giải thích **thấy được trên mọi thiết bị**: rê chuột, phím Tab và chạm trên điện thoại. `title=` một mình chỉ là mức tối thiểu cho mã cũ (không hiện khi chạm); mã mới dùng thành phần dùng chung `BlockedHint` / prop `blocked` (§3), gắn `aria-describedby` | SC-UI-1; test giao diện |
| **R-BLOCK-3** | Lý do **đến từ nơi quyết định**: máy chủ quyết (quyền, trạng thái chứng từ, khoá kỳ, workflow) thì API trả lý do cùng danh sách việc làm được — không để giao diện đoán lại. Câu giải thích trùng câu lỗi máy chủ sẽ trả nếu cứ bấm | rà soát API; test |
| **R-BLOCK-4** | Một nhóm ô cùng bị khoá vì một lý do (vd phiếu đã ghi sổ) được giải thích **một lần** bằng dải thông báo đầu khối, có nút gỡ (vd "Bỏ duyệt", "Lập phiếu điều chỉnh"); các ô trong khối không cần lặp lại | RULE-REVIEW |
| **R-BLOCK-5** | **Không giấu** điều khiển mà người dùng có thể tự mở được (xin quyền, mở khoá kỳ, bật module, khai cấu hình) — hiện mờ kèm lý do. Chỉ giấu khi người đó không bao giờ dùng tới (khác vai trò hẳn, phân hệ không cài) | RULE-REVIEW |
| **R-BLOCK-6** | Chặn cứng không bao giờ là câu trơn: lỗi trả về theo R-ERR-3 + remedy (§4b), giao diện hiện `message`, các bước khắc phục và Mã tra cứu; không nuốt lỗi thành "Có lỗi xảy ra" | SC-ERR-*; R-ERR |

## 3. Thành phần dùng chung

- `apps/web/src/components/BlockedHint.tsx` <!-- [2026-11-10 10:52 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — S022-22: đã có --> — `blocked?: { why: string; fix?: string; screen?: string; help?: string } | null`:
  có giá trị thì điều khiển mờ, hiện ô giải thích khi rê / focus / chạm, đọc được bằng trình đọc màn hình.
- Lỗi máy chủ: `RemedyView`, khay Mã tra cứu (PHASE-019, PHASE-022).

## 4. Đo và chuyển dần

Đo 2026-11-10 (`apps/web/src`, 648 chỗ `disabled`): 82 đang xử lý, 74 có lý do, **492 chặn theo điều kiện chưa có lý do** ở 134 tệp.
SC-UI-1 (`tests/conformance/checks/ui/blocked.check.mjs`) là bánh cóc, nợ 467 chỗ ở `tests/conformance/baseline.json`: chỗ cũ vào baseline, chỗ mới phải có lý do. Chủ mỗi màn trả nợ khi chạm tệp; RULE-REVIEW bắt cả chỗ phép kiểm
tĩnh không thấy (ô khoá bằng `readOnly`, nút bị giấu).

## 5. Nhật ký

- **1.0 (2026-11-10):** bản đầu, theo chỉ đạo chủ dự án.

# ADR-0009 · Chính sách kế toán có phiên bản và ngày hiệu lực
<!-- [2026-10-30 08:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-009 — MCP ghi: lập nháp, đề xuất huỷ, luôn chờ duyệt; ADR-0009 đề xuất. -->
<!-- [2026-10-30 09:03 PM Johnny Chu - Chu Hoàng Anh] PHASE-005 — chính sách kế toán có phiên bản + ngày hiệu lực (ADR-0009). -->

- Trạng thái: **Chấp nhận** — chủ dự án (Johnny Chu) đồng ý 2026-10-30 ("đồng ý ADR-0009"), phương án A + gợi ý Q-2…Q-5. **Kế toán trưởng: chưa ký** — ghi tên + ngày vào đây khi duyệt (RULE-KERNEL K3)
- Ngày: 2026-10-30 · Mức Kernel: **K3** (đổi cách định khoản) — cần ADR, 2 người nhóm Lõi, kế toán trưởng ([RULE-KERNEL](../rules/RULE-KERNEL.md))
- Luật / hợp đồng liên quan: [`bizcity_compliance@1`](../contracts/BIZCITY-COMPLIANCE-v1.md) C-9 / STD-CMP-9, AP-5 (Version everything), [PHASE-005](../phases/PHASE-005-CHINH-SACH-CO-PHIEN-BAN/README.md), lộ trình 2.14, checklist G2-09

## Bối cảnh

Ma trận tuân thủ còn đúng một dòng **thiếu**: C-9 "Thay đổi chế độ kế toán". Rủi ro: **áp quy tắc mới vào chứng từ cũ**.

Hôm nay cấu hình định khoản chỉ có **một bản hiện hành** (`db/migrations/0003_goc_cau_hinh_dinh_khoan.sql`):

| Bảng | Quyết định gì |
|---|---|
| `posting_reasons` | lý do nhập / xuất / thu / chi → tài khoản đối ứng, doanh thu, chi phí, mã dòng tiền |
| `product_posting_groups` | nhóm hạch toán → tài khoản hàng, giá vốn, doanh thu, chiết khấu, hàng bán trả lại |
| `posting_defaults` | khoá mặc định (vd tiền đang chuyển) → tài khoản |
| `payment_methods`, `tax_codes`, `bank_accounts` | hình thức thanh toán, mã thuế, tài khoản ngân hàng → tài khoản |

`postingConfigRepository.loadPostingConfig` đọc bản hiện hành mỗi lần định khoản, nên:
- kế toán đổi tài khoản giá vốn ngày 15/11, rồi định khoản lại một phiếu tháng 10 → phiếu tháng 10 ghi theo tài khoản mới;
- `posting_log` không ghi phiếu được định khoản theo bản cấu hình nào.

**Tiền lệ trong code:** luật kết chuyển đã có bảng chụp phiên bản `closing_rule_versions` (`tenant_id`, `version`, `rules jsonb`, `note`, người tạo), và chứng từ kết chuyển lưu `rulesVersion` + `rulesHash`.

PHASE-004 đã đưa mọi đường ghi về hai chỗ: cửa nạp `postDocumentIn` và `eventStore`. Nhờ vậy ghi `policy_version` chỉ cần sửa ở hai chỗ đó.

## Các phương án

| | A. Bản chụp chính sách có ngày hiệu lực | B. Cột hiệu lực trên từng bảng cấu hình | C. Chỉ ghi băm cấu hình vào nhật ký |
|---|---|---|---|
| Cách làm | Bảng mới `posting_policy_versions(tenant_id, version, effective_from, snapshot jsonb, hash, note, created_by, created_at)`, **chỉ thêm**. Bảng cấu hình hiện tại thành **bản đang soạn**; nút "Phát hành chính sách" chụp lại thành một phiên bản kèm ngày hiệu lực. Định khoản chọn phiên bản có `effective_from` ≤ ngày hạch toán, lớn nhất | Thêm `effective_from` / `effective_to` vào từng dòng của 6 bảng; mọi truy vấn cấu hình lọc theo ngày | Lưu băm cấu hình hiện hành vào `posting_log`, không chọn theo ngày |
| Đạt C-9 | ✔ | ✔ | ✘ (chỉ truy vết, vẫn áp quy tắc mới cho chứng từ cũ) |
| Thay đổi code | `loadPostingConfig(db, tenant, skus, { asOf })` dựng `PostingConfig` từ bản chụp; màn Cấu hình thêm "Phát hành" + lịch sử phiên bản | Sửa mọi truy vấn và màn sửa của 6 bảng; khoá duy nhất theo khoảng ngày | Rất ít |
| Nhất quán | Cả bộ chính sách tại một ngày là **một bản**, so được hai bản (diff) | Từng dòng có hiệu lực riêng: dễ ra tổ hợp chưa từng được ai duyệt | — |
| Chi phí | Mỗi bản chụp vài chục KB (vài trăm lý do / nhóm) | Không thêm dung lượng | Không |
| Bất biến | Bảng phiên bản chỉ thêm (trigger như `ledger_*`) | Sửa dòng cũ vẫn có thể (cần trigger phức tạp) | — |

## Đề xuất: phương án A

**Lý do:** đúng mô hình tiền lệ `closing_rule_versions`; bộ chính sách luôn là một bản đã được người có quyền phát hành; ít đụng code nhất trong hai phương án đạt C-9.

1. **Migration mới** (số kế tiếp):
   - bảng `posting_policy_versions`, chỉ thêm, có `COMMENT ON`;
   - `posting_log.policy_version integer`;
   - `ledger_entries.policy_version integer` (bút toán biết mình theo bản nào);
   - **bản 1** chụp từ cấu hình hiện tại của từng đơn vị, `effective_from = '1900-01-01'`. Chứng từ cũ vì thế có cùng kết quả như hôm nay.
2. **Phạm vi bản chụp:** `posting_reasons`, `product_posting_groups`, `posting_defaults`, phần tài khoản của `payment_methods`, `tax_codes`, `bank_accounts`.
   - **Không** chụp hệ thống tài khoản (`accounts`).
   - **Không** chụp gán mặt hàng → nhóm (`products.posting_group_code`): đó là danh mục, đổi nhóm của một mặt hàng là sửa danh mục, không phải đổi chính sách.
3. **Định khoản:** cửa nạp và `eventStore` lấy bản theo **ngày hạch toán**, ghi `policy_version` vào `posting_log` và `ledger_entries`.
4. **Phát hành:** action `accounting.policy.publish` (quyền `settings:write`, bằng chứng tự động). `effective_from` không được rơi vào kỳ đã khoá. Phát sự kiện `bizcity.posting.policy.published`.
5. **Tự chẩn đoán mới:** mọi bút toán sau migration có `policy_version`; phiên bản dùng khớp với ngày hạch toán.
6. **Năng lực** `posting.policy-version` → available; C-9 đạt.

## Cần chủ dự án / kế toán trưởng chốt

| # | Câu hỏi | Gợi ý |
|---|---|---|
| Q-1 | Chọn phương án A? | A |
| Q-2 | Định khoản lại chứng từ cũ: **luôn** dùng bản theo ngày hạch toán, hay cho kế toán chọn "dùng bản mới nhất" khi cố ý sửa cấu hình sai? | Mặc định theo ngày. Cho chọn bản mới nhất chỉ với quyền `settings:write`, bắt buộc lý do, ghi bằng chứng |
| Q-3 | Phạm vi bản chụp như mục 2 (không gồm hệ thống tài khoản, không gồm gán mặt hàng → nhóm)? | Đồng ý |
| Q-4 | Ngày hiệu lực có được lùi về quá khứ (kỳ chưa khoá) không? | Được, nếu kỳ chưa khoá. Màn phát hành báo số chứng từ đã ghi sẽ khác nếu định khoản lại |
| Q-5 | Gói định khoản theo ngành (PHASE-012) cài vào sẽ thành một phiên bản chính sách mới? | Có: cài gói = phát hành một bản, `note` ghi tên gói + phiên bản gói |

## Quyết định khi làm (2026-10-30, PHASE-005)

Phương án A, với một **tinh chỉnh** so với mục 4 ("sửa cấu hình xong mà chưa phát hành thì chưa có hiệu lực"):
- **Sửa cấu hình hằng ngày không cần bấm phát hành.** Lần định khoản sau, nếu cấu hình đang dùng khác bản đứng đầu, hệ thống tự chụp một bản `amend` **cùng ngày hiệu lực** với bản đứng đầu. Sửa có tác dụng ngay như trước; mỗi bút toán vẫn ghi đúng bản đã dùng.
- **Phát hành** (`accounting.policy.publish`) chỉ dùng khi **đổi chế độ**: bản `publish` mang ngày hiệu lực mới. Sửa sau đó là sửa chế độ mới (bản `amend` cùng ngày hiệu lực đó). Chế độ cũ giữ nguyên cho chứng từ trước ngày hiệu lực.
- **Lý do:** giữ nguyên thói quen làm việc và hơn trăm phép thử đang dựa vào "sửa xong là định khoản theo cấu hình mới"; vẫn đạt C-9.
- **Giới hạn đã biết:** khi đã phát hành chế độ hiệu lực ở tương lai, mọi chỉnh sửa áp cho chế độ tương lai đó, không sửa được chế độ đang áp hôm nay. Đúng cho quy trình chuẩn bị chuyển chế độ; nếu cần sửa cả hai thì phát hành lại.
- **Q-2** (cho chọn "bản mới nhất" khi định khoản lại): chưa làm — mặc định luôn theo ngày hạch toán. Ghi ở PHASE-005 (S005-7).

Hiện thực: migration `0040`, `modules/posting-config/policy.ts`, `policy.actions.ts`, tự chẩn đoán `POLICY_VERSION` / DG-POL-1, `test/policy.test.ts`. Sổ không đổi: cùng 9 tệp test định khoản trên code cũ / mới → 128 ô sổ cái trùng.

## Hệ quả

- **Tốt:**
  - C-9 đạt, nên ma trận tuân thủ đủ 9 dòng có cách thực thi;
  - chứng từ cũ không bị quy tắc mới làm đổi số;
  - kiểm toán trả lời được "phiếu này định khoản theo quy tắc nào, ai duyệt quy tắc đó".
- **Phải trả:**
  - màn Cấu hình định khoản thêm bước "Phát hành";
  - sửa cấu hình xong mà chưa phát hành thì chưa có hiệu lực. Đây là thay đổi thói quen của kế toán, cần hướng dẫn.
- **Không đổi:** kết quả sổ của mọi chứng từ đã ghi (bản 1 = cấu hình hiện tại). Kiểm lại bằng cách so mốc sổ trước / sau như T004-1.

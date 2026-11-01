# Kho nguồn pháp lý — cách thêm và rà một văn bản
<!-- [2026-11-01 11:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — hướng dẫn kho nguồn pháp lý máy đọc: hồ sơ một văn bản, hiệu lực theo điều khoản và theo năm tài chính, ảnh chụp có băm, thế nào là đã rà (R-VNC-1). -->

> Luật: [R-VNC-1, R-VNC-5](../rules/RULE-VN-CONFORMANCE.md) · Tệp: `tests/conformance/vietnam/registry/legal-sources.json` · Schema: `tests/conformance/vietnam/schemas/legal-source.schema.json` (`bizcity_vn_legal_registry@1`) · Kiểm: SC-VNC-1, SC-VNC-2

## 1. Một văn bản = một hồ sơ

| Trường | Ghi gì | Lưu ý |
|---|---|---|
| `id` | `vn.<kind>.<số-hiệu-thường>` — `vn.circular.99-2025-tt-btc` | Ổn định; rulepack trỏ bằng id này |
| `kind`, `domain` | loại văn bản; **miền**: `accounting` · `tax` · `invoice` · `tax_admin` · `standard` | Ba miền kế toán / thuế / hoá đơn **không hoán đổi** (R-VNC-5) |
| `issued_on`, `effective_from`, `effective_to` | ngày ban hành, hiệu lực chung | `null` khi chưa đọc được từ văn bản gốc |
| `applies_to.fiscal_year_start_from` | áp cho **năm tài chính** bắt đầu từ ngày này | TT99/2025: `2026-01-01` — năm tài chính 01/7/2025–30/6/2026 **không** tự chuyển ngày 01/01/2026 |
| `provisions[]` | điều / khoản / điểm có hiệu lực riêng, tóm tắt một câu, `review_status` | Luật 108/2025/QH15 có ngoại lệ hiệu lực sớm ⇒ phải tách provision |
| `replaces`, `amended_by`, `related` | quan hệ với văn bản khác (id trong kho, hoặc số hiệu nếu chưa có hồ sơ) | |
| `official_url` | Công báo (congbao.chinhphu.vn), vanban.chinhphu.vn, vbpl.vn, mof.gov.vn | `null` ⇒ không được `reviewed` |
| `secondary_urls` | bài phân tích, nguồn thứ cấp | chỉ để đọc nhanh, **không là căn cứ** |
| `snapshot` | `retrieved_at`, `sha256` của bản PDF / HTML đã tải, `consolidated_version` | `reviewed` đòi có `sha256` |
| `review` | `status`, `reviewed_at`, `reviewed_by`, `notes` | người có trách nhiệm; không ghi tên agent / model (SC-VNC-2 `agent-name:*`) |

## 2. Thế nào là "đã rà" (`review.status = reviewed`)

1. Đã mở **văn bản gốc** tại link chính thức (không chỉ đọc tóm tắt), lưu ảnh chụp và băm.
2. Đã kiểm **tình trạng hiệu lực** tại ngày rà: còn hiệu lực / đã sửa / đã thay; điền `amended_by`, `replaces`.
3. Đã đọc từng `provisions[]` mà rulepack cần và xác nhận `ref` đúng số điều / khoản / điểm; không còn `REVIEW_REQUIRED`.
4. Ghi `reviewed_by` (người), `reviewed_at`, và ghi chú điều chưa chắc.

Quá **6 tháng** chưa rà lại ⇒ Nhóm Lõi mở issue "Detect" (RULEPACK-GOVERNANCE §3 bước 1). Khi bản phát hành rulepack dựa trên nguồn đã quá hạn rà, kết quả ca là `REVIEW_REQUIRED` (duyệt hết hạn, R-VNC-4).

## 3. Hiện trạng kho (2026-11-02)

17 văn bản chép từ [`docs/can-cu/01-danh-muc-van-ban.md`](../can-cu/01-danh-muc-van-ban.md) (rà 13/10/2026 bởi người viết tài liệu) và đặc tả OKT-SPEC-VNCONF-001 §3.1. **Tất cả `pending`**: chưa ảnh chụp, chưa băm, phần lớn chưa có link chính thức. Vì vậy chưa rulepack nào có thể `approved` — đúng nguyên tắc fail-closed.

Điểm cần người duyệt chú ý khi rà đợt đầu:

| Văn bản | Việc cần làm |
|---|---|
| Thông tư 99/2025/TT-BTC | Dẫn đúng điều khoản hiệu lực + chuyển tiếp theo năm tài chính (hiện `REVIEW_REQUIRED`); xác nhận với Hỏi đáp Bộ Tài chính 159102 |
| Thông tư 152/2025/TT-BTC | Hộ, cá nhân kinh doanh từ 01/01/2026: xác nhận số hiệu, ngày ban hành, link Công báo (mới thêm 02/11, chưa có trong docs/can-cu) |
| Thông tư 200/2014/TT-BTC | Dẫn điều khoản chuyển tiếp của TT99 cho phần TT200 còn áp dụng (cổ phần hoá DNNN); năm tài chính lệch năm dương lịch |
| Thông tư 133/2016/TT-BTC | Repo chỉ có mã chế độ trong enum gói định khoản; cần điều kiện lựa chọn và các sửa đổi hiện hành trước khi làm ca C02 cho SME |
| Luật Quản lý thuế 108/2025/QH15 | Tách provision hiệu lực sớm (hộ kinh doanh 01/01/2026) khỏi hiệu lực chung 01/7/2026 |
| Nghị quyết 204/2025/QH15 + NĐ 174/2025 | Giảm 2% hết 31/12/2026: rulepack VAT phải có `transaction_date_to` |
| Luật 149/2025/QH15, NĐ 181/2025, TT 32/2025 | Đặc tả không nhắc; docs/can-cu có ghi — xác nhận có / không, ngày hiệu lực |
| Luật Kế toán 88/2015/QH13 | Dẫn số điều về chứng từ kế toán (hiện `REVIEW_REQUIRED`); xác nhận văn bản hợp nhất 41/VBHN-VPQH |

## 4. Quan hệ với tài liệu khác

- Sửa kho ⇒ cập nhật [`bizcity_compliance@1` §3](../contracts/BIZCITY-COMPLIANCE-v1.md) và [`docs/can-cu/`](../can-cu/01-danh-muc-van-ban.md) trong cùng PR nếu nội dung đổi (CANON §5).
- Kho **không** lưu trong PostgreSQL ở MVP: tệp trong Git, phát hành bất biến cùng rulepack; CSDL chỉ cần khi có quy trình động (đặc tả §4).

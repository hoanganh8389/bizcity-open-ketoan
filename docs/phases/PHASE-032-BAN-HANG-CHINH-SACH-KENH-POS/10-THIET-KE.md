# PHASE-032 · 10 — Thiết kế: luồng, màn hình, ánh xạ CTKM TGS
<!-- [2026-11-09 10:38 AM Johnny Chu - Chu Hoàng Anh] PHASE-032 — chỉ đạo: giao Võ Hoàng (nhóm POS TGS) mở phase phần UI / UX, luồng, xử lý chi tiết của chính sách bán hàng trên nền PHASE-031; quy trình pull → phân tích → phase → bản mẫu duyệt → checklist → code trên nhánh PR (chưa duyệt nội dung) -->
<!-- [2026-11-09 09:30 PM Võ Hoàng] PHASE-032 — luồng soạn → thử → phát hành → ngừng; POS tải → tính → gửi; hoàn / đổi; ngoại tuyến; ánh xạ; quy tắc màn (đóng góp) -->

## 1. Vòng đời một chương trình

```text
 Bản nháp ──(Phát hành)──► Bản 1 hiệu lực ──(Sửa → phát hành bản mới)──► Bản 1 đóng ở ngày-1, Bản 2 hiệu lực
    ▲  (lưu dở, chia sẻ;                    │
    │   không phải bước duyệt)              └──(Ngừng, P032-4)──► bản retired, POS thôi áp từ ngày ngừng
```

- Trạng thái hiện trên màn chỉ có 4: **Nháp · Sắp chạy** (effectiveFrom > hôm nay) **· Đang chạy · Đã ngừng / hết hạn**. Lấy từ phong bì Registry + cửa sổ trong nội dung; không tính lại ở trình duyệt (như HT15).
- **Sửa** một chương trình đang chạy = mở form với nội dung bản hiện hành → phát hành **bản mới**; màn ghi rõ "Bản 3 sẽ thay bản 2 từ ngày …". Bản đã phát hành không sửa được (ECP-13).
- **Áp lùi** (effectiveFrom < hôm nay): ô lý do bắt buộc (≥ 3 ký tự, đúng luật `publishPolicy`), hiện cảnh báo "đơn POS đã gửi từ ngày … sẽ bị đánh IN-POL-003 (bản cũ)".

## 2. Soạn & phát hành

1. Chọn **loại** → danh sách Rule Contract (`GET /api/v1/rule-contracts`), mỗi loại một câu mô tả và ví dụ.
2. **Form sinh từ `describe().params`** (D032-3): `buy.sku` → ô chọn mặt hàng (tra `GET /api/v1/items`, lưu cả `itemId`); số → ô số; `validFrom/To` → chọn ngày. Phạm vi: chi nhánh (`branchCodes`), kênh (`channels`: `pos`, `web`, `san`).
3. **Kiểm khi gõ** bằng chính zod của Rule Contract (qua lỗi 422 của API — không chép luật về trình duyệt): lỗi hiện dưới đúng ô theo `path`.
4. **Thử tính** (P032-3): nhập một giỏ mẫu (hoặc chọn từ vectors của Rule Contract) → xem quà / giảm, câu `explain`, `treatment` (kèm nhãn *chưa xác nhận* khi `confirmed = false`).
5. **Phát hành**: hộp xác nhận tóm tắt *mã · bản mới · từ ngày · phạm vi · băm sẽ ra*; gọi `POST /api/v1/policies` với `Idempotency-Key`. Thành công → về màn *Một chương trình*.

## 3. POS: tải → tính → gửi (W3)

```text
POS React / plugin WP                     open-ketoan
──────────────────────                    ───────────
GET /api/v1/policies?at=D&branch=B&channel=pos  ──►  bản hiệu lực + params + etag
(lưu máy, so etag mỗi 5 phút / khi nhận policy.published)
tính trên máy bằng bản viết lại (vectors 100 %)
chốt đơn ──► POST /api/v1/documents (sale, docKey pos:B:sale:<uuid>)
            policyRefs[{key,version,hash}], lines[].policyRef{key,version,line}
                                          ──►  L4b IN-POL-001..003 (+004 khi W2b) → ghi sổ / hàng việc
```

- **Ngoại tuyến**: POS dùng bản đã lưu; đơn gửi muộn mang đúng bản lúc bán → cửa nạp có thể ra IN-POL-003 (đã có bản mới) — **cảnh báo, không chặn**, đúng thiết kế 031.
- **Hoàn hàng** (`sale_return`): mang lại `policyRefs` của đơn gốc; quà phải trả kèm theo tỉ lệ (luật TGS, làm tròn xuống), không tính lại theo bản mới.
- **Đổi hàng**: một `sale_return` + một `sale` mới (bản chính sách tại ngày đổi); liên kết bằng `originalDocKey`.
- **Huỷ đơn**: `POST /api/v1/documents/cancel`, không gửi `policyRefs` mới.

## 4. Ánh xạ CTKM TGS → Rule Contract (D032-5)

| Loại TGS | Tên | Rule Contract | Đợt |
|---|---|---|---|
| 2 | Mua X tặng Y | `sale.promo.buy_x_get_y@1` (đã có) | W1 |
| 1 | Giảm % / tiền theo sản phẩm | `sale.promo.discount@1` (`target: line`) | W2 |
| 5 | Giảm theo tổng đơn | `sale.promo.discount@1` (`target: order`, ngưỡng) | W2 |
| 10 | Voucher / mã giảm giá | `sale.promo.discount@1` (`couponRequired`, giới hạn lượt ở POS) | W2 |
| 3, 4, 6–9 | Combo, giá theo lô, tích điểm… | chưa — giữ ở plugin | sau |

Khuôn đề xuất `sale.promo.discount@1` (chốt ở PR thiết kế W2):
`{ target: 'line' | 'order', items?: {sku,itemId?}[], minQty?, minAmount?, kind: 'percent' | 'amount', value, maxDiscount?, couponRequired?, validFrom?, validTo? }` → `{ discounts: [{ lineKey?, amount }] }`; `treatment: [{ on: 'discount', reasonCode: <S031-14>, confirmed: false }]`.

<!-- [2026-11-09 11:15 PM Võ Hoàng] PHASE-032 — Q032-6 chốt (quà theo Core: XTA1.4); thêm đề xuất trả lời Q032-1..4; áp sổ tay HUONG-DAN-LAM-VIEC (phiếu nghiệm thu trước khi code, quy ước giao diện §7) (đóng góp) -->

## 5. Quy tắc màn hình (theo [HUONG-DAN-LAM-VIEC §7](../../HUONG-DAN-LAM-VIEC.md))

1. Một cách đếm: số trên màn là số API trả (như HT15).
2. Không có nút *Xoá* chính sách đã phát hành; chỉ *Ngừng*. Nháp xoá được.
3. Quyền: xem `catalog:read`; soạn / phát hành / ngừng `settings:write` — thiếu quyền thì **ẩn** nút.
4. Trạng thái rỗng giải thích một câu; lỗi API hiện theo mã (`IN-POL-*`, lỗi zod) có liên kết `docs/huong-dan`.
5. Mọi chữ tiếng Việt có dấu, theo từ điển thuật ngữ; tiền dạng `1.234.000 ₫`; ngày `dd/mm/yyyy`.
6. Mỗi màn có nút **Hướng dẫn** mở `docs/huong-dan/<màn>.md`; mọi cột, ô số, tiêu đề có chú thích rê chuột nói **nghĩa + cách tính**.
7. Form không trắng: điền sẵn ngày áp = mai, phạm vi = chi nhánh đang làm, kênh = POS, mã gợi ý kế tiếp; chọn mặt hàng / chi nhánh bằng **ô tìm**, không xổ xuống dài; chặn số âm ở màn và máy chủ.
8. Mở chương trình ở chế độ **xem**, bấm *Sửa → bản mới* mới vào form (`viewFirst`); bảng cột kéo giãn được (`lib/colResize.ts`).
9. Không ghi tên người (người góp ý, kế toán) trong mã, tài liệu, dữ liệu mẫu.
10. Màn dùng `@bizcity/ui-kit`; chạy được ở bề ngang điện thoại (cửa hàng xem trên máy POS / điện thoại).

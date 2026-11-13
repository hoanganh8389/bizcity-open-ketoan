# Cài đặt bán hàng: chênh lệch két khi chốt ca, tài khoản hàng bán bị trả lại (chữ chốt đợt 3 Bán hàng)
<!-- [2026-11-13 06:30 PM Võ Hoàng] NGHIEM-THU — chữ chốt đợt 3 Bán hàng: phiếu kế toán chênh lệch két (manual_journal theo lý do), sửa lọc 5212 / 5213 ở ACC41 (migration 0132), màn BH17 gom cài đặt bán hàng (phiếu NT-BH-014) (đóng góp) -->

Phiếu nghiệm thu: [NT-BH-014](../nghiem-thu/ban-hang/NT-BH-014-cai-dat-ban-hang.md). Nghiệp vụ đã chốt 13/11: NT-BH-007 Q1 (chênh lệch két lập chứng từ), NT-BH-005 R12 (hàng bán bị trả lại 52131).

## 1. Vấn đề

| # | Hiện trạng trên `main` | Hệ quả |
|---|---|---|
| A | Chốt ca chỉ lưu biên bản chênh lệch két (`mod_pos.shifts.difference`), không lập chứng từ | Tiền thiếu / thừa không lên sổ; kế toán phải lập tay từng ca |
| B | Bảng loại ở ACC41 (`db/seeds/tai-khoan-ngam-dinh-theo-loai.jsonl`, 0126) đặt **5212 = trả lại, 5213 = giảm giá** theo tên Thông tư 200. Hệ thống tài khoản của đơn vị (`tai-khoan.csv`) lại là **5212 = Giảm giá hàng bán, 5213 = Hàng bán bị trả lại** (52131 trả lại bán lẻ) | Dòng "Hàng bán trả lại …" hiện mặc định 52131 (lấy từ bộ định khoản) nhưng lọc 5212 → bấm Ghi báo "52131 không nằm trong danh sách lọc"; dòng "Giảm giá hàng bán" mặc định rơi vào tài khoản trả lại |
| C | Cài đặt của bán lẻ nằm rải: BH17 (4 tham số máy bán), chế độ ghi sổ ở hộp thoại ACC14, tài khoản ở ACC41; menu có mục mờ "Định khoản bán hàng" | Kế toán bán hàng không có một chỗ xem / sửa cài đặt bán hàng |

## 2. Lựa chọn

**A — phiếu kế toán theo lý do, module chỉ kể sự việc.**
- Chốt ca có chênh lệch ≠ 0 → module `pos` nộp **một** `manual_journal` qua `ctx.ledger.submit` (cửa nạp có sẵn, luật `journal.rule.ts`), dòng mang `reasonCode`. Module không viết số tài khoản (bốn câu, câu 4).
- Hai lý do loại `journal` mặc định (kế toán đổi tài khoản được):

  | Lý do | Tên | Nợ | Có |
  |---|---|---|---|
  | `POS-THIEU-KET` | Thiếu tiền két chờ xử lý (máy bán POS) | 1381 | 1111 |
  | `POS-THUA-KET` | Thừa tiền két chờ xử lý (máy bán POS) | 1111 | 3381 |

- Lý do tạo / sửa từ màn BH17 qua API công khai của Core `PUT /api/v1/posting/reasons/:code` (người dùng có quyền ghi danh mục). Module không ghi bảng `posting_reasons`.
- Bật / tắt bằng khoá mới của module: `bizcity.pos.cash_diff_journal` (boolean, mặc định **bật** theo chốt Q1). Mã hai lý do giữ ở khoá `bizcity.pos.cash_diff_reasons` (`{ short, over }`, mặc định như bảng trên).
- Đã chọn không làm: Kernel tự sinh phiếu từ biên bản ca (ngoài phạm vi phân hệ); lập phiếu thu / chi tiền mặt (chênh lệch chưa rõ nguyên nhân là tài sản thiếu / thừa chờ xử lý, không phải thu / chi).

**B — sửa dữ liệu mẫu và đơn vị đang có, không đổi code định khoản.** <!-- [2026-11-13 08:00 PM Võ Hoàng] NGHIEM-THU — phần B chuyển cho Nguyễn Văn Thủy (người làm bảng loại 0126): chờ xác nhận danh mục tài khoản thật của TGS (5212 / 5213) trước khi sửa (đóng góp) -->

> **13/11 tối:** phần B **chuyển cho Thủy** (người làm bảng loại 0126), làm ở dòng giữ chỗ riêng sau khi kế toán TGS xác nhận 5212 / 5213 trong danh mục tài khoản thật. Hướng sửa dưới đây là đề xuất, chưa chốt. Đợt 3 Bán hàng chỉ làm A và C.
- `tai-khoan-ngam-dinh-theo-loai.jsonl`: các dòng **Hàng bán trả lại** (cột TK trả lại) lọc `3387; 5213; 711`, mặc định `5213`. Các dòng **Giảm giá hàng bán** (cột TK giảm giá) lọc `3387; 5212; 711`, mặc định `5212`. Dòng đại lý / uỷ thác (331, 3388) giữ nguyên.
- Migration `0132_tai_khoan_tra_lai_5213.sql`: đổi đúng các cột đó ở `account_default_types` của mọi đơn vị.
  - Chỉ đổi lọc khi lọc còn đúng giá trị gốc của 0126 (kế toán đã sửa tay thì giữ).
  - Mặc định chỉ đổi khi đang là 5212 / 5213 hoặc tài khoản con của chúng nằm sai bên. Tài khoản chi tiết cụ thể thì đơn vị chọn lại ở ACC41.
  - Không đụng `posting_defaults` (đang đúng 52131), không đụng sổ.

**C — BH17 thành *Cài đặt bán hàng* chung (màn của module `pos`).** Bốn khối:
1. Máy bán tại quầy: 4 tham số có sẵn.
2. Ghi sổ chứng từ bán: `sale`, `sale_return` = ghi ngay / chờ duyệt.
   - Đọc / ghi `GET` / `PUT /api/v1/settings/posting-modes`.
   - PUT thay **cả** bảng, nên màn gộp với giá trị hiện có của loại khác rồi mới gửi.
3. Chênh lệch két: bật / tắt; hai lý do với TK Nợ / Có.
   - Hiện trạng thái "đã có lý do / chưa có".
   - Nút **Tạo lý do mặc định** tạo hai lý do theo bảng trên.
4. Tài khoản hạch toán bán hàng:
   - Danh sách chỉ đọc các loại nhóm *Bán hàng* của ACC41 (`GET /api/v1/account-default-types`), cột TK Nợ / TK Có.
   - Nút **Sửa ở ACC41**.
   - Thay mục mờ "Định khoản bán hàng" ở menu và ô cùng tên ở Luồng chi tiết.
   - Không làm màn quy tắc điều kiện riêng: Core đã bỏ dòng thêm có điều kiện ở ACC41 (commit 558e12b1).

Để sang đợt 4 (Chính sách bán): hạn nợ khách mặc định, cảnh báo bán dưới giá vốn, chặn vượt hạn mức nợ (`sale.credit_limit@1`).

## 3. Hình dạng

Chứng từ nộp khi chốt ca (lệch −10.000, chi nhánh `CH01`):

```json
{
  "docType": "manual_journal",
  "docKey": "pos:shift:<shiftId>:cash-diff",
  "sourceSystem": "pos",
  "branchCode": "CH01",
  "docDate": "<ngày chốt ca>",
  "description": "Chênh lệch két ca <giờ mở>–<giờ chốt>, thu ngân <tên>",
  "lines": [{ "lineKey": "1", "reasonCode": "POS-THIEU-KET", "amount": 10000, "partnerCode": "CN-CH01",
              "description": "Thiếu tiền két: phải có 1.330.000, đếm 1.320.000" }],
  "totals": { "total": 10000 }
}
```

- Thừa → `POS-THUA-KET`, `amount` = số thừa. Lệch 0 hoặc khoá tắt → không nộp.
- Đối tượng `CN-<mã chi nhánh>`: 1381 / 3381 theo dõi đối tượng, giống phiếu tất toán kiểm kê kho.
- `docKey` cố định theo ca: gửi lại không ghi trùng. Ca không mở lại được nên không có huỷ.
- Lý do chưa có / thiếu tài khoản → Kernel từ chối định khoản. Ca **vẫn chốt**, chứng từ nằm ở ACC14 thẻ *Lỗi*; kế toán tạo lý do rồi *Ghi sổ lại*.
- Biên bản ca lưu `journalDocKey` và trạng thái chứng từ để Sổ ca (BH15) hiện "đã lập phiếu kế toán / lỗi".
- Manifest `modules/pos/bizcity.module.json`, mục `ledger.submits` thêm: `{ "docType": "manual_journal", "contract": "bizcity_ledger_intake@1", "reasons": { "kind": "journal" } }`.

Khoá cấu hình mới (`modules/pos/settings.registry.json`, lớp B, `affectsPosting: true`):

| Khoá | Kiểu | Mặc định |
|---|---|---|
| `bizcity.pos.cash_diff_journal` | boolean | `true` |
| `bizcity.pos.cash_diff_reasons` | `{ short: string, over: string }` | `{ "short": "POS-THIEU-KET", "over": "POS-THUA-KET" }` |

## 4. Ảnh hưởng

- Sổ: thêm bút toán 1381 / 1111 hoặc 1111 / 3381 cho ca lệch két, sau khi khoá bật (đơn vị đang có: bật từ lúc cập nhật; ca đã chốt trước đó không lập bù).
- ACC41: đơn vị đang có đổi lọc, mặc định hai nhóm dòng trả lại / giảm giá; bộ định khoản không đổi (52131 vẫn là TK trả lại).
- Menu Bán hàng, Luồng chi tiết: bỏ mục mờ "Định khoản bán hàng", trỏ vào khối ④ của BH17.
- Không đổi Kernel, Platform, hợp đồng, SDK.

## 5. Kiểm bằng gì

- Test module `pos`: chốt ca thiếu 10.000 → một `manual_journal` 1381 / 1111 10.000; thừa → 1111 / 3381; lệch 0 / khoá tắt → không có chứng từ; chốt lại → `POS_SHIFT_CLOSED`, không chứng từ thứ hai; lý do chưa có → ca vẫn chốt, chứng từ lỗi.
- `apps/api/test/tai-khoan-tra-lai-5213.test.ts` (đề xuất, viết ở PR code): đơn vị mới và đơn vị đã có (sau migration) — dòng trả lại lọc 5213 và Ghi được 52131; dòng giảm giá lọc 5212; dòng đã sửa tay giữ nguyên.
- `npx bizcity module check pos`, selfcheck, kiem-chuan; chạy thật Docker: chốt ca lệch, xem phiếu ở ACC14, sổ cái 1381.

## 6. Làm thật khác chữ chốt (13/11, PR code đợt 3)
<!-- [2026-11-13 10:30 PM Võ Hoàng] NGHIEM-THU — ghi các điểm làm thật khác chữ chốt §2–§3 (đóng góp) -->

| # | Chữ chốt | Làm thật | Vì sao |
|---|---|---|---|
| 1 | Lý do chưa có → Kernel lưu chứng từ trạng thái lỗi ở ACC14, kế toán *Ghi sổ lại* | Core **từ chối ngay lúc nhận** (`POSTING_FAILED`, cả ở chế độ chờ duyệt). Module bọc lần nộp trong SAVEPOINT; từ chối thì quay lui đúng phần phiếu, ca vẫn chốt, biên bản ghi `journal.status = not_created` + câu lỗi. Sổ ca có nút **Lập lại phiếu kế toán** (`POST /api/v1/m/pos/admin/shifts/:id/journal`, quyền `documents:write`) | Bắt lỗi mà không quay lui thì Core để lại sự việc dở trong `accounting_events` (đã thấy trong test) |
| 2 | Khoá `bizcity.pos.cash_diff_reasons` kiểu `{ short, over }` | Hai khoá chuỗi `bizcity.pos.cash_short_reason`, `bizcity.pos.cash_over_reason` | Kho cài đặt (`checkSettingValue`) chưa nhận kiểu object |
| 3 | Manifest `ledger.submits` khai `reasons: { kind: "journal" }` | Khai `manual_journal` **không** kèm `reasons` | Khuôn manifest (BIZCITY-MODULE-v1.schema) chỉ nhận `kind` in / out / receipt / payment — thêm `journal` là đổi hợp đồng của Core, để đề xuất riêng |
| 4 | — | Lỗi của nút Lập lại phiếu chỉ có câu báo, chưa có mã `reason` | Thêm mã vào `ERROR_REASONS` là đổi `packages/contracts` — để đợt sau nếu máy cần phân biệt |
| 5 | Phiếu kế toán theo chế độ ghi sổ | Mặc định **chờ duyệt** (chế độ của loại `manual_journal`, dùng chung cho mọi phiếu kế toán phân hệ lập); BH17 chỉ hiện chế độ, đổi ở ACC14 | Đổi ở BH17 sẽ đổi luôn phiếu kiểm kê kho của phân hệ Kho |

Phần B (ACC41 5212 / 5213) chuyển cho Thủy — xem ghi chú ở §2.

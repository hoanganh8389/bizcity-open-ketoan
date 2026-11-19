<!-- [2026-11-19 Nguyễn Văn Thủy] Quy chuẩn sổ chứng từ chung (Document Kernel) và cách đưa một loại chứng từ mới vào sổ (đóng góp) -->
# 26. Sổ chứng từ chung: quy chuẩn và cách đưa chứng từ mới vào

> Áp dụng từ migration **0166** (19/11/2026). Chuẩn gốc: [BIZCITY-DOCUMENT-v1](../contracts/BIZCITY-DOCUMENT-v1.md).
> Ai làm phân hệ nào (bán hàng, chính sách bán, khách hàng thân thiết…) thì đưa chứng từ của phân hệ đó vào sổ theo đúng tài liệu này.

## 1. Nguyên tắc

```
Document Kernel   business_documents · document_versions · document_links · document_attachments
                  mọi chứng từ ERP, kể cả chưa ghi sổ
      ↓
Vòng đời          Nháp → Trình → Duyệt → Thực hiện → Hoàn tất  (+ Huỷ)
      ↓
Phân hệ           nội dung chuyên môn (dòng hàng…) ở bảng của phân hệ
      ↓
Accounting Kernel accounting_events → ledger_entries: CHỈ khi có sự việc kế toán (ghi sổ)
```

1. **Không đụng `accounting_events`.** Bảng này chỉ chứa bút toán đi vào sổ. Hợp đồng, đơn đặt, chính sách, đề nghị thanh toán… không vào đây.
2. **Mọi chứng từ có một dòng trong `business_documents`**, ghi bằng **trigger** trên bảng nguồn của phân hệ. Không ghi tay từ code, nhờ vậy mọi đường nhập (giao diện, API, Excel, test) đều vào sổ.
3. **Không thêm bảng** cho lịch sử, phiên bản, đính kèm, liên kết. Dùng 4 bảng chung ở trên. Lịch sử / lượt chạy chỉ để xem lại thì ghi JSONL (`packages/platform/src/core/run-log.ts`).
4. Dòng chi tiết vẫn ở bảng phân hệ. Đầu phiếu chung chỉ giữ định danh, trạng thái, phiên bản, liên kết.

## 2. Bốn bảng chung

| Bảng | Trả lời câu hỏi | Nội dung |
|---|---|---|
| `business_documents` | Đây là chứng từ gì? | `doc_ref`, `module`, `doc_type`, số, ngày, chi nhánh, đối tượng, tổng tiền, `status_raw`, `status`, `version`, `meta` (JSON), người tạo, người duyệt |
| `document_versions` | Chứng từ đã đổi thế nào? | Bản chụp nội dung mỗi lần đổi, người sửa, thời gian, mã băm |
| `document_links` | Liên quan chứng từ nào? | `source` lập từ · `applies` áp chính sách / thuộc hợp đồng · `uses` dùng lô · `ledger` sinh sự việc kế toán · `settles` thanh toán cho · `reverses` · `replaces` |
| `document_attachments` | Tệp đính kèm? | Bản scan, biên bản, hoá đơn |

## 3. Tên loại chứng từ `doc_type`

Dạng `<nghiệp vụ>.<loại>`, đặt theo **chứng từ đó là gì**, không theo phân hệ sinh ra nó (phân hệ đã có cột `module`).

| Nghiệp vụ | Dùng cho |
|---|---|
| `purchase.*` | hợp đồng mua, đơn đặt, chi phí mua, thưởng NCC, trả trước |
| `inventory.*` | mọi phiếu làm đổi tồn: `receipt` nhập, `issue` xuất, `transfer` chuyển kho, `exchange` đổi hàng |
| `finance.*` | tiền: `payment` trả tiền, `payment_request` đề nghị thanh toán |
| `pricing.*` | chính sách giá, chương trình |
| `sales.*` | bán hàng (chưa đưa vào, xem §6) |
| `contract.*` | hợp đồng không thuộc mua hàng (thuê, dịch vụ, tín dụng) |

Đang có trong sổ:

| `doc_ref` | Bảng nguồn | `doc_type` |
|---|---|---|
| `hop-dong.contract:<số HĐ>` | `dimensions` (kind contract) | `purchase.contract`, `contract.rent`… |
| `mua-hang.policy:<id>` | `purchase_policies` | `pricing.policy` |
| `mua-hang.document:<id>` | `purchase_documents` | `purchase.order` · `inventory.receipt` (nhập mua, nhận tặng) · `inventory.issue` (trả NCC, xuất tặng) · `inventory.exchange` · `purchase.cost` · `purchase.rebate` · `purchase.prepayment` · `finance.payment` |
| `kho.transfer:<id>` | `stock_transfer_docs` | `inventory.transfer` |
| `quy.payment_request:<id>` | `payment_requests` | `finance.payment_request` |

Hai loại phiếu cùng một `doc_type` (vd nhập mua và nhận tặng) phân biệt bằng `title` và `meta.kind`.

## 4. Vòng đời `status`

Trạng thái riêng của phân hệ giữ nguyên ở `status_raw`. `status` là nhóm chuẩn để theo dõi chung:

| `status` | Nghĩa | Ví dụ |
|---|---|---|
| `draft` | Nháp, bị trả lại | phiếu đang soạn |
| `pending` | Trình, chờ duyệt | đơn đặt chờ duyệt |
| `approved` | Đã duyệt, chưa thực hiện | đơn đặt chưa nhập; đề nghị TT đã duyệt chưa chi |
| `in_progress` | Đang thực hiện | đơn nhập dở; hàng đang đi đường; hợp đồng / chính sách đang hiệu lực |
| `done` | Hoàn tất | phiếu nhập / xuất đã ghi sổ; đơn nhập đủ; chuyển kho đã nhận; đã chi; hợp đồng thanh lý; chính sách hết hạn |
| `cancelled` | Huỷ | phiếu huỷ, chính sách ngừng / xoá |

Phiếu đã ghi sổ muốn sửa: **lập điều chỉnh** → nháp, sổ giữ bản cũ → duyệt điều chỉnh → `version` tăng, lõi sổ đảo bản cũ và ghi bản mới.

## 5. Đưa một loại chứng từ mới vào sổ (từng bước)

### Bước 1. Chọn định danh

- `doc_ref` = `<module>.<loại>:<id>`, bất biến, khớp `^[a-z][a-z0-9-]*\.[a-z][a-z0-9_-]*:\S{1,200}$`. Nếu chứng từ có nộp sự việc kế toán thì `doc_ref` trùng `doc_key` của nó.
- `doc_type` theo §3.
- Bảng ánh xạ `status_raw → status` theo §4.

### Bước 2. Viết migration (số tiếp theo trong `db/migrations`, hoặc migration của mô-đun nếu bảng ở schema mô-đun)

Mẫu (thay `<...>`):

```sql
-- [yyyy-mm-dd Tên] Đưa <chứng từ> vào sổ chứng từ chung (docs/nghiep-vu/26) (đóng góp)
CREATE OR REPLACE FUNCTION bizcity_doc_sync_<loai>() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_ref text := '<module>.<loai>:' || NEW.id;
BEGIN
  PERFORM bizcity_doc_put(
    NEW.tenant_id, v_ref, '<module>', '<nghiep-vu>.<loai>',
    NEW.<so_phieu>, NEW.<ngay>, NEW.<ma_chi_nhanh>, COALESCE(NEW.<ma_doi_tuong>, ''),
    '<Tên loại tiếng Việt>', COALESCE(NEW.<tong_tien>, 0),
    NEW.status,                                            -- status_raw
    CASE NEW.status WHEN 'draft' THEN 'draft' WHEN '<cho_duyet>' THEN 'pending' WHEN 'cancelled' THEN 'cancelled'
      WHEN '<dang_lam>' THEN 'in_progress' WHEN '<xong>' THEN 'done' ELSE 'approved' END,
    to_jsonb(NEW) - ARRAY['status', 'created_at', 'updated_at'],   -- bản chụp: bỏ cột trạng thái / mốc giờ để đổi trạng thái không sinh phiên bản
    jsonb_strip_nulls(jsonb_build_object('<khoa>', NEW.<cot>)),   -- meta: thông tin thêm cần lọc / hiện
    COALESCE(NEW.created_by, ''), NEW.created_at, NEW.updated_at,
    '' /* người duyệt */, NULL /* lúc duyệt */);
  -- liên kết: lập từ / áp chính sách / sinh sự việc kế toán
  PERFORM bizcity_doc_link(NEW.tenant_id, v_ref, '<module>.<loai>:' || NEW.<id_goc>, 'source', NEW.created_by);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS business_documents_sync ON <bang_nguon>;
CREATE TRIGGER business_documents_sync AFTER INSERT OR UPDATE ON <bang_nguon> FOR EACH ROW EXECUTE FUNCTION bizcity_doc_sync_<loai>();
-- nạp dữ liệu cũ
UPDATE <bang_nguon> SET id = id;
```

Lưu ý:
- `bizcity_doc_put` tự thêm `document_versions` khi bản chụp đổi. Nếu phân hệ **đã tự ghi phiên bản** vào `document_versions` (như chính sách mua) thì không gọi `bizcity_doc_put`, ghi thẳng đầu phiếu với số bản của phân hệ. Mẫu: `bizcity_doc_policy_put` ở 0166.
- `bizcity_doc_link(..., NULL, ...)` không ghi gì, nên truyền thẳng giá trị có thể rỗng qua `NULLIF`.
- Trước khi `UPDATE ... SET id = id` để nạp lại, xem bảng nguồn còn trigger nào khác (`SELECT tgname FROM pg_trigger WHERE tgrelid = '<bang>'::regclass AND NOT tgisinternal`). Nếu trigger khác có tác dụng phụ thì nạp bằng `SELECT` gọi hàm ghi trực tiếp.
- Xoá dòng nguồn: thêm `OR DELETE` vào trigger và đặt `status = 'cancelled'`, `status_raw = 'retired'`. Không xoá dòng trong sổ.

### Bước 3. Màn HT18 Sổ chứng từ

Thêm loại mới vào `TYPES` ở `apps/web/src/features/documents/SoChungTuPage.tsx`. Khoá `meta` mới thì thêm tên tiếng Việt vào `META_TEXT`. Liên kết tới loại mới cần tên dễ đọc thì thêm vào `doc-ref.routes.ts` (khối `label.set`).

### Bước 4. Test

Thêm ca vào `apps/api/test/so-chung-tu.test.ts`. Mỗi loại tối thiểu kiểm:
- tạo dòng nguồn thì có dòng sổ đúng `doc_type`, `status`, `version = 1`;
- đổi trạng thái thì `status` đổi mà `version` không đổi; đổi nội dung thì `version` tăng;
- liên kết đúng vai trò;
- huỷ / xoá thì `cancelled`.

### Bước 5. Trước khi đẩy

```
cd apps/api && npx vitest run test/so-chung-tu.test.ts
bash scripts/kiem-chuan.sh      # phải ĐẠT (trùng số migration là chặn)
```

Ghi một dòng `CHANGELOG.md`, cập nhật bảng "Đang có trong sổ" ở §3 tài liệu này.

## 6. Việc tiếp theo: bán hàng

Chưa có trong sổ. Đề xuất `doc_type`. Trước khi làm phải xem cấu trúc bảng và trạng thái thật của từng bảng.

| Chứng từ | Bảng nguồn | `doc_type` đề xuất | Ghi sổ kế toán |
|---|---|---|---|
| Chương trình bán / khuyến mại | `sale_programs` | `pricing.sale_program` | Không |
| Chiến dịch voucher | `mod_voucher.campaigns` | `pricing.voucher` | Không |
| Chương trình khách hàng thân thiết | `mod_loyalty.programs` | `pricing.loyalty` | Không |
| Đơn bán máy POS | `mod_pos.orders` | `sales.order` | Khi ghi sổ (liên kết `ledger`) |
| Phiếu trả hàng bán | `mod_pos.returns` | `sales.return` | Khi ghi sổ |
| Phiếu bán (web) | `mod_phieu_ban.orders` / `docs` | `sales.order` / `sales.invoice` | Khi ghi sổ |

Ràng buộc:
- Bảng mô-đun nằm ở schema riêng (`mod_pos`, `mod_phieu_ban`…), trigger viết trong migration của mô-đun và gọi `public.bizcity_doc_put`.
- Đơn bán, trả hàng: liên kết `applies` tới chương trình đã áp (`mua-hang.policy` là mẫu), `ledger` tới sự việc kế toán khi ghi sổ, `source` từ đơn gốc khi trả hàng.
- Không thêm bảng, không đổi `accounting_events`.

## 7. Tài liệu liên quan

- [BIZCITY-DOCUMENT-v1](../contracts/BIZCITY-DOCUMENT-v1.md): chuẩn chứng từ (§5 nhóm trạng thái).
- Migration `0158` (sổ chứng từ chung), `0164` (người duyệt, liên kết), `0165` (hợp đồng mua), `0166` (tên loại, vòng đời, chính sách giá).
- [25. Quy tắc và mã lỗi khai báo](25-quy-tac-ma-loi-khai-bao.md): mã lỗi cho form / API.

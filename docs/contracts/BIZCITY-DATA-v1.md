# `bizcity_data@1` — Data Contract

> **Phiên bản:** 1.0.0-draft · 2026-10-29 · **Trạng thái:** Đề xuất · **Thuộc:** [Standard v1](../standard/README.md) (hợp đồng 2/7)
> **Luật nền:** [R-DB](../rules/RULE-DATABASE.md), [R-TEN](../rules/RULE-TENANT-SECURITY.md), [R-MD](../rules/RULE-MASTER-DATA.md) · **Năng lực:** `data.tenant-tx`, `data.read-views`, `data.migrations.module`, `masterdata.read`, `masterdata.write`

## 1. Mục đích

Chuẩn thực thể, schema, quan hệ, migration và cô lập đơn vị cho dữ liệu của module. Mục tiêu: module có bảng riêng thoải mái, nhưng **không thể** làm hỏng dữ liệu Core hay đọc dữ liệu đơn vị khác, kể cả khi code có lỗi.

## 2. Hiện trạng

| Đã có | Thiếu |
|---|---|
| Mọi bảng có `tenant_id`; truy vấn lọc theo `auth.tenantId` (R-TEN) | RLS: lọc chỉ ở tầng ứng dụng, quên một `where` là lộ dữ liệu (A-23) |
| Tiền `numeric(18,2)`, `toCents/fromCents` | Ranh giới chủ bảng: module ghi bảng lõi (A-17) |
| `COMMENT ON` tiếng Việt, `schema-catalog.ts` có test | Migration theo module: mọi bảng chung một dãy số, bảng nghiệp vụ nằm trong migration nền (A-26) |
| Trigger chặn sửa sổ cái | Kiểu Kysely của mọi bảng ở một tệp `db/types.ts` |

## 3. Vị trí và chủ sở hữu

| Dữ liệu | Schema PostgreSQL | Chủ (ghi) | Module đọc bằng |
|---|---|---|---|
| Kernel (sổ cái, sự việc, sổ phụ, cấu hình hạch toán) | `public` (giữ tên, ADR-0002) | `@bizcity/kernel` | `ctx.ledger.get/query` |
| Danh mục chuẩn (đối tượng, mặt hàng, chi nhánh, kho, đơn vị tính, thuế) | `public` | `@bizcity/data/masterdata` | `ctx.data.masterdata.*` hoặc view `bizcity_read.*` |
| Platform (outbox, bằng chứng, đính kèm, phiên bản chứng từ) | `public` | gói Platform tương ứng | SDK |
| Module | `mod_<key>` (vd `mod_hop_dong`) | đúng module đó | chính module |

**Ghi vào dữ liệu không phải của mình chỉ qua action của chủ.** Ví dụ thêm khách hàng: `ctx.actions.call('core.partner.upsert', …)`, không `insertInto('partners')`.

## 4. Luật

| Mã | Cấp | Luật | Kiểm bằng |
|---|---|---|---|
| STD-DATA-1 | 0 | Mọi bảng module có `tenant_id bigint NOT NULL REFERENCES public.tenants(id)`, bật **RLS** với chính sách `tenant_id = current_setting('bizcity.tenant_id')::bigint` | CONF-MIG-2 (lint), CONF-RUN-2 (đơn vị A không thấy B) |
| STD-DATA-2 | 0 | Module chỉ truy cập CSDL qua `ctx.data.tx` (giao dịch đã đặt `bizcity.tenant_id`). Không tự mở kết nối, không `SET` biến phiên | CONF-STATIC-3 |
| STD-DATA-3 | 0 | Module không `INSERT/UPDATE/DELETE/TRUNCATE` bảng ngoài `data.tables` của mình. Phase 3: role CSDL `mod_<key>_rw` chỉ có quyền trên schema mình + `SELECT` trên `bizcity_read` | CONF-STATIC-2, GRANT |
| STD-DATA-4 | 1 | Cột bắt buộc: `id bigint GENERATED ALWAYS AS IDENTITY`, `tenant_id`, `created_at timestamptz DEFAULT now()`, `created_by text`, `updated_at`, `updated_by`. Chỉ mục đầu tiên bắt đầu bằng `tenant_id` | CONF-MIG-3 |
| STD-DATA-5 | 1 | Kiểu: tiền `numeric(18,2)`, số lượng `numeric(18,4)`, ngày nghiệp vụ `date`, thời điểm `timestamptz`, mã `text` + `UNIQUE (tenant_id, code)`, trạng thái `text` + `CHECK` | CONF-MIG-4 |
| STD-DATA-6 | 1 | Quan hệ: trong schema mình dùng khoá ngoại. Tới danh mục chuẩn: lưu **mã** (`partner_code`), kiểm tồn tại qua SDK lúc ghi, khai `referenceCheck` để Core không xoá mã đang dùng ([Extension §4](BIZCITY-EXTENSION-v1.md#4-hook)). Tới module khác: **cấm**, dùng sự kiện / action | CONF-MIG-5 |
| STD-DATA-7 | 1 | Migration nằm trong `modules/<key>/migrations/NNNN_<tên>.sql`, đánh số riêng của module, chỉ thêm, không sửa tệp đã phát hành, chỉ DDL trên `mod_<key>` | CONF-MIG-1 |
| STD-DATA-8 | 1 | Mọi bảng, mọi cột có `COMMENT ON` tiếng Việt có dấu | CONF-MIG-6 |
| STD-DATA-9 | 1 | Không xoá cứng bản ghi đã được chứng từ / sổ tham chiếu: dùng `archived_at` | review + CONF-RUN-6 |
| STD-DATA-10 | 1 | Cột chứa dữ liệu cá nhân (điện thoại, CCCD, email) khai `pii: true` trong định nghĩa thực thể: bằng chứng ghi băm thay giá trị, xuất dữ liệu được che | CONF-STATIC-6 |
| STD-DATA-11 | 2 | Tên bảng tiếng Anh số nhiều (`contracts`, `installments`); chú thích tiếng Việt | review |

## 5. Định nghĩa thực thể

zod là nguồn duy nhất; DDL do người / AI viết tay trong migration, bộ kiểm so hai bên.

```ts
// modules/hop-dong/api/schemas/contract.ts
import { entity, z } from '@bizcity/module-sdk';

export const Contract = entity('contracts', {
  code: z.string().min(1).max(32),
  partnerCode: z.string().min(1).max(32).describe('ref:masterdata.partner'),
  title: z.string().max(300),
  signedDate: z.string().date(),
  totalAmount: z.number().nonnegative().describe('money'),
  contactPhone: z.string().max(20).optional().describe('pii'),
});
```

`bizcity module check` sinh JSON Schema từ zod và so với bảng thật sau migration: thiếu cột, sai kiểu tiền, thiếu `COMMENT` đều báo lỗi.

## 6. Migration mẫu

```sql
-- modules/hop-dong/migrations/0001_hop_dong.sql
CREATE SCHEMA IF NOT EXISTS mod_hop_dong;

CREATE TABLE mod_hop_dong.contracts (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     bigint NOT NULL REFERENCES public.tenants(id),
  code          text   NOT NULL,
  partner_code  text   NOT NULL,
  title         text   NOT NULL,
  signed_date   date   NOT NULL,
  total_amount  numeric(18,2) NOT NULL DEFAULT 0,
  status        text   NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved','active','closed','cancelled')),
  version       integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  created_by    text NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    text NOT NULL,
  archived_at   timestamptz,
  UNIQUE (tenant_id, code)
);
ALTER TABLE mod_hop_dong.contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON mod_hop_dong.contracts
  USING (tenant_id = current_setting('bizcity.tenant_id')::bigint);
COMMENT ON TABLE mod_hop_dong.contracts IS 'Hợp đồng với khách hàng (module Hợp đồng). Khách hàng tham chiếu danh mục đối tượng bằng mã.';
COMMENT ON COLUMN mod_hop_dong.contracts.partner_code IS 'Mã đối tượng (public.partners.code) — kiểm qua SDK khi ghi, không khoá ngoại.';
-- … COMMENT cho từng cột còn lại
```

## 7. Ánh xạ sang Kernel

Module không bao giờ thấy bảng `ledger_*`. Số liệu kế toán liên quan tới thực thể của module đọc bằng `ctx.ledger.query({ partnerCode, dimension: { contract: code } })` (năng lực `ledger.query`), không JOIN bảng sổ.

## 8. Chuyển dần

1. Phase 2: `ctx.data.tx` đặt `SET LOCAL bizcity.tenant_id`; runner migration đọc `modules/*/migrations`; tạo schema `bizcity_read` với view danh mục.
2. Phase 2: bảng **mới** của mọi module theo luật này ngay. Bảng cũ của phân hệ hiện có (`purchase_*`…) giữ ở `public`, ghi `waivers` STD-DATA-1/7 kèm ADR, chuyển dần.
3. Phase 3: role CSDL theo module; bật RLS cho bảng danh mục chuẩn và Kernel (cần đo hiệu năng trước).

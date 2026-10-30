# PHASE-004 · tools

| Công cụ | Làm gì | Trạng thái |
|---|---|---|
| `so-du-moc.mjs` | Chỉ đọc. Chụp số dư Nợ / Có theo đơn vị × chi nhánh × tài khoản × kỳ từ `ledger_lines` ra JSON. Chạy lại sau khi sửa rồi so hai tệp: phải trùng từng dòng (T004-1) | ☐ viết ở W0 (S004-1) |

Quy ước: công cụ phase chỉ đọc CSDL (`default_transaction_read_only = on`), chạy bằng `node` trực tiếp, không cần `npm install` ngoài gói `pg` đã có.

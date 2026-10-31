#!/bin/sh
# [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
# Khởi động API trong container. Migration + seed do job db-migrate (dist/db/setup.js) chạy trước; API chỉ kiểm phiên bản DB.
set -e
exec node dist/main.js

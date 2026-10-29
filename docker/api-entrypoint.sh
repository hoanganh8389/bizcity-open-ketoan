#!/bin/sh
# Khởi động API trong container. Migration + seed do job db-migrate (dist/db/setup.js) chạy trước; API chỉ kiểm phiên bản DB.
set -e
exec node dist/main.js

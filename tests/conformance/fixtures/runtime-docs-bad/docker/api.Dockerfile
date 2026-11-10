# Bản xấu SC-REL-3: giai đoạn dựng chép cả docs/, giai đoạn chạy chỉ chép co-copy.json và thư mục docs/thu-muc
FROM node:22 AS build
COPY docs docs
FROM node:22
COPY --from=build /app/docs/standard/thieu-copy.json docs/standard/thieu-copy.json
COPY docs/standard/co-copy.json docs/standard/co-copy.json
COPY docs/thu-muc docs/thu-muc
COPY docs/standard/khong-co.json docs/standard/khong-co.json

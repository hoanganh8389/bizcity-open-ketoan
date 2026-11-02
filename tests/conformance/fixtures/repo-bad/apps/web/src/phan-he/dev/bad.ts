// SC-DEV-1: trình duyệt gọi thẳng Loki thay vì API trung gian.
export const logs = () => fetch('http://127.0.0.1:3100/loki/api/v1/query_range?query={service="api"}');

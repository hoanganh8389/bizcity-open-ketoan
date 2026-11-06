// Ca tự kiểm SC-AUTH-03 (PHASE-028 W3 đợt 2): mỗi route dưới đây phạm đúng một lỗi, trừ route "dung".
declare const r: { post(path: string, opts: object): void };

// @bizcity-route: công khai nhưng quên config public
r.post('/api/v1/x/cong-khai-thieu', {
  schema: {},
});

// @bizcity-route: công cụ quản trị nhưng quên preHandler
r.post('/api/v1/x/quyen-thieu', {
  schema: {},
});

// @bizcity-route: đúng lớp, đúng điều kiện
r.post('/api/v1/x/dung', {
  config: { public: true },
});

// @bizcity-route: lớp không có trong classes
r.post('/api/v1/x/lop-la', {
  schema: {},
});

// @bizcity-route: lách — thêm lý do mà không đăng ký vào danh sách đóng
r.post('/api/v1/x/lach', {
  schema: {},
});

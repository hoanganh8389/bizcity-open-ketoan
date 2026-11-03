// SC-FIX-1: menu của fixture chỉ có /chung-tu. SC-DOC-6: mục 'ct' có hướng dẫn, mục 'khong-huong-dan' thì không.
export const demoMenu = [{ key: 'demo', label: 'Demo', children: [{ key: 'ct', label: 'Chứng từ', path: '/chung-tu', code: 'ACC14' }, { key: 'khong-huong-dan', label: 'Màn thiếu hướng dẫn', path: '/chung-tu', code: 'ACC14' }] }];

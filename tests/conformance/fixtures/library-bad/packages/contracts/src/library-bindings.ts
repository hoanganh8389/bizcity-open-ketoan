// Bảng gắn cố ý sai cho ca tự kiểm SC-LIB-3.
export const LIBRARY_BINDINGS = [
  { id: 'tot', path: 'lines[].taxCode', library: 'core.sach', label: 'đúng', at: 'docDate' },
  { id: 'tot', path: 'reasonCode', library: 'core.sach', label: 'trùng id', at: 'docDate' },
  { id: 'Sai-Id', path: 'lines[0].x', library: 'core.khong-co', label: 'sai id, sai đường, thư viện không có', at: 'today' },
];

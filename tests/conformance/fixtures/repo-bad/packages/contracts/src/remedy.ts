// SC-FIX-1: sổ màn có một đường dẫn không có trong menu (GHOST_SCREEN).
const s = (code, path, label) => ({ code, path, label });
export const SCREENS = {
  ACC14: s('ACC14', '/chung-tu', 'Định khoản tự động'),
  GHOST_SCREEN: s('GHOST_SCREEN', '/khong-co-man-nay', 'Màn ma'),
};

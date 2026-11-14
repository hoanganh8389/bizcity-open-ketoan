// [2026-11-13 Nguyễn Văn Thủy] nhớ lựa chọn "Cộng gộp các bút toán giống nhau" theo từng sổ trên máy người dùng (đóng góp)
/**
 * Sổ chính thức (Nhật ký chung, Sổ cái) mặc định Cộng gộp — đọc lớp trung gian bút toán gộp theo tài khoản, nhẹ và gọn;
 * sổ chi tiết mặc định từng dòng mã hàng. Người dùng đổi thì máy nhớ cho lần sau. Không đọc / ghi được bộ nhớ thì theo mặc định.
 */
export function gopMacDinh(screen: string, def: boolean): boolean {
  try {
    const v = localStorage.getItem(`gop:${screen}`);
    return v === null ? def : v === '1';
  } catch {
    return def;
  }
}

export function nhoGop(screen: string, on: boolean): void {
  try {
    localStorage.setItem(`gop:${screen}`, on ? '1' : '0');
  } catch {
    /* bỏ qua: chế độ riêng tư / chặn lưu */
  }
}

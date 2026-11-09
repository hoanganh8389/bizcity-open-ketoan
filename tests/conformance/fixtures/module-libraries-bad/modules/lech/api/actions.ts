// Module cố ý sai: gọi thư viện chưa khai, viết cứng ngày lễ và lương tối thiểu, khai mà không dùng.
export async function tinhLuong(ctx: any, ngay: string) {
  await ctx.libraries.require('vn.can-cu-phap-ly', 'TT99');
  await ctx.libraries.validate('vn.tham-so-phap-ly', 'LUONG_TOI_THIEU_VUNG_I', { at: ngay });
  const tet = '2026-02-16';
  const luongToiThieu = 5_310_000;
  // library-ok: hằng số thử nghiệm đã được kế toán trưởng duyệt
  const duocMien = 5310000;
  const gio = 8; // số nhỏ không bị coi là mã cứng
  return { tet, luongToiThieu, duocMien, gio };
}

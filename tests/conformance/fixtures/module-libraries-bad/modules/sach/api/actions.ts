// Module đúng: khai thư viện, gọi qua ctx.libraries, không viết cứng.
export async function dangKyNghi(ctx: any, ngay: string) {
  await ctx.libraries.require('vn.ngay-nghi-le', ngay, { field: 'sach.dang-ky.nghi#ngay' });
  return { ngay };
}

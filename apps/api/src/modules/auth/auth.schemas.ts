import { z } from 'zod';

export const loginBodySchema = z.object({
  tenantCode: z.string().trim().min(1).describe('Mã đơn vị'),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
export type LoginBody = z.infer<typeof loginBodySchema>;

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  tenant: { id: string; code: string; name: string };
  permissions: string[];
}

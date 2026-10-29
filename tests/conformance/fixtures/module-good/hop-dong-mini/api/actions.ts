import { defineAction } from '@bizcity/module-sdk';
import { z } from 'zod';
import { label } from './label.js';

export const list = defineAction({ id: 'hop-dong-mini.contract.list', permission: 'hop-dong-mini:read', input: z.object({}), output: z.array(z.object({ code: z.string() })), handler: async () => [{ code: label }] });

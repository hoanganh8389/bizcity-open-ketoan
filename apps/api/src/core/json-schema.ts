// @bizcity-layer P actions
/**
 * zod → JSON Schema (draft 2020-12, phần con đủ cho các kiểu action đang dùng; kiểu lạ → {} kèm mô tả). Dùng cho công cụ MCP
 * (inputSchema / outputSchema) và bảng Capability Contract công bố ở GET /api/v1/system/capabilities. Không cần gói ngoài.
 */
import type { z, ZodTypeAny } from 'zod';

export type Json = Record<string, unknown>;
export function zodToJson(s: ZodTypeAny): Json {
  const d = s._def as { typeName: string; description?: string } & Record<string, unknown>;
  const withDesc = (j: Json) => (s.description ? { ...j, description: s.description } : j);
  switch (d.typeName) {
    case 'ZodObject': {
      const shape = (s as z.AnyZodObject).shape as Record<string, ZodTypeAny>;
      const required = Object.entries(shape).filter(([, v]) => !v.isOptional()).map(([k]) => k);
      const unknownKeys = (s as z.AnyZodObject)._def.unknownKeys;
      return withDesc({
        type: 'object',
        properties: Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, zodToJson(v)])),
        ...(required.length ? { required } : {}),
        additionalProperties: unknownKeys === 'passthrough',
      });
    }
    case 'ZodString': {
      const checks = (d.checks as { kind: string; value?: number; regex?: RegExp }[]) ?? [];
      const j: Json = { type: 'string' };
      for (const c of checks) {
        if (c.kind === 'min') j.minLength = c.value;
        else if (c.kind === 'max') j.maxLength = c.value;
        else if (c.kind === 'regex' && c.regex) j.pattern = c.regex.source;
      }
      return withDesc(j);
    }
    case 'ZodNumber': return withDesc({ type: ((d.checks as { kind: string }[]) ?? []).some((c) => c.kind === 'int') ? 'integer' : 'number' });
    case 'ZodBoolean': return withDesc({ type: 'boolean' });
    case 'ZodEnum': return withDesc({ type: 'string', enum: d.values as string[] });
    case 'ZodLiteral': return withDesc({ const: d.value });
    case 'ZodArray': return withDesc({ type: 'array', items: zodToJson(d.type as ZodTypeAny) });
    case 'ZodRecord': return withDesc({ type: 'object', additionalProperties: zodToJson(d.valueType as ZodTypeAny) });
    case 'ZodUnion': return withDesc({ anyOf: (d.options as ZodTypeAny[]).map(zodToJson) });
    case 'ZodOptional': return { ...zodToJson(d.innerType as ZodTypeAny), ...(s.description ? { description: s.description } : {}) };
    case 'ZodNullable': { const inner = zodToJson(d.innerType as ZodTypeAny); return withDesc({ anyOf: [inner, { type: 'null' }] }); }
    case 'ZodDefault': return withDesc({ ...zodToJson(d.innerType as ZodTypeAny), default: (d.defaultValue as () => unknown)() });
    case 'ZodEffects': return withDesc(zodToJson(d.schema as ZodTypeAny));
    default: return withDesc({});
  }
}


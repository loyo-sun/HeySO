import { z } from 'zod';
const text = z.string().max(20000);
const id = z.string().min(1).max(200);
const fields = {
  kind: id.optional(), title: text.trim().min(1).optional(),
  description: text.optional(), acceptance: text.optional(),
  owner: z.string().min(1).max(80).optional(),
  priority: z.enum(['high','medium','low']).optional(),
  points: z.number().min(0).max(1000).optional(),
  parentId: id.nullable().optional(), releaseId: id.nullable().optional(), sprintId: id.nullable().optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
};
const common = {projectId:id, expectedRevision:z.number().int().nonnegative(), requestId:id, agent:z.string().min(1).max(120)};
export const createItemSchema = z.object({...common, ...fields, kind:id, title:text.trim().min(1), startDate:fields.startDate.unwrap(), endDate:fields.endDate.unwrap()}).strict();
export const updateItemSchema = z.object({...common, itemId:id, patch:z.object(fields).strict().refine(p=>Object.keys(p).length>0, '至少修改一个字段')}).strict();

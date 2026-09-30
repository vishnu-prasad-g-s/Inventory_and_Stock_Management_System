import { PrismaClient } from '@prisma/client';
import { Ctx } from '../../lib/route';
import { AppError } from '../../lib/errors';
import { getDashboardMetrics } from '../reports/dashboard';
import { getValuationAsOfDate } from '../reports/valuation';

export interface AssistantToolDef {
  name: string;
  description: string;
  permission: string;
  execute: (prisma: PrismaClient, ctx: Ctx, params: any) => Promise<unknown>;
}

export const ASSISTANT_TOOLS: Record<string, AssistantToolDef> = {
  get_stock_summary: {
    name: 'get_stock_summary',
    description: 'Get total stock valuation, low stock count, and out-of-stock metrics.',
    permission: 'stock.read',
    execute: async (prisma, ctx, params) => {
      return getDashboardMetrics(prisma, params.warehouseId);
    },
  },
  get_inventory_valuation: {
    name: 'get_inventory_valuation',
    description: 'Reconstruct historical inventory valuation as of a specific date.',
    permission: 'reports.valuation',
    execute: async (prisma, ctx, params) => {
      const targetDate = params.asOfDate ? new Date(params.asOfDate) : new Date();
      return getValuationAsOfDate(prisma, targetDate, params.warehouseId);
    },
  },
};

export async function executeAssistantTool(
  prisma: PrismaClient,
  ctx: Ctx,
  toolName: string,
  params: any
) {
  const tool = ASSISTANT_TOOLS[toolName];
  if (!tool) {
    throw new AppError('NOT_FOUND', `Assistant tool '${toolName}' not found`, 404);
  }

  if (ctx.perms !== undefined && !ctx.perms.has(tool.permission) && !ctx.perms.has('*')) {
    throw new AppError('FORBIDDEN', `No permission to execute assistant tool '${toolName}'`, 403);
  }

  return tool.execute(prisma, ctx, params);
}

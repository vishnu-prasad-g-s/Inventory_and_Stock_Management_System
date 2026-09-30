import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AppError } from './errors';
import { logger } from './logger';

export interface Ctx {
  userId: string;
  roleId: string;
  perms: Set<string>;
  warehouseIds: string[] | 'ALL';
  ip?: string;
  requestId: string;
}

export function can(ctx: Ctx, permissionKey: string): boolean {
  return ctx.perms.has(permissionKey);
}

export function assertWarehouse(ctx: Ctx, warehouseId: string) {
  if (ctx.warehouseIds !== 'ALL' && !ctx.warehouseIds.includes(warehouseId)) {
    throw new AppError('WAREHOUSE_FORBIDDEN', 'No access to this warehouse', 403);
  }
}

export function route<S extends z.ZodTypeAny>(cfg: {
  permission?: string;
  schema?: S;
  idempotent?: boolean;
  handler: (args: { ctx: Ctx; input: z.infer<S>; req: Request }) => Promise<unknown>;
}) {
  return async (req: Request) => {
    const requestId = `req_${Math.random().toString(36).substring(2, 10)}`;
    const startTime = Date.now();

    try {
      // 1. Placeholder context - to be tied with Auth session in Phase 1
      const ctx: Ctx = {
        userId: 'system',
        roleId: 'admin',
        perms: new Set(['*']),
        warehouseIds: 'ALL',
        requestId,
      };

      // 2. Permission check
      if (cfg.permission && !can(ctx, cfg.permission) && !ctx.perms.has('*')) {
        throw new AppError('FORBIDDEN', `Missing required permission: ${cfg.permission}`, 403);
      }

      // 3. Input validation
      let input: z.infer<S> = undefined;
      if (cfg.schema) {
        const body = req.method !== 'GET' ? await req.json().catch(() => ({})) : {};
        const parsed = cfg.schema.safeParse(body);
        if (!parsed.success) {
          throw new AppError('VALIDATION_ERROR', 'Input validation failed', 400, parsed.error.format());
        }
        input = parsed.data;
      }

      // 4. Require Idempotency-Key if configured
      if (cfg.idempotent && req.method !== 'GET') {
        const key = req.headers.get('Idempotency-Key');
        if (!key) {
          throw new AppError('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required for this endpoint', 400);
        }
      }

      // 5. Execute handler
      const result = await cfg.handler({ ctx, input, req });
      const durationMs = Date.now() - startTime;
      logger.info({ requestId, path: req.url, method: req.method, status: 200, durationMs }, 'Request completed');

      return NextResponse.json(
        { data: result, meta: { requestId } },
        { status: 200 }
      );
    } catch (err: any) {
      const durationMs = Date.now() - startTime;

      if (err instanceof AppError) {
        logger.warn({ requestId, code: err.code, status: err.status, message: err.message, durationMs }, 'Application error');
        return NextResponse.json(
          {
            error: {
              code: err.code,
              message: err.message,
              details: err.details,
            },
            meta: { requestId },
          },
          { status: err.status }
        );
      }

      logger.error({ requestId, err, durationMs }, 'Unhandled server error');
      return NextResponse.json(
        {
          error: {
            code: 'INTERNAL_ERROR',
            message: 'An unexpected internal server error occurred',
          },
          meta: { requestId },
        },
        { status: 500 }
      );
    }
  };
}

import { Prisma, SerialStatus, InvTxType } from '@prisma/client';
import { AppError } from '../../lib/errors';

export async function transitionSerials(
  tx: Prisma.TransactionClient,
  movementType: InvTxType,
  serialIds: string[],
  warehouseId: string
) {
  if (!serialIds || serialIds.length === 0) return;

  for (const serialId of serialIds) {
    const serial = await tx.serialNumber.findUniqueOrThrow({ where: { id: serialId } });

    let expectedStatus: SerialStatus;
    let nextStatus: SerialStatus;

    switch (movementType) {
      case 'PURCHASE':
      case 'INITIAL_STOCK':
      case 'ADJUSTMENT_IN':
        nextStatus = 'IN_STOCK';
        break;

      case 'SALE':
        if (serial.status !== 'IN_STOCK' && serial.status !== 'RESERVED') {
          throw new AppError('SERIAL_STATE_INVALID', `Serial ${serial.serialNumber} is not in IN_STOCK or RESERVED state`, 409);
        }
        nextStatus = 'SOLD';
        break;

      case 'SALES_RETURN':
        if (serial.status !== 'SOLD') {
          throw new AppError('SERIAL_STATE_INVALID', `Serial ${serial.serialNumber} is not in SOLD state`, 409);
        }
        nextStatus = 'IN_STOCK';
        break;

      case 'DAMAGE':
        nextStatus = 'DAMAGED';
        break;

      case 'LOSS':
        nextStatus = 'LOST';
        break;

      case 'TRANSFER_OUT':
        if (serial.status !== 'IN_STOCK') {
          throw new AppError('SERIAL_STATE_INVALID', `Serial ${serial.serialNumber} is not IN_STOCK for transfer`, 409);
        }
        nextStatus = 'IN_TRANSIT';
        break;

      case 'TRANSFER_IN':
        if (serial.status !== 'IN_TRANSIT') {
          throw new AppError('SERIAL_STATE_INVALID', `Serial ${serial.serialNumber} is not IN_TRANSIT`, 409);
        }
        nextStatus = 'IN_STOCK';
        break;

      default:
        nextStatus = serial.status;
        break;
    }

    await tx.serialNumber.update({
      where: { id: serialId },
      data: {
        status: nextStatus,
        warehouseId: nextStatus === 'SOLD' ? null : warehouseId,
      },
    });
  }
}

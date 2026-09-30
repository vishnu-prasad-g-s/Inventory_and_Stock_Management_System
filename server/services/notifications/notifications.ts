import { Prisma, NotificationType } from '@prisma/client';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  dedupeKey?: string;
}

export async function createNotification(
  tx: Prisma.TransactionClient,
  input: CreateNotificationInput
) {
  if (input.dedupeKey) {
    const existing = await tx.notification.findUnique({
      where: {
        userId_dedupeKey: {
          userId: input.userId,
          dedupeKey: input.dedupeKey,
        },
      },
    });
    if (existing) return existing;
  }

  return tx.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: input.entityType,
      entityId: input.entityId,
      dedupeKey: input.dedupeKey,
      isRead: false,
    },
  });
}

export async function markNotificationAsRead(
  tx: Prisma.TransactionClient,
  userId: string,
  notificationId: string
) {
  return tx.notification.updateMany({
    where: {
      id: notificationId,
      userId,
    },
    data: {
      isRead: true,
    },
  });
}

export async function getUnreadCount(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<number> {
  return tx.notification.count({
    where: {
      userId,
      isRead: false,
    },
  });
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, IsNull, Repository } from 'typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { User } from '../users/entities/user.entity';
import { Notification } from './entities/notification.entity';
import { NotificationType } from './enums/notification-type.enum';

type NotificationPayload = {
  type: NotificationType;
  title: string;
  message: string;
  resourceType?: string | null;
  resourceId?: string | null;
};

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  findAll(userId: string, unreadOnly = false): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: {
        userId,
        ...(unreadOnly ? { readAt: IsNull() } : {}),
      },
      order: {
        createdAt: 'DESC',
      },
      take: 100,
    });
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.notificationRepository.count({
      where: {
        userId,
        readAt: IsNull(),
      },
    });

    return { count };
  }

  async markRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: {
        id,
        userId,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (!notification.readAt) {
      notification.readAt = new Date();

      await this.notificationRepository.save(notification);
    }

    return notification;
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationRepository.update(
      {
        userId,
        readAt: IsNull(),
      },
      {
        readAt: new Date(),
      },
    );

    return {
      updated: result.affected ?? 0,
    };
  }

  async notifyUser(
    userId: string,
    payload: NotificationPayload,
    manager?: EntityManager,
  ): Promise<void> {
    const repository = manager
      ? manager.getRepository(Notification)
      : this.notificationRepository;

    const notification = repository.create({
      userId,
      type: payload.type,
      title: payload.title,
      message: payload.message,
      resourceType: payload.resourceType ?? null,
      resourceId: payload.resourceId ?? null,
      readAt: null,
    });

    await repository.save(notification);
  }

  async notifyRoles(
    roles: UserRole[],
    payload: NotificationPayload,
    options?: {
      excludeUserIds?: string[];
      manager?: EntityManager;
    },
  ): Promise<void> {
    const manager = options?.manager;

    const userRepository = manager
      ? manager.getRepository(User)
      : this.notificationRepository.manager.getRepository(User);

    const notificationRepository = manager
      ? manager.getRepository(Notification)
      : this.notificationRepository;

    const users = await userRepository.find({
      where: {
        role: In(roles),
        isActive: true,
      },
    });

    const excluded = new Set(options?.excludeUserIds ?? []);

    const recipients = users.filter((user) => !excluded.has(user.id));

    if (recipients.length === 0) {
      return;
    }

    const notifications = recipients.map((user) =>
      notificationRepository.create({
        userId: user.id,
        type: payload.type,
        title: payload.title,
        message: payload.message,
        resourceType: payload.resourceType ?? null,
        resourceId: payload.resourceId ?? null,
        readAt: null,
      }),
    );

    await notificationRepository.save(notifications);
  }
}

import { NotFoundException } from '@nestjs/common';
import {
  EntityManager,
  Repository,
  UpdateResult,
} from 'typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { User } from '../users/entities/user.entity';
import { Notification } from './entities/notification.entity';
import { NotificationType } from './enums/notification-type.enum';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  let service: NotificationsService;

  const userRepository = {
    find: jest.fn(),
  };

  const notificationRepository = {
    find: jest.fn(),
    count: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    manager: {
      getRepository: jest.fn(),
    },
  } as unknown as Repository<Notification>;

  beforeEach(() => {
    jest.clearAllMocks();

    (
      notificationRepository.manager
        .getRepository as jest.Mock
    ).mockImplementation((entity) => {
      if (entity === User) {
        return userRepository;
      }

      return notificationRepository;
    });

    (
      notificationRepository.create as jest.Mock
    ).mockImplementation((value) => value);

    service = new NotificationsService(
      notificationRepository,
    );
  });

  it('returns unread count for the current user', async () => {
    (
      notificationRepository.count as jest.Mock
    ).mockResolvedValue(3);

    await expect(
      service.unreadCount('user-1'),
    ).resolves.toEqual({
      count: 3,
    });

    expect(
      notificationRepository.count,
    ).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        readAt: expect.anything(),
      },
    });
  });

  it('marks an unread notification as read', async () => {
    const notification = {
      id: 'notification-1',
      userId: 'user-1',
      readAt: null,
    } as Notification;

    (
      notificationRepository.findOne as jest.Mock
    ).mockResolvedValue(notification);

    (
      notificationRepository.save as jest.Mock
    ).mockImplementation(
      async (value) => value,
    );

    const result = await service.markRead(
      'notification-1',
      'user-1',
    );

    expect(result.readAt).toBeInstanceOf(
      Date,
    );

    expect(
      notificationRepository.save,
    ).toHaveBeenCalledTimes(1);
  });

  it('does not write again when notification is already read', async () => {
    const readAt = new Date();

    const notification = {
      id: 'notification-1',
      userId: 'user-1',
      readAt,
    } as Notification;

    (
      notificationRepository.findOne as jest.Mock
    ).mockResolvedValue(notification);

    const result = await service.markRead(
      'notification-1',
      'user-1',
    );

    expect(result.readAt).toBe(readAt);

    expect(
      notificationRepository.save,
    ).not.toHaveBeenCalled();
  });

  it('prevents one user from marking another user notification as read', async () => {
    (
      notificationRepository.findOne as jest.Mock
    ).mockResolvedValue(null);

    await expect(
      service.markRead(
        'notification-owned-by-user-1',
        'user-2',
      ),
    ).rejects.toBeInstanceOf(
      NotFoundException,
    );

    expect(
      notificationRepository.findOne,
    ).toHaveBeenCalledWith({
      where: {
        id:
          'notification-owned-by-user-1',
        userId: 'user-2',
      },
    });
  });

  it('marks all unread notifications read and returns affected count', async () => {
    (
      notificationRepository.update as jest.Mock
    ).mockResolvedValue({
      affected: 4,
    } as UpdateResult);

    await expect(
      service.markAllRead('user-1'),
    ).resolves.toEqual({
      updated: 4,
    });

    expect(
      notificationRepository.update,
    ).toHaveBeenCalledTimes(1);
  });

  it('creates a direct user notification', async () => {
    (
      notificationRepository.save as jest.Mock
    ).mockResolvedValue({});

    await service.notifyUser(
      'worker-1',
      {
        type:
          NotificationType.TRANSFER_ASSIGNED,
        title: 'Transfer assigned',
        message:
          'TRF-001 was assigned to you.',
        resourceType: 'transfer',
        resourceId: 'transfer-1',
      },
    );

    expect(
      notificationRepository.create,
    ).toHaveBeenCalledWith({
      userId: 'worker-1',
      type:
        NotificationType.TRANSFER_ASSIGNED,
      title: 'Transfer assigned',
      message:
        'TRF-001 was assigned to you.',
      resourceType: 'transfer',
      resourceId: 'transfer-1',
      readAt: null,
    });

    expect(
      notificationRepository.save,
    ).toHaveBeenCalledTimes(1);
  });

  it('broadcasts only to role recipients that are not excluded', async () => {
    userRepository.find.mockResolvedValue([
      {
        id: 'admin-1',
        role: UserRole.ADMIN,
        isActive: true,
      },
      {
        id: 'manager-1',
        role:
          UserRole.WAREHOUSE_MANAGER,
        isActive: true,
      },
    ]);

    (
      notificationRepository.save as jest.Mock
    ).mockResolvedValue([]);

    await service.notifyRoles(
      [
        UserRole.ADMIN,
        UserRole.WAREHOUSE_MANAGER,
      ],
      {
        type:
          NotificationType.PRODUCT_LOW_STOCK,
        title: 'Product low on stock',
        message: 'Keyboard has 5 pcs left.',
        resourceType: 'product',
        resourceId: 'product-1',
      },
      {
        excludeUserIds: ['admin-1'],
      },
    );

    expect(
      notificationRepository.create,
    ).toHaveBeenCalledTimes(1);

    expect(
      notificationRepository.create,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'manager-1',
        type:
          NotificationType.PRODUCT_LOW_STOCK,
        resourceId: 'product-1',
      }),
    );
  });

  it('does not call save when every role recipient is excluded', async () => {
    userRepository.find.mockResolvedValue([
      {
        id: 'manager-1',
        role:
          UserRole.WAREHOUSE_MANAGER,
        isActive: true,
      },
    ]);

    await service.notifyRoles(
      [UserRole.WAREHOUSE_MANAGER],
      {
        type:
          NotificationType.TRANSFER_STARTED,
        title: 'Transfer started',
        message:
          'TRF-001 is now in progress.',
        resourceType: 'transfer',
        resourceId: 'transfer-1',
      },
      {
        excludeUserIds: ['manager-1'],
      },
    );

    expect(
      notificationRepository.save,
    ).not.toHaveBeenCalled();
  });

  it('uses the transaction manager repositories when one is provided', async () => {
    const txNotificationRepository = {
      create: jest.fn(
        (value) => value,
      ),
      save: jest.fn(),
    };

    const txUserRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'admin-1',
          role: UserRole.ADMIN,
          isActive: true,
        },
      ]),
    };

    const manager = {
      getRepository: jest.fn(
        (entity) => {
          if (entity === User) {
            return txUserRepository;
          }

          if (entity === Notification) {
            return txNotificationRepository;
          }

          throw new Error(
            'Unexpected repository',
          );
        },
      ),
    } as unknown as EntityManager;

    await service.notifyRoles(
      [UserRole.ADMIN],
      {
        type:
          NotificationType.PRODUCT_OUT_OF_STOCK,
        title: 'Out of stock',
        message: 'Keyboard is empty.',
        resourceType: 'product',
        resourceId: 'product-1',
      },
      {
        manager,
      },
    );

    expect(
      txNotificationRepository.save,
    ).toHaveBeenCalledTimes(1);

    expect(
      notificationRepository.save,
    ).not.toHaveBeenCalled();
  });
});

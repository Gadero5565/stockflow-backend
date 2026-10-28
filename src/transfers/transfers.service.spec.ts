import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  Repository,
} from 'typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Inventory } from '../inventory/entities/inventory.entity';
import { LocationsService } from '../locations/locations.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { ProductsService } from '../products/products.service';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { UsersService } from '../users/users.service';
import { TransferLine } from './entities/transfer-line.entity';
import { Transfer } from './entities/transfer.entity';
import { TransferStatus } from './enums/transfer-status.enum';
import { TransfersService } from './transfers.service';

describe('TransfersService', () => {
  let service: TransfersService;

  const transferRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  } as unknown as Repository<Transfer>;

  const transferLineRepository =
    {} as Repository<TransferLine>;

  const inventoryRepository = {
    findOne: jest.fn(),
  } as unknown as Repository<Inventory>;

  const locationsService = {
    findOne: jest.fn(),
  } as unknown as LocationsService;

  const productsService = {
    findOne: jest.fn(),
  } as unknown as ProductsService;

  const usersService = {
    findById: jest.fn(),
  } as unknown as UsersService;

  const notificationsService = {
    notifyUser: jest.fn(),
    notifyRoles: jest.fn(),
  } as unknown as NotificationsService;

  const stockMovementsService = {
    recordTransfer: jest.fn(),
  } as unknown as StockMovementsService;

  const dataSource = {
    transaction: jest.fn(),
  } as unknown as DataSource;

  const managerUser: AuthenticatedUser = {
    id: 'manager-1',
    name: 'Manager',
    email: 'manager@stockflow.local',
    role: UserRole.WAREHOUSE_MANAGER,
    isActive: true,
  };

  const workerUser: AuthenticatedUser = {
    id: 'worker-1',
    name: 'Worker',
    email: 'worker@stockflow.local',
    role: UserRole.WAREHOUSE_WORKER,
    isActive: true,
  };

  function makeTransfer(
    status: TransferStatus,
    assignedUserId = 'worker-1',
  ): Transfer {
    return {
      id: 'transfer-1',
      reference: 'TRF-TEST001',
      sourceLocationId: 'source-1',
      destinationLocationId:
        'destination-1',
      assignedUserId,
      createdById: 'manager-1',
      status,
      notes: null,
      readyAt:
        status === TransferStatus.DRAFT
          ? null
          : new Date(),
      startedAt:
        status ===
          TransferStatus.IN_PROGRESS ||
        status === TransferStatus.DONE
          ? new Date()
          : null,
      completedAt:
        status === TransferStatus.DONE
          ? new Date()
          : null,
      cancelledAt:
        status ===
        TransferStatus.CANCELLED
          ? new Date()
          : null,
      createdAt: new Date(),
      updatedAt: new Date(),
      sourceLocation: {
        id: 'source-1',
        name: 'Main Storage',
        code: 'MAIN',
      },
      destinationLocation: {
        id: 'destination-1',
        name: 'Dispatch',
        code: 'DSP',
      },
      assignedUser: {
        id: assignedUserId,
        name: 'Worker',
      },
      createdBy: {
        id: 'manager-1',
        name: 'Manager',
      },
      lines: [
        {
          id: 'line-1',
          transferId: 'transfer-1',
          productId: 'product-1',
          quantity: 7,
          processedQuantity: 0,
          product: {
            id: 'product-1',
            name: 'Keyboard',
            sku: 'KEY-001',
          },
        },
      ],
    } as Transfer;
  }

  beforeEach(() => {
    jest.clearAllMocks();

    (
      locationsService.findOne as jest.Mock
    ).mockResolvedValue({
      id: 'location',
    });

    (
      productsService.findOne as jest.Mock
    ).mockResolvedValue({
      id: 'product-1',
    });

    (
      usersService.findById as jest.Mock
    ).mockResolvedValue({
      id: 'worker-1',
      isActive: true,
      role:
        UserRole.WAREHOUSE_WORKER,
    });

    (
      transferRepository.save as jest.Mock
    ).mockImplementation(
      async (value) => value,
    );

    (
      notificationsService.notifyUser as jest.Mock
    ).mockResolvedValue(undefined);

    (
      notificationsService.notifyRoles as jest.Mock
    ).mockResolvedValue(undefined);

    (
      stockMovementsService.recordTransfer as jest.Mock
    ).mockResolvedValue({});

    service = new TransfersService(
      transferRepository,
      transferLineRepository,
      inventoryRepository,
      locationsService,
      productsService,
      usersService,
      notificationsService,
      stockMovementsService,
      dataSource,
    );
  });

  describe('create', () => {
    it('rejects a transfer whose source and destination are the same', async () => {
      await expect(
        service.create(
          {
            sourceLocationId:
              'location-1',
            destinationLocationId:
              'location-1',
            assignedUserId:
              'worker-1',
            lines: [
              {
                productId:
                  'product-1',
                quantity: 1,
              },
            ],
          },
          managerUser,
        ),
      ).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects assignment to an inactive user', async () => {
      (
        usersService.findById as jest.Mock
      ).mockResolvedValue({
        id: 'worker-1',
        isActive: false,
        role:
          UserRole.WAREHOUSE_WORKER,
      });

      await expect(
        service.create(
          {
            sourceLocationId:
              'source-1',
            destinationLocationId:
              'destination-1',
            assignedUserId:
              'worker-1',
            lines: [
              {
                productId:
                  'product-1',
                quantity: 1,
              },
            ],
          },
          managerUser,
        ),
      ).rejects.toThrow(
        'Assigned user is inactive',
      );
    });

    it('rejects assignment to a non-worker role', async () => {
      (
        usersService.findById as jest.Mock
      ).mockResolvedValue({
        id: 'manager-2',
        isActive: true,
        role:
          UserRole.WAREHOUSE_MANAGER,
      });

      await expect(
        service.create(
          {
            sourceLocationId:
              'source-1',
            destinationLocationId:
              'destination-1',
            assignedUserId:
              'manager-2',
            lines: [
              {
                productId:
                  'product-1',
                quantity: 1,
              },
            ],
          },
          managerUser,
        ),
      ).rejects.toThrow(
        'Transfers must be assigned to a warehouse worker',
      );
    });

    it('rejects duplicate products in transfer lines', async () => {
      await expect(
        service.create(
          {
            sourceLocationId:
              'source-1',
            destinationLocationId:
              'destination-1',
            assignedUserId:
              'worker-1',
            lines: [
              {
                productId:
                  'product-1',
                quantity: 1,
              },
              {
                productId:
                  'product-1',
                quantity: 2,
              },
            ],
          },
          managerUser,
        ),
      ).rejects.toThrow(
        'A product can only appear once in a transfer',
      );
    });

    it('persists a draft transfer and notifies the assigned worker', async () => {
      const txTransferRepository = {
        create: jest.fn(
          (value) => value,
        ),
        save: jest.fn(
          async (value) => ({
            id: 'transfer-1',
            ...value,
          }),
        ),
      };

      const txLineRepository = {
        create: jest.fn(
          (value) => value,
        ),
        save: jest.fn(),
      };

      const manager = {
        getRepository: jest.fn(
          (entity) => {
            if (entity === Transfer) {
              return txTransferRepository;
            }

            if (
              entity === TransferLine
            ) {
              return txLineRepository;
            }

            throw new Error(
              'Unexpected repository',
            );
          },
        ),
      } as unknown as EntityManager;

      (
        dataSource.transaction as jest.Mock
      ).mockImplementation(
        async (callback) =>
          callback(manager),
      );

      const created =
        makeTransfer(
          TransferStatus.DRAFT,
        );

      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(created);

      const result = await service.create(
        {
          sourceLocationId:
            'source-1',
          destinationLocationId:
            'destination-1',
          assignedUserId: 'worker-1',
          notes: '  Fragile  ',
          lines: [
            {
              productId:
                'product-1',
              quantity: 7,
            },
          ],
        },
        managerUser,
      );

      expect(result).toBe(created);

      expect(
        notificationsService.notifyUser,
      ).toHaveBeenCalledWith(
        'worker-1',
        expect.objectContaining({
          type:
            NotificationType.TRANSFER_ASSIGNED,
          resourceId: 'transfer-1',
        }),
      );
    });
  });

  describe('access and lifecycle', () => {
    it('prevents a worker from opening another worker transfer', async () => {
      (
        transferRepository.findOne as jest.Mock
      ).mockResolvedValue(
        makeTransfer(
          TransferStatus.READY,
          'worker-2',
        ),
      );

      await expect(
        service.findOne(
          'transfer-1',
          workerUser,
        ),
      ).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('does not mark a transfer ready when source stock is insufficient', async () => {
      (
        transferRepository.findOne as jest.Mock
      ).mockResolvedValue(
        makeTransfer(
          TransferStatus.DRAFT,
        ),
      );

      (
        inventoryRepository.findOne as jest.Mock
      ).mockResolvedValue({
        quantity: 4,
      });

      await expect(
        service.markReady(
          'transfer-1',
          managerUser,
        ),
      ).rejects.toThrow(
        'Insufficient stock for Keyboard. Required: 7, available: 4',
      );

      expect(
        transferRepository.save,
      ).not.toHaveBeenCalled();

      expect(
        notificationsService.notifyUser,
      ).not.toHaveBeenCalled();
    });

    it('marks a draft transfer ready and notifies the assigned worker', async () => {
      const transfer =
        makeTransfer(
          TransferStatus.DRAFT,
        );

      (
        transferRepository.findOne as jest.Mock
      ).mockResolvedValue(transfer);

      (
        inventoryRepository.findOne as jest.Mock
      ).mockResolvedValue({
        quantity: 20,
      });

      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(transfer);

      await service.markReady(
        'transfer-1',
        managerUser,
      );

      expect(transfer.status).toBe(
        TransferStatus.READY,
      );

      expect(
        transfer.readyAt,
      ).toBeInstanceOf(Date);

      expect(
        notificationsService.notifyUser,
      ).toHaveBeenCalledWith(
        'worker-1',
        expect.objectContaining({
          type:
            NotificationType.TRANSFER_READY,
        }),
      );
    });

    it('prevents an unassigned worker from starting a transfer', async () => {
      (
        transferRepository.findOne as jest.Mock
      ).mockResolvedValue(
        makeTransfer(
          TransferStatus.READY,
          'worker-2',
        ),
      );

      await expect(
        service.start(
          'transfer-1',
          workerUser,
        ),
      ).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('allows the assigned worker to start a ready transfer and alerts managers', async () => {
      const transfer =
        makeTransfer(
          TransferStatus.READY,
        );

      (
        transferRepository.findOne as jest.Mock
      ).mockResolvedValue(transfer);

      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(transfer);

      await service.start(
        'transfer-1',
        workerUser,
      );

      expect(transfer.status).toBe(
        TransferStatus.IN_PROGRESS,
      );

      expect(
        transfer.startedAt,
      ).toBeInstanceOf(Date);

      expect(
        notificationsService.notifyRoles,
      ).toHaveBeenCalledWith(
        [
          UserRole.ADMIN,
          UserRole.WAREHOUSE_MANAGER,
        ],
        expect.objectContaining({
          type:
            NotificationType.TRANSFER_STARTED,
        }),
        {
          excludeUserIds: [
            'worker-1',
          ],
        },
      );
    });
  });

  describe('complete', () => {
    it('rejects completion when source inventory is insufficient before recording movements', async () => {
      const accessTransfer =
        makeTransfer(
          TransferStatus.IN_PROGRESS,
        );

      (
        transferRepository.findOne as jest.Mock
      ).mockResolvedValue(
        accessTransfer,
      );

      const txTransfer =
        makeTransfer(
          TransferStatus.IN_PROGRESS,
        );

      const txTransferRepository = {
        findOne: jest
          .fn()
          .mockResolvedValue(
            txTransfer,
          ),
        save: jest.fn(),
      };

      const txLineRepository = {
        find: jest.fn().mockResolvedValue(
          txTransfer.lines,
        ),
        save: jest.fn(),
      };

      const txInventoryRepository = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce({
            id: 'source-inventory',
            productId: 'product-1',
            locationId: 'source-1',
            quantity: 4,
          }),
        create: jest.fn(),
        save: jest.fn(),
      };

      const manager = {
        getRepository: jest.fn(
          (entity) => {
            if (entity === Transfer) {
              return txTransferRepository;
            }

            if (
              entity === TransferLine
            ) {
              return txLineRepository;
            }

            if (entity === Inventory) {
              return txInventoryRepository;
            }

            throw new Error(
              'Unexpected repository',
            );
          },
        ),
      } as unknown as EntityManager;

      (
        dataSource.transaction as jest.Mock
      ).mockImplementation(
        async (callback) =>
          callback(manager),
      );

      await expect(
        service.complete(
          'transfer-1',
          workerUser,
        ),
      ).rejects.toThrow(
        'Insufficient stock for product product-1',
      );

      expect(
        stockMovementsService.recordTransfer,
      ).not.toHaveBeenCalled();

      expect(
        txTransferRepository.save,
      ).not.toHaveBeenCalled();
    });

    it('moves stock, processes lines, completes transfer, and emits completion notifications', async () => {
      const accessTransfer =
        makeTransfer(
          TransferStatus.IN_PROGRESS,
        );

      (
        transferRepository.findOne as jest.Mock
      ).mockResolvedValue(
        accessTransfer,
      );

      const txTransfer =
        makeTransfer(
          TransferStatus.IN_PROGRESS,
        );

      const line = txTransfer.lines[0];

      const sourceInventory = {
        id: 'source-inventory',
        productId: 'product-1',
        locationId: 'source-1',
        quantity: 20,
      };

      const destinationInventory = {
        id: 'destination-inventory',
        productId: 'product-1',
        locationId: 'destination-1',
        quantity: 5,
      };

      const txTransferRepository = {
        findOne: jest
          .fn()
          .mockResolvedValue(
            txTransfer,
          ),
        save: jest.fn(
          async (value) => value,
        ),
      };

      const txLineRepository = {
        find: jest.fn().mockResolvedValue([
          line,
        ]),
        save: jest.fn(
          async (value) => value,
        ),
      };

      const txInventoryRepository = {
        findOne: jest
          .fn()
          .mockResolvedValueOnce(
            sourceInventory,
          )
          .mockResolvedValueOnce(
            destinationInventory,
          ),
        create: jest.fn(
          (value) => value,
        ),
        save: jest.fn(
          async (value) => value,
        ),
      };

      const manager = {
        getRepository: jest.fn(
          (entity) => {
            if (entity === Transfer) {
              return txTransferRepository;
            }

            if (
              entity === TransferLine
            ) {
              return txLineRepository;
            }

            if (entity === Inventory) {
              return txInventoryRepository;
            }

            throw new Error(
              'Unexpected repository',
            );
          },
        ),
      } as unknown as EntityManager;

      (
        dataSource.transaction as jest.Mock
      ).mockImplementation(
        async (callback) =>
          callback(manager),
      );

      const completed =
        makeTransfer(
          TransferStatus.DONE,
        );

      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(completed);

      await service.complete(
        'transfer-1',
        managerUser,
      );

      expect(
        sourceInventory.quantity,
      ).toBe(13);

      expect(
        destinationInventory.quantity,
      ).toBe(12);

      expect(
        line.processedQuantity,
      ).toBe(7);

      expect(txTransfer.status).toBe(
        TransferStatus.DONE,
      );

      expect(
        txTransfer.completedAt,
      ).toBeInstanceOf(Date);

      expect(
        stockMovementsService.recordTransfer,
      ).toHaveBeenCalledWith(
        manager,
        {
          productId: 'product-1',
          sourceLocationId:
            'source-1',
          destinationLocationId:
            'destination-1',
          quantity: 7,
          transferId:
            'transfer-1',
          createdById:
            'manager-1',
        },
      );

      expect(
        notificationsService.notifyRoles,
      ).toHaveBeenCalledWith(
        [
          UserRole.ADMIN,
          UserRole.WAREHOUSE_MANAGER,
        ],
        expect.objectContaining({
          type:
            NotificationType.TRANSFER_COMPLETED,
        }),
        {
          excludeUserIds: [
            'manager-1',
          ],
        },
      );

      expect(
        notificationsService.notifyUser,
      ).toHaveBeenCalledWith(
        'worker-1',
        expect.objectContaining({
          type:
            NotificationType.TRANSFER_COMPLETED,
        }),
      );
    });
  });
});

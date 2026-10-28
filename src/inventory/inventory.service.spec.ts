import { BadRequestException } from '@nestjs/common';
import {
  DataSource,
  EntityManager,
  Repository,
} from 'typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { LocationsService } from '../locations/locations.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { Product } from '../products/entities/product.entity';
import { ProductsService } from '../products/products.service';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { Inventory } from './entities/inventory.entity';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  let service: InventoryService;

  const inventoryRepository = {
    createQueryBuilder: jest.fn(),
  } as unknown as Repository<Inventory>;

  const productsService = {
    findOne: jest.fn(),
  } as unknown as ProductsService;

  const locationsService = {
    findOne: jest.fn(),
  } as unknown as LocationsService;

  const notificationsService = {
    notifyRoles: jest.fn(),
  } as unknown as NotificationsService;

  const stockMovementsService = {
    recordAdjustment: jest.fn(),
  } as unknown as StockMovementsService;

  const txInventoryRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const manager = {
    getRepository: jest.fn(),
  } as unknown as EntityManager;

  const dataSource = {
    transaction: jest.fn(),
    getRepository: jest.fn(),
  } as unknown as DataSource;

  const currentUser: AuthenticatedUser = {
    id: 'manager-1',
    name: 'Manager',
    email: 'manager@stockflow.local',
    role: UserRole.WAREHOUSE_MANAGER,
    isActive: true,
  };

  const product = {
    id: 'product-1',
    name: 'Keyboard',
    sku: 'KEY-001',
    barcode: '89706848001',
    description: null,
    unit: 'pcs',
    active: true,
    reorderLevel: 10,
  } as Product;

  const savedInventory = {
    id: 'inventory-1',
    productId: 'product-1',
    locationId: 'location-1',
    quantity: 8,
  } as Inventory;

  beforeEach(() => {
    jest.clearAllMocks();

    (
      productsService.findOne as jest.Mock
    ).mockResolvedValue(product);

    (
      locationsService.findOne as jest.Mock
    ).mockResolvedValue({
      id: 'location-1',
    });

    (
      manager.getRepository as jest.Mock
    ).mockReturnValue(
      txInventoryRepository,
    );

    (
      dataSource.transaction as jest.Mock
    ).mockImplementation(
      async (callback) =>
        callback(manager),
    );

    txInventoryRepository.create.mockImplementation(
      (value) => value,
    );

    txInventoryRepository.save.mockImplementation(
      async (value) => ({
        id:
          value.id ??
          'inventory-1',
        ...value,
      }),
    );

    (
      stockMovementsService.recordAdjustment as jest.Mock
    ).mockResolvedValue({});

    (
      notificationsService.notifyRoles as jest.Mock
    ).mockResolvedValue(undefined);

    service = new InventoryService(
      inventoryRepository,
      productsService,
      locationsService,
      notificationsService,
      stockMovementsService,
      dataSource,
    );

    jest
      .spyOn(service, 'findOne')
      .mockResolvedValue(savedInventory);
  });

  function mockGlobalTotals(
    oldTotal: number,
    newTotal?: number,
  ) {
    const mock = jest.fn();

    mock.mockResolvedValueOnce(oldTotal);

    if (newTotal !== undefined) {
      mock.mockResolvedValueOnce(
        newTotal,
      );
    }

    (
      service as unknown as {
        getGlobalQuantity: jest.Mock;
      }
    ).getGlobalQuantity = mock;

    return mock;
  }

  it('classifies stock health using global quantity and reorder threshold', async () => {
    const queryBuilder = {
      leftJoin: jest.fn(),
      where: jest.fn(),
      select: jest.fn(),
      addSelect: jest.fn(),
      groupBy: jest.fn(),
      addGroupBy: jest.fn(),
      orderBy: jest.fn(),
      getRawMany: jest.fn(),
    };

    queryBuilder.leftJoin.mockReturnValue(
      queryBuilder,
    );
    queryBuilder.where.mockReturnValue(
      queryBuilder,
    );
    queryBuilder.select.mockReturnValue(
      queryBuilder,
    );
    queryBuilder.addSelect.mockReturnValue(
      queryBuilder,
    );
    queryBuilder.groupBy.mockReturnValue(
      queryBuilder,
    );
    queryBuilder.addGroupBy.mockReturnValue(
      queryBuilder,
    );
    queryBuilder.orderBy.mockReturnValue(
      queryBuilder,
    );

    queryBuilder.getRawMany.mockResolvedValue([
      {
        productId: 'product-1',
        name: 'Keyboard',
        sku: 'KEY-001',
        barcode: null,
        unit: 'pcs',
        reorderLevel: '10',
        totalQuantity: '0',
      },
      {
        productId: 'product-2',
        name: 'Mouse',
        sku: 'MOU-001',
        barcode: null,
        unit: 'pcs',
        reorderLevel: '10',
        totalQuantity: '7',
      },
      {
        productId: 'product-3',
        name: 'Monitor',
        sku: 'MON-001',
        barcode: null,
        unit: 'pcs',
        reorderLevel: '0',
        totalQuantity: '2',
      },
    ]);

    (
      dataSource.getRepository as jest.Mock
    ).mockReturnValue({
      createQueryBuilder: jest
        .fn()
        .mockReturnValue(
          queryBuilder,
        ),
    });

    const result =
      await service.getHealth();

    expect(result.summary).toEqual({
      totalProducts: 3,
      totalUnits: 9,
      outOfStock: 1,
      lowStock: 1,
      available: 1,
    });

    expect(
      result.products.map(
        (item) => item.status,
      ),
    ).toEqual([
      'out_of_stock',
      'low_stock',
      'available',
    ]);
  });

  it('creates an inventory row for a positive adjustment when none exists', async () => {
    txInventoryRepository.findOne.mockResolvedValue(
      null,
    );

    mockGlobalTotals(0, 5);

    await service.adjust(
      {
        productId: 'product-1',
        locationId: 'location-1',
        quantityDelta: 5,
        reason: 'Initial stock',
      },
      currentUser,
    );

    expect(
      txInventoryRepository.create,
    ).toHaveBeenCalledWith({
      productId: 'product-1',
      locationId: 'location-1',
      quantity: 5,
    });

    expect(
      stockMovementsService.recordAdjustment,
    ).toHaveBeenCalledTimes(1);
  });

  it('rejects removing stock from a location that has no inventory row', async () => {
    txInventoryRepository.findOne.mockResolvedValue(
      null,
    );

    mockGlobalTotals(0);

    await expect(
      service.adjust(
        {
          productId: 'product-1',
          locationId: 'location-1',
          quantityDelta: -1,
          reason: 'Correction',
        },
        currentUser,
      ),
    ).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(
      stockMovementsService.recordAdjustment,
    ).not.toHaveBeenCalled();

    expect(
      notificationsService.notifyRoles,
    ).not.toHaveBeenCalled();
  });

  it('rejects an adjustment that would make location stock negative', async () => {
    txInventoryRepository.findOne.mockResolvedValue({
      id: 'inventory-1',
      productId: 'product-1',
      locationId: 'location-1',
      quantity: 3,
    });

    mockGlobalTotals(3);

    await expect(
      service.adjust(
        {
          productId: 'product-1',
          locationId: 'location-1',
          quantityDelta: -4,
          reason: 'Correction',
        },
        currentUser,
      ),
    ).rejects.toThrow(
      'Insufficient stock. Available quantity is 3',
    );

    expect(
      txInventoryRepository.save,
    ).not.toHaveBeenCalled();
  });

  it('creates one low-stock notification when status crosses Available -> Low Stock', async () => {
    txInventoryRepository.findOne.mockResolvedValue({
      id: 'inventory-1',
      productId: 'product-1',
      locationId: 'location-1',
      quantity: 20,
    });

    mockGlobalTotals(20, 8);

    await service.adjust(
      {
        productId: 'product-1',
        locationId: 'location-1',
        quantityDelta: -12,
        reason: 'Order allocation',
      },
      currentUser,
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
          NotificationType.PRODUCT_LOW_STOCK,
        resourceType: 'product',
        resourceId: 'product-1',
      }),
      expect.objectContaining({
        manager,
      }),
    );
  });

  it('does not duplicate a low-stock notification while status remains Low Stock', async () => {
    txInventoryRepository.findOne.mockResolvedValue({
      id: 'inventory-1',
      productId: 'product-1',
      locationId: 'location-1',
      quantity: 8,
    });

    mockGlobalTotals(8, 7);

    await service.adjust(
      {
        productId: 'product-1',
        locationId: 'location-1',
        quantityDelta: -1,
        reason: 'Small issue',
      },
      currentUser,
    );

    expect(
      notificationsService.notifyRoles,
    ).not.toHaveBeenCalled();
  });

  it('creates an out-of-stock notification when status crosses Low Stock -> Out of Stock', async () => {
    txInventoryRepository.findOne.mockResolvedValue({
      id: 'inventory-1',
      productId: 'product-1',
      locationId: 'location-1',
      quantity: 5,
    });

    mockGlobalTotals(5, 0);

    await service.adjust(
      {
        productId: 'product-1',
        locationId: 'location-1',
        quantityDelta: -5,
        reason: 'Consumed stock',
      },
      currentUser,
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
          NotificationType.PRODUCT_OUT_OF_STOCK,
        title: 'Product out of stock',
      }),
      expect.objectContaining({
        manager,
      }),
    );
  });

  it('does not create a warning notification when stock recovers', async () => {
    txInventoryRepository.findOne.mockResolvedValue({
      id: 'inventory-1',
      productId: 'product-1',
      locationId: 'location-1',
      quantity: 0,
    });

    mockGlobalTotals(0, 20);

    await service.adjust(
      {
        productId: 'product-1',
        locationId: 'location-1',
        quantityDelta: 20,
        reason: 'Restock',
      },
      currentUser,
    );

    expect(
      notificationsService.notifyRoles,
    ).not.toHaveBeenCalled();
  });
});

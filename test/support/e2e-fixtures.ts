import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { UserRole } from '../../src/common/enums/user-role.enum';
import { Inventory } from '../../src/inventory/entities/inventory.entity';
import { Location } from '../../src/locations/entities/location.entity';
import { Product } from '../../src/products/entities/product.entity';
import { TransferLine } from '../../src/transfers/entities/transfer-line.entity';
import { Transfer } from '../../src/transfers/entities/transfer.entity';
import { TransferStatus } from '../../src/transfers/enums/transfer-status.enum';
import { User } from '../../src/users/entities/user.entity';
import { Warehouse } from '../../src/warehouses/entities/warehouse.entity';

export const E2E_PASSWORD =
  'StockFlowTest123!';

export const IDS = {
  admin:
    '00000000-0000-4000-8000-000000000101',
  manager:
    '00000000-0000-4000-8000-000000000102',
  worker1:
    '00000000-0000-4000-8000-000000000103',
  worker2:
    '00000000-0000-4000-8000-000000000104',

  warehouse:
    '00000000-0000-4000-8000-000000000201',
  sourceLocation:
    '00000000-0000-4000-8000-000000000301',
  destinationLocation:
    '00000000-0000-4000-8000-000000000302',

  productA:
    '00000000-0000-4000-8000-000000000401',
  productB:
    '00000000-0000-4000-8000-000000000402',
} as const;

export interface SeededFixture {
  admin: User;
  manager: User;
  worker1: User;
  worker2: User;
  warehouse: Warehouse;
  sourceLocation: Location;
  destinationLocation: Location;
  productA: Product;
  productB: Product;
}

export async function seedBaseFixture(
  dataSource: DataSource,
): Promise<SeededFixture> {
  const userRepository =
    dataSource.getRepository(User);
  const warehouseRepository =
    dataSource.getRepository(Warehouse);
  const locationRepository =
    dataSource.getRepository(Location);
  const productRepository =
    dataSource.getRepository(Product);

  const passwordHash = await bcrypt.hash(
    E2E_PASSWORD,
    4,
  );

  const [admin, manager, worker1, worker2] =
    await userRepository.save([
      userRepository.create({
        id: IDS.admin,
        name: 'E2E Admin',
        email:
          'admin.e2e@stockflow.local',
        passwordHash,
        role: UserRole.ADMIN,
        isActive: true,
        refreshTokenHash: null,
      }),
      userRepository.create({
        id: IDS.manager,
        name: 'E2E Manager',
        email:
          'manager.e2e@stockflow.local',
        passwordHash,
        role:
          UserRole.WAREHOUSE_MANAGER,
        isActive: true,
        refreshTokenHash: null,
      }),
      userRepository.create({
        id: IDS.worker1,
        name: 'E2E Worker One',
        email:
          'worker1.e2e@stockflow.local',
        passwordHash,
        role:
          UserRole.WAREHOUSE_WORKER,
        isActive: true,
        refreshTokenHash: null,
      }),
      userRepository.create({
        id: IDS.worker2,
        name: 'E2E Worker Two',
        email:
          'worker2.e2e@stockflow.local',
        passwordHash,
        role:
          UserRole.WAREHOUSE_WORKER,
        isActive: true,
        refreshTokenHash: null,
      }),
    ]);

  const warehouse =
    await warehouseRepository.save(
      warehouseRepository.create({
        id: IDS.warehouse,
        name: 'E2E Warehouse',
        code: 'E2E-WH',
        address: 'Test address',
        active: true,
      }),
    );

  const [sourceLocation, destinationLocation] =
    await locationRepository.save([
      locationRepository.create({
        id: IDS.sourceLocation,
        name: 'E2E Source',
        code: 'SRC',
        warehouseId: warehouse.id,
        active: true,
      }),
      locationRepository.create({
        id: IDS.destinationLocation,
        name: 'E2E Destination',
        code: 'DST',
        warehouseId: warehouse.id,
        active: true,
      }),
    ]);

  const [productA, productB] =
    await productRepository.save([
      productRepository.create({
        id: IDS.productA,
        name: 'E2E Keyboard',
        sku: 'E2E-KEY-001',
        barcode: '990000000001',
        description:
          'Primary e2e product',
        unit: 'pcs',
        reorderLevel: 10,
        active: true,
      }),
      productRepository.create({
        id: IDS.productB,
        name: 'E2E Mouse',
        sku: 'E2E-MOU-001',
        barcode: '990000000002',
        description:
          'Secondary e2e product',
        unit: 'pcs',
        reorderLevel: 5,
        active: true,
      }),
    ]);

  return {
    admin,
    manager,
    worker1,
    worker2,
    warehouse,
    sourceLocation,
    destinationLocation,
    productA,
    productB,
  };
}

export async function seedInventory(
  dataSource: DataSource,
  input: {
    productId: string;
    locationId: string;
    quantity: number;
  },
): Promise<Inventory> {
  const repository =
    dataSource.getRepository(Inventory);

  return repository.save(
    repository.create(input),
  );
}

export async function seedTransfer(
  dataSource: DataSource,
  input: {
    reference: string;
    assignedUserId?: string;
    status?: TransferStatus;
    lines: Array<{
      productId: string;
      quantity: number;
    }>;
  },
): Promise<Transfer> {
  const transferRepository =
    dataSource.getRepository(Transfer);
  const lineRepository =
    dataSource.getRepository(TransferLine);

  const status =
    input.status ??
    TransferStatus.IN_PROGRESS;

  const transfer =
    await transferRepository.save(
      transferRepository.create({
        reference: input.reference,
        sourceLocationId:
          IDS.sourceLocation,
        destinationLocationId:
          IDS.destinationLocation,
        assignedUserId:
          input.assignedUserId ??
          IDS.worker1,
        createdById: IDS.manager,
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
      }),
    );

  await lineRepository.save(
    input.lines.map((line) =>
      lineRepository.create({
        transferId: transfer.id,
        productId: line.productId,
        quantity: line.quantity,
        processedQuantity: 0,
      }),
    ),
  );

  return transferRepository.findOneOrFail({
    where: {
      id: transfer.id,
    },
    relations: {
      lines: true,
    },
  });
}

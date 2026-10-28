import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Inventory } from '../src/inventory/entities/inventory.entity';
import { Notification } from '../src/notifications/entities/notification.entity';
import { NotificationType } from '../src/notifications/enums/notification-type.enum';
import { Product } from '../src/products/entities/product.entity';
import { StockMovement } from '../src/stock-movements/entities/stock-movement.entity';
import { TransferLine } from '../src/transfers/entities/transfer-line.entity';
import { Transfer } from '../src/transfers/entities/transfer.entity';
import { TransferStatus } from '../src/transfers/enums/transfer-status.enum';
import {
  createE2eApp,
  resetE2eDatabase,
} from './support/e2e-test-app';
import {
  E2E_PASSWORD,
  IDS,
  SeededFixture,
  seedBaseFixture,
  seedInventory,
  seedTransfer,
} from './support/e2e-fixtures';

describe('StockFlow V1 PostgreSQL e2e', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let fixture: SeededFixture;

  beforeAll(async () => {
    const created =
      await createE2eApp();

    app = created.app;
    dataSource = created.dataSource;
  });

  beforeEach(async () => {
    await resetE2eDatabase(
      dataSource,
    );

    fixture =
      await seedBaseFixture(
        dataSource,
      );
  });

  afterAll(async () => {
    await app.close();
  });

  function server() {
    return app.getHttpServer();
  }

  async function login(
    email: string,
  ): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const response = await request(
      server(),
    )
      .post('/api/auth/login')
      .send({
        email,
        password: E2E_PASSWORD,
      })
      .expect(201);

    expect(
      response.body.accessToken,
    ).toEqual(expect.any(String));

    expect(
      response.body.refreshToken,
    ).toEqual(expect.any(String));

    return {
      accessToken:
        response.body.accessToken,
      refreshToken:
        response.body.refreshToken,
    };
  }

  describe('JWT authentication and RBAC', () => {
    it('rejects a protected endpoint without an access token', async () => {
      await request(server())
        .get('/api/users/me')
        .expect(401);
    });

    it('logs in with real bcrypt credentials and authorizes the access token', async () => {
      const tokens = await login(
        fixture.manager.email,
      );

      const response = await request(
        server(),
      )
        .get('/api/users/me')
        .set(
          'Authorization',
          `Bearer ${tokens.accessToken}`,
        )
        .expect(200);

      expect(response.body).toEqual(
        expect.objectContaining({
          id: IDS.manager,
          email:
            fixture.manager.email,
          role:
            'warehouse_manager',
          isActive: true,
        }),
      );
    });

    it('rotates refresh tokens so the previous refresh token cannot be reused', async () => {
      const first = await login(
        fixture.worker1.email,
      );

      const refreshed =
        await request(server())
          .post('/api/auth/refresh')
          .send({
            refreshToken:
              first.refreshToken,
          })
          .expect(201);

      expect(
        refreshed.body.refreshToken,
      ).not.toBe(
        first.refreshToken,
      );

      await request(server())
        .post('/api/auth/refresh')
        .send({
          refreshToken:
            first.refreshToken,
        })
        .expect(401);
    });

    it('allows a manager to create a product but rejects a warehouse worker', async () => {
      const manager = await login(
        fixture.manager.email,
      );

      const worker = await login(
        fixture.worker1.email,
      );

      const body = {
        name: 'E2E Scanner',
        sku: 'E2E-SCN-900',
        barcode: '990000000900',
        unit: 'pcs',
        reorderLevel: 3,
      };

      await request(server())
        .post('/api/products')
        .set(
          'Authorization',
          `Bearer ${worker.accessToken}`,
        )
        .send(body)
        .expect(403);

      const created = await request(
        server(),
      )
        .post('/api/products')
        .set(
          'Authorization',
          `Bearer ${manager.accessToken}`,
        )
        .send(body)
        .expect(201);

      expect(created.body).toEqual(
        expect.objectContaining({
          name: 'E2E Scanner',
          sku: 'E2E-SCN-900',
          reorderLevel: 3,
        }),
      );

      await request(server())
        .get('/api/products')
        .set(
          'Authorization',
          `Bearer ${worker.accessToken}`,
        )
        .expect(200);
    });
  });

  describe('real PostgreSQL constraints', () => {
    it('enforces unique inventory per product and location', async () => {
      await seedInventory(
        dataSource,
        {
          productId:
            fixture.productA.id,
          locationId:
            fixture.sourceLocation.id,
          quantity: 5,
        },
      );

      const repository =
        dataSource.getRepository(
          Inventory,
        );

      try {
        await repository.save(
          repository.create({
            productId:
              fixture.productA.id,
            locationId:
              fixture.sourceLocation.id,
            quantity: 9,
          }),
        );

        throw new Error(
          'Expected PostgreSQL unique constraint violation',
        );
      } catch (error) {
        expect(
          (error as {
            driverError?: {
              code?: string;
            };
          }).driverError?.code,
        ).toBe('23505');
      }
    });

    it('enforces the non-negative reorder-level check constraint', async () => {
      const repository =
        dataSource.getRepository(
          Product,
        );

      fixture.productA.reorderLevel =
        -1;

      try {
        await repository.save(
          fixture.productA,
        );

        throw new Error(
          'Expected PostgreSQL check constraint violation',
        );
      } catch (error) {
        expect(
          (error as {
            driverError?: {
              code?: string;
            };
          }).driverError?.code,
        ).toBe('23514');
      }
    });
  });

  describe('persisted operational notifications', () => {
    it('persists warning transitions and does not duplicate Low Stock while the status remains low', async () => {
      await seedInventory(
        dataSource,
        {
          productId:
            fixture.productA.id,
          locationId:
            fixture.sourceLocation.id,
          quantity: 20,
        },
      );

      const manager = await login(
        fixture.manager.email,
      );

      const authorization =
        `Bearer ${manager.accessToken}`;

      await request(server())
        .post('/api/inventory/adjust')
        .set(
          'Authorization',
          authorization,
        )
        .send({
          productId:
            fixture.productA.id,
          locationId:
            fixture.sourceLocation.id,
          quantityDelta: -12,
          reason:
            'E2E low stock transition',
        })
        .expect(201);

      const notificationRepository =
        dataSource.getRepository(
          Notification,
        );

      expect(
        await notificationRepository.count(
          {
            where: {
              type:
                NotificationType.PRODUCT_LOW_STOCK,
              resourceId:
                fixture.productA.id,
            },
          },
        ),
      ).toBe(2);

      // 8 -> 7 remains Low Stock. No duplicate warning.
      await request(server())
        .post('/api/inventory/adjust')
        .set(
          'Authorization',
          authorization,
        )
        .send({
          productId:
            fixture.productA.id,
          locationId:
            fixture.sourceLocation.id,
          quantityDelta: -1,
          reason:
            'E2E still low stock',
        })
        .expect(201);

      expect(
        await notificationRepository.count(
          {
            where: {
              type:
                NotificationType.PRODUCT_LOW_STOCK,
              resourceId:
                fixture.productA.id,
            },
          },
        ),
      ).toBe(2);

      // 7 -> 0 crosses Low Stock -> Out of Stock.
      await request(server())
        .post('/api/inventory/adjust')
        .set(
          'Authorization',
          authorization,
        )
        .send({
          productId:
            fixture.productA.id,
          locationId:
            fixture.sourceLocation.id,
          quantityDelta: -7,
          reason:
            'E2E out of stock transition',
        })
        .expect(201);

      expect(
        await notificationRepository.count(
          {
            where: {
              type:
                NotificationType.PRODUCT_OUT_OF_STOCK,
              resourceId:
                fixture.productA.id,
            },
          },
        ),
      ).toBe(2);
    });

    it('prevents one user from reading another user notification', async () => {
      const repository =
        dataSource.getRepository(
          Notification,
        );

      const notification =
        await repository.save(
          repository.create({
            userId:
              fixture.worker1.id,
            type:
              NotificationType.TRANSFER_ASSIGNED,
            title:
              'E2E private notification',
            message:
              'Only worker one should own this.',
            resourceType: null,
            resourceId: null,
            readAt: null,
          }),
        );

      const worker1 = await login(
        fixture.worker1.email,
      );

      const worker2 = await login(
        fixture.worker2.email,
      );

      await request(server())
        .post(
          `/api/notifications/${notification.id}/read`,
        )
        .set(
          'Authorization',
          `Bearer ${worker2.accessToken}`,
        )
        .expect(404);

      await request(server())
        .post(
          `/api/notifications/${notification.id}/read`,
        )
        .set(
          'Authorization',
          `Bearer ${worker1.accessToken}`,
        )
        .expect(201);

      const reloaded =
        await repository.findOneByOrFail(
          {
            id: notification.id,
          },
        );

      expect(
        reloaded.readAt,
      ).toBeInstanceOf(Date);
    });
  });

  describe('transfer lifecycle and atomicity', () => {
    it('completes a transfer through HTTP and commits stock, line, ledger, and transfer status together', async () => {
      await seedInventory(
        dataSource,
        {
          productId:
            fixture.productA.id,
          locationId:
            fixture.sourceLocation.id,
          quantity: 20,
        },
      );

      await seedInventory(
        dataSource,
        {
          productId:
            fixture.productA.id,
          locationId:
            fixture.destinationLocation.id,
          quantity: 5,
        },
      );

      const transfer =
        await seedTransfer(
          dataSource,
          {
            reference:
              'TRF-E2E-SUCCESS',
            assignedUserId:
              fixture.worker1.id,
            status:
              TransferStatus.IN_PROGRESS,
            lines: [
              {
                productId:
                  fixture.productA.id,
                quantity: 7,
              },
            ],
          },
        );

      const worker = await login(
        fixture.worker1.email,
      );

      await request(server())
        .post(
          `/api/transfers/${transfer.id}/complete`,
        )
        .set(
          'Authorization',
          `Bearer ${worker.accessToken}`,
        )
        .expect(201);

      const inventoryRepository =
        dataSource.getRepository(
          Inventory,
        );

      const source =
        await inventoryRepository.findOneByOrFail(
          {
            productId:
              fixture.productA.id,
            locationId:
              fixture.sourceLocation.id,
          },
        );

      const destination =
        await inventoryRepository.findOneByOrFail(
          {
            productId:
              fixture.productA.id,
            locationId:
              fixture.destinationLocation.id,
          },
        );

      expect(source.quantity).toBe(
        13,
      );

      expect(
        destination.quantity,
      ).toBe(12);

      const line =
        await dataSource
          .getRepository(TransferLine)
          .findOneByOrFail({
            transferId:
              transfer.id,
            productId:
              fixture.productA.id,
          });

      expect(
        line.processedQuantity,
      ).toBe(7);

      const completed =
        await dataSource
          .getRepository(Transfer)
          .findOneByOrFail({
            id: transfer.id,
          });

      expect(completed.status).toBe(
        TransferStatus.DONE,
      );

      expect(
        completed.completedAt,
      ).toBeInstanceOf(Date);

      expect(
        await dataSource
          .getRepository(StockMovement)
          .count({
            where: {
              transferId:
                transfer.id,
            },
          }),
      ).toBe(1);
    });

    it('rolls back earlier line changes when a later transfer line fails', async () => {
      // Product A sorts before Product B by our fixed UUIDs.
      // A succeeds first; B then fails for insufficient stock.
      // The entire transaction must roll A back.
      await seedInventory(
        dataSource,
        {
          productId:
            fixture.productA.id,
          locationId:
            fixture.sourceLocation.id,
          quantity: 20,
        },
      );

      await seedInventory(
        dataSource,
        {
          productId:
            fixture.productA.id,
          locationId:
            fixture.destinationLocation.id,
          quantity: 5,
        },
      );

      await seedInventory(
        dataSource,
        {
          productId:
            fixture.productB.id,
          locationId:
            fixture.sourceLocation.id,
          quantity: 2,
        },
      );

      const transfer =
        await seedTransfer(
          dataSource,
          {
            reference:
              'TRF-E2E-ROLLBACK',
            assignedUserId:
              fixture.worker1.id,
            status:
              TransferStatus.IN_PROGRESS,
            lines: [
              {
                productId:
                  fixture.productA.id,
                quantity: 7,
              },
              {
                productId:
                  fixture.productB.id,
                quantity: 5,
              },
            ],
          },
        );

      const worker = await login(
        fixture.worker1.email,
      );

      await request(server())
        .post(
          `/api/transfers/${transfer.id}/complete`,
        )
        .set(
          'Authorization',
          `Bearer ${worker.accessToken}`,
        )
        .expect(400);

      const inventoryRepository =
        dataSource.getRepository(
          Inventory,
        );

      const sourceA =
        await inventoryRepository.findOneByOrFail(
          {
            productId:
              fixture.productA.id,
            locationId:
              fixture.sourceLocation.id,
          },
        );

      const destinationA =
        await inventoryRepository.findOneByOrFail(
          {
            productId:
              fixture.productA.id,
            locationId:
              fixture.destinationLocation.id,
          },
        );

      const sourceB =
        await inventoryRepository.findOneByOrFail(
          {
            productId:
              fixture.productB.id,
            locationId:
              fixture.sourceLocation.id,
          },
        );

      // These prove line A was rolled back after line B failed.
      expect(sourceA.quantity).toBe(
        20,
      );

      expect(
        destinationA.quantity,
      ).toBe(5);

      expect(sourceB.quantity).toBe(
        2,
      );

      const lines =
        await dataSource
          .getRepository(TransferLine)
          .find({
            where: {
              transferId:
                transfer.id,
            },
            order: {
              productId: 'ASC',
            },
          });

      expect(
        lines.map(
          (line) =>
            line.processedQuantity,
        ),
      ).toEqual([0, 0]);

      const persistedTransfer =
        await dataSource
          .getRepository(Transfer)
          .findOneByOrFail({
            id: transfer.id,
          });

      expect(
        persistedTransfer.status,
      ).toBe(
        TransferStatus.IN_PROGRESS,
      );

      expect(
        persistedTransfer.completedAt,
      ).toBeNull();

      expect(
        await dataSource
          .getRepository(StockMovement)
          .count({
            where: {
              transferId:
                transfer.id,
            },
          }),
      ).toBe(0);
    });

    it('prevents a worker from completing a transfer assigned to another worker', async () => {
      await seedInventory(
        dataSource,
        {
          productId:
            fixture.productA.id,
          locationId:
            fixture.sourceLocation.id,
          quantity: 20,
        },
      );

      const transfer =
        await seedTransfer(
          dataSource,
          {
            reference:
              'TRF-E2E-OTHER-WORKER',
            assignedUserId:
              fixture.worker2.id,
            status:
              TransferStatus.IN_PROGRESS,
            lines: [
              {
                productId:
                  fixture.productA.id,
                quantity: 2,
              },
            ],
          },
        );

      const worker1 = await login(
        fixture.worker1.email,
      );

      await request(server())
        .post(
          `/api/transfers/${transfer.id}/complete`,
        )
        .set(
          'Authorization',
          `Bearer ${worker1.accessToken}`,
        )
        .expect(403);

      const persisted =
        await dataSource
          .getRepository(Transfer)
          .findOneByOrFail({
            id: transfer.id,
          });

      expect(persisted.status).toBe(
        TransferStatus.IN_PROGRESS,
      );
    });

    it('returns only transfers assigned to the authenticated worker', async () => {
      await seedTransfer(
        dataSource,
        {
          reference:
            'TRF-E2E-WORKER-1',
          assignedUserId:
            fixture.worker1.id,
          status:
            TransferStatus.READY,
          lines: [
            {
              productId:
                fixture.productA.id,
              quantity: 1,
            },
          ],
        },
      );

      await seedTransfer(
        dataSource,
        {
          reference:
            'TRF-E2E-WORKER-2',
          assignedUserId:
            fixture.worker2.id,
          status:
            TransferStatus.READY,
          lines: [
            {
              productId:
                fixture.productB.id,
              quantity: 1,
            },
          ],
        },
      );

      const worker1 = await login(
        fixture.worker1.email,
      );

      const response = await request(
        server(),
      )
        .get('/api/transfers')
        .set(
          'Authorization',
          `Bearer ${worker1.accessToken}`,
        )
        .expect(200);

      expect(response.body).toHaveLength(
        1,
      );

      expect(
        response.body[0].reference,
      ).toBe('TRF-E2E-WORKER-1');

      expect(
        response.body[0].assignedUserId,
      ).toBe(fixture.worker1.id);
    });
  });
});

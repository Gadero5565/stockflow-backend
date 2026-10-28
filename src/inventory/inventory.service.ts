import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { LocationsService } from '../locations/locations.service';
import { NotificationType } from '../notifications/enums/notification-type.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { Product } from '../products/entities/product.entity';
import { ProductsService } from '../products/products.service';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { Inventory } from './entities/inventory.entity';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    private readonly productsService: ProductsService,
    private readonly locationsService: LocationsService,
    private readonly notificationsService: NotificationsService,
    private readonly stockMovementsService: StockMovementsService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(query: InventoryQueryDto): Promise<Inventory[]> {
    const qb = this.inventoryRepository
      .createQueryBuilder('inventory')
      .leftJoinAndSelect('inventory.product', 'product')
      .leftJoinAndSelect('inventory.location', 'location')
      .leftJoinAndSelect('location.warehouse', 'warehouse')
      .where('product.active = :productActive', {
        productActive: true,
      })
      .andWhere('location.active = :locationActive', {
        locationActive: true,
      })
      .andWhere('warehouse.active = :warehouseActive', {
        warehouseActive: true,
      })
      .orderBy('warehouse.name', 'ASC')
      .addOrderBy('location.name', 'ASC')
      .addOrderBy('product.name', 'ASC');

    if (query.productId) {
      qb.andWhere('inventory.productId = :productId', {
        productId: query.productId,
      });
    }

    if (query.locationId) {
      qb.andWhere('inventory.locationId = :locationId', {
        locationId: query.locationId,
      });
    }

    if (query.warehouseId) {
      qb.andWhere('location.warehouseId = :warehouseId', {
        warehouseId: query.warehouseId,
      });
    }

    const search = query.search?.trim();

    if (search) {
      qb.andWhere(
        `(
          LOWER(product.name) LIKE LOWER(:search)
          OR LOWER(product.sku) LIKE LOWER(:search)
          OR LOWER(COALESCE(product.barcode, '')) LIKE LOWER(:search)
          OR LOWER(location.name) LIKE LOWER(:search)
          OR LOWER(location.code) LIKE LOWER(:search)
          OR LOWER(warehouse.name) LIKE LOWER(:search)
          OR LOWER(warehouse.code) LIKE LOWER(:search)
        )`,
        { search: `%${search}%` },
      );
    }

    return qb.getMany();
  }

  async findOne(id: string): Promise<Inventory> {
    const inventory = await this.inventoryRepository
      .createQueryBuilder('inventory')
      .leftJoinAndSelect('inventory.product', 'product')
      .leftJoinAndSelect('inventory.location', 'location')
      .leftJoinAndSelect('location.warehouse', 'warehouse')
      .where('inventory.id = :id', { id })
      .andWhere('product.active = :productActive', {
        productActive: true,
      })
      .andWhere('location.active = :locationActive', {
        locationActive: true,
      })
      .andWhere('warehouse.active = :warehouseActive', {
        warehouseActive: true,
      })
      .getOne();

    if (!inventory) {
      throw new NotFoundException(
        'Inventory record not found',
      );
    }

    return inventory;
  }

  async getHealth() {
    const rows = await this.dataSource
      .getRepository(Product)
      .createQueryBuilder('product')
      .leftJoin(
        'inventory',
        'inventory',
        'inventory."productId" = product.id',
      )
      .leftJoin(
        'locations',
        'location',
        'location.id = inventory."locationId"',
      )
      .leftJoin(
        'warehouses',
        'warehouse',
        'warehouse.id = location."warehouseId"',
      )
      .where('product.active = TRUE')
      .select('product.id', 'productId')
      .addSelect('product.name', 'name')
      .addSelect('product.sku', 'sku')
      .addSelect('product.barcode', 'barcode')
      .addSelect('product.unit', 'unit')
      .addSelect(
        'product."reorderLevel"',
        'reorderLevel',
      )
      .addSelect(
        `COALESCE(
          SUM(
            CASE
              WHEN location.active = TRUE
                AND warehouse.active = TRUE
              THEN inventory.quantity
              ELSE 0
            END
          ),
          0
        )`,
        'totalQuantity',
      )
      .groupBy('product.id')
      .addGroupBy('product.name')
      .addGroupBy('product.sku')
      .addGroupBy('product.barcode')
      .addGroupBy('product.unit')
      .addGroupBy('product."reorderLevel"')
      .orderBy('product.name', 'ASC')
      .getRawMany<{
        productId: string;
        name: string;
        sku: string;
        barcode: string | null;
        unit: string;
        reorderLevel: number | string;
        totalQuantity: number | string;
      }>();

    const products = rows.map((row) => {
      const totalQuantity =
        Number(row.totalQuantity) || 0;
      const reorderLevel =
        Number(row.reorderLevel) || 0;

      const status =
        totalQuantity === 0
          ? 'out_of_stock'
          : reorderLevel > 0 &&
              totalQuantity <= reorderLevel
            ? 'low_stock'
            : 'available';

      return {
        productId: row.productId,
        name: row.name,
        sku: row.sku,
        barcode: row.barcode,
        unit: row.unit,
        reorderLevel,
        totalQuantity,
        status,
      };
    });

    const outOfStock = products.filter(
      (product) =>
        product.status === 'out_of_stock',
    ).length;

    const lowStock = products.filter(
      (product) =>
        product.status === 'low_stock',
    ).length;

    const available = products.filter(
      (product) =>
        product.status === 'available',
    ).length;

    return {
      summary: {
        totalProducts: products.length,
        totalUnits: products.reduce(
          (sum, product) =>
            sum + product.totalQuantity,
          0,
        ),
        outOfStock,
        lowStock,
        available,
      },
      products,
    };
  }

  async adjust(
    dto: AdjustInventoryDto,
    currentUser: AuthenticatedUser,
  ): Promise<Inventory> {
    const product =
      await this.productsService.findOne(dto.productId);
    await this.locationsService.findOne(dto.locationId);

    const inventoryId =
      await this.dataSource.transaction(
        async (manager) => {
          const repository =
            manager.getRepository(Inventory);

          const oldTotal =
            await this.getGlobalQuantity(
              dto.productId,
              manager,
            );

          let inventory =
            await repository.findOne({
              where: {
                productId: dto.productId,
                locationId: dto.locationId,
              },
              lock: {
                mode: 'pessimistic_write',
              },
            });

          if (!inventory) {
            if (dto.quantityDelta < 0) {
              throw new BadRequestException(
                'Cannot remove stock from an empty inventory location',
              );
            }

            inventory = repository.create({
              productId: dto.productId,
              locationId: dto.locationId,
              quantity: dto.quantityDelta,
            });
          } else {
            const newQuantity =
              inventory.quantity +
              dto.quantityDelta;

            if (newQuantity < 0) {
              throw new BadRequestException(
                `Insufficient stock. Available quantity is ${inventory.quantity}`,
              );
            }

            inventory.quantity = newQuantity;
          }

          const saved =
            await repository.save(inventory);

          await this.stockMovementsService
            .recordAdjustment(manager, {
              productId: dto.productId,
              locationId: dto.locationId,
              quantityDelta: dto.quantityDelta,
              createdById: currentUser.id,
              reason: dto.reason,
            });

          const newTotal =
            await this.getGlobalQuantity(
              dto.productId,
              manager,
            );

          const oldStatus = this.stockStatus(
            oldTotal,
            product.reorderLevel,
          );

          const newStatus = this.stockStatus(
            newTotal,
            product.reorderLevel,
          );

          if (
            oldStatus !== newStatus &&
            (newStatus === 'low_stock' ||
              newStatus === 'out_of_stock')
          ) {
            await this.notificationsService
              .notifyRoles(
                [
                  UserRole.ADMIN,
                  UserRole.WAREHOUSE_MANAGER,
                ],
                {
                  type:
                    newStatus === 'out_of_stock'
                      ? NotificationType.PRODUCT_OUT_OF_STOCK
                      : NotificationType.PRODUCT_LOW_STOCK,
                  title:
                    newStatus === 'out_of_stock'
                      ? 'Product out of stock'
                      : 'Product low on stock',
                  message:
                    newStatus === 'out_of_stock'
                      ? `${product.name} is now out of stock.`
                      : `${product.name} has ${newTotal} ${product.unit} remaining (threshold ${product.reorderLevel}).`,
                  resourceType: 'product',
                  resourceId: product.id,
                },
                {
                  manager,
                },
              );
          }

          return saved.id;
        },
      );

    return this.findOne(inventoryId);
  }

  private async getGlobalQuantity(
    productId: string,
    manager: EntityManager,
  ): Promise<number> {
    const raw = await manager
      .getRepository(Inventory)
      .createQueryBuilder('inventory')
      .innerJoin(
        'inventory.location',
        'location',
        'location.active = TRUE',
      )
      .innerJoin(
        'location.warehouse',
        'warehouse',
        'warehouse.active = TRUE',
      )
      .where(
        'inventory.productId = :productId',
        { productId },
      )
      .select(
        'COALESCE(SUM(inventory.quantity), 0)',
        'total',
      )
      .getRawOne<{ total: string | number }>();

    return Number(raw?.total ?? 0);
  }

  private stockStatus(
    totalQuantity: number,
    reorderLevel: number,
  ): 'out_of_stock' | 'low_stock' | 'available' {
    if (totalQuantity === 0) {
      return 'out_of_stock';
    }

    if (
      reorderLevel > 0 &&
      totalQuantity <= reorderLevel
    ) {
      return 'low_stock';
    }

    return 'available';
  }
}


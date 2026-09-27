import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { LocationsService } from '../locations/locations.service';
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
    private readonly stockMovementsService: StockMovementsService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(query: InventoryQueryDto): Promise<Inventory[]> {
    const qb = this.inventoryRepository
      .createQueryBuilder('inventory')
      .leftJoinAndSelect('inventory.product', 'product')
      .leftJoinAndSelect('inventory.location', 'location')
      .leftJoinAndSelect('location.warehouse', 'warehouse')
      .where('product.active = :productActive', { productActive: true })
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
      .andWhere('product.active = :productActive', { productActive: true })
      .andWhere('location.active = :locationActive', {
        locationActive: true,
      })
      .andWhere('warehouse.active = :warehouseActive', {
        warehouseActive: true,
      })
      .getOne();

    if (!inventory) {
      throw new NotFoundException('Inventory record not found');
    }

    return inventory;
  }

  async adjust(
    dto: AdjustInventoryDto,
    currentUser: AuthenticatedUser,
  ): Promise<Inventory> {
    await this.productsService.findOne(dto.productId);
    await this.locationsService.findOne(dto.locationId);

    const inventoryId = await this.dataSource.transaction(
      async (manager) => {
        const repository = manager.getRepository(Inventory);

        let inventory = await repository.findOne({
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
          const newQuantity = inventory.quantity + dto.quantityDelta;

          if (newQuantity < 0) {
            throw new BadRequestException(
              `Insufficient stock. Available quantity is ${inventory.quantity}`,
            );
          }

          inventory.quantity = newQuantity;
        }

        const saved = await repository.save(inventory);

        await this.stockMovementsService.recordAdjustment(manager, {
          productId: dto.productId,
          locationId: dto.locationId,
          quantityDelta: dto.quantityDelta,
          createdById: currentUser.id,
          reason: dto.reason,
        });

        return saved.id;
      },
    );

    return this.findOne(inventoryId);
  }
}

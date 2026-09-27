import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { StockMovementQueryDto } from './dto/stock-movement-query.dto';
import { StockMovement } from './entities/stock-movement.entity';
import { StockMovementType } from './enums/stock-movement-type.enum';

interface RecordAdjustmentInput {
  productId: string;
  locationId: string;
  quantityDelta: number;
  createdById: string;
  reason: string;
}

interface RecordTransferInput {
  productId: string;
  sourceLocationId: string;
  destinationLocationId: string;
  quantity: number;
  transferId: string;
  createdById: string;
}

@Injectable()
export class StockMovementsService {
  constructor(
    @InjectRepository(StockMovement)
    private readonly movementRepository: Repository<StockMovement>,
  ) {}

  async findAll(query: StockMovementQueryDto): Promise<StockMovement[]> {
    const qb = this.movementRepository
      .createQueryBuilder('movement')
      .leftJoinAndSelect('movement.product', 'product')
      .leftJoinAndSelect('movement.sourceLocation', 'sourceLocation')
      .leftJoinAndSelect('sourceLocation.warehouse', 'sourceWarehouse')
      .leftJoinAndSelect(
        'movement.destinationLocation',
        'destinationLocation',
      )
      .leftJoinAndSelect(
        'destinationLocation.warehouse',
        'destinationWarehouse',
      )
      .leftJoinAndSelect('movement.transfer', 'transfer')
      .leftJoinAndSelect('movement.createdBy', 'createdBy')
      .orderBy('movement.createdAt', 'DESC');

    if (query.productId) {
      qb.andWhere('movement.productId = :productId', {
        productId: query.productId,
      });
    }

    if (query.locationId) {
      qb.andWhere(
        `(
          movement.sourceLocationId = :locationId
          OR movement.destinationLocationId = :locationId
        )`,
        { locationId: query.locationId },
      );
    }

    if (query.warehouseId) {
      qb.andWhere(
        `(
          sourceLocation.warehouseId = :warehouseId
          OR destinationLocation.warehouseId = :warehouseId
        )`,
        { warehouseId: query.warehouseId },
      );
    }

    if (query.transferId) {
      qb.andWhere('movement.transferId = :transferId', {
        transferId: query.transferId,
      });
    }

    if (query.createdById) {
      qb.andWhere('movement.createdById = :createdById', {
        createdById: query.createdById,
      });
    }

    if (query.type) {
      qb.andWhere('movement.type = :type', {
        type: query.type,
      });
    }

    const search = query.search?.trim();

    if (search) {
      qb.andWhere(
        `(
          LOWER(product.name) LIKE LOWER(:search)
          OR LOWER(product.sku) LIKE LOWER(:search)
          OR LOWER(COALESCE(product.barcode, '')) LIKE LOWER(:search)
          OR LOWER(COALESCE(sourceLocation.name, '')) LIKE LOWER(:search)
          OR LOWER(COALESCE(sourceLocation.code, '')) LIKE LOWER(:search)
          OR LOWER(COALESCE(destinationLocation.name, '')) LIKE LOWER(:search)
          OR LOWER(COALESCE(destinationLocation.code, '')) LIKE LOWER(:search)
          OR LOWER(COALESCE(transfer.reference, '')) LIKE LOWER(:search)
          OR LOWER(COALESCE(movement.reason, '')) LIKE LOWER(:search)
        )`,
        { search: `%${search}%` },
      );
    }

    return qb.getMany();
  }

  async findOne(id: string): Promise<StockMovement> {
    const movement = await this.movementRepository.findOne({
      where: { id },
      relations: {
        product: true,
        sourceLocation: {
          warehouse: true,
        },
        destinationLocation: {
          warehouse: true,
        },
        transfer: true,
        createdBy: true,
      },
    });

    if (!movement) {
      throw new NotFoundException('Stock movement not found');
    }

    return movement;
  }

  async recordAdjustment(
    manager: EntityManager,
    input: RecordAdjustmentInput,
  ): Promise<StockMovement> {
    if (input.quantityDelta === 0) {
      throw new BadRequestException(
        'Adjustment quantity cannot be zero',
      );
    }

    const repository = manager.getRepository(StockMovement);
    const isIncrease = input.quantityDelta > 0;

    const movement = repository.create({
      productId: input.productId,
      sourceLocationId: isIncrease ? null : input.locationId,
      destinationLocationId: isIncrease ? input.locationId : null,
      quantity: Math.abs(input.quantityDelta),
      type: StockMovementType.ADJUSTMENT,
      transferId: null,
      createdById: input.createdById,
      reason: input.reason.trim(),
    });

    return repository.save(movement);
  }

  async recordTransfer(
    manager: EntityManager,
    input: RecordTransferInput,
  ): Promise<StockMovement> {
    if (input.quantity <= 0) {
      throw new BadRequestException(
        'Transfer movement quantity must be greater than zero',
      );
    }

    const repository = manager.getRepository(StockMovement);

    const movement = repository.create({
      productId: input.productId,
      sourceLocationId: input.sourceLocationId,
      destinationLocationId: input.destinationLocationId,
      quantity: input.quantity,
      type: StockMovementType.TRANSFER,
      transferId: input.transferId,
      createdById: input.createdById,
      reason: null,
    });

    return repository.save(movement);
  }
}

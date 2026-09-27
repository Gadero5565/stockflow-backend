import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Inventory } from '../inventory/entities/inventory.entity';
import { LocationsService } from '../locations/locations.service';
import { ProductsService } from '../products/products.service';
import { UsersService } from '../users/users.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { TransferQueryDto } from './dto/transfer-query.dto';
import { TransferLine } from './entities/transfer-line.entity';
import { Transfer } from './entities/transfer.entity';
import { TransferStatus } from './enums/transfer-status.enum';

@Injectable()
export class TransfersService {
  constructor(
    @InjectRepository(Transfer)
    private readonly transferRepository: Repository<Transfer>,
    @InjectRepository(TransferLine)
    private readonly transferLineRepository: Repository<TransferLine>,
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    private readonly locationsService: LocationsService,
    private readonly productsService: ProductsService,
    private readonly usersService: UsersService,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    dto: CreateTransferDto,
    currentUser: AuthenticatedUser,
  ): Promise<Transfer> {
    if (dto.sourceLocationId === dto.destinationLocationId) {
      throw new BadRequestException(
        'Source and destination locations must be different',
      );
    }

    await Promise.all([
      this.locationsService.findOne(dto.sourceLocationId),
      this.locationsService.findOne(dto.destinationLocationId),
    ]);

    const assignedUser = await this.usersService.findById(dto.assignedUserId);

    if (!assignedUser.isActive) {
      throw new BadRequestException('Assigned user is inactive');
    }

    if (assignedUser.role !== UserRole.WAREHOUSE_WORKER) {
      throw new BadRequestException(
        'Transfers must be assigned to a warehouse worker',
      );
    }

    this.ensureNoDuplicateProducts(dto);

    await Promise.all(
      dto.lines.map((line) => this.productsService.findOne(line.productId)),
    );

    const transferId = await this.dataSource.transaction(async (manager) => {
      const transferRepository = manager.getRepository(Transfer);
      const lineRepository = manager.getRepository(TransferLine);

      const transfer = transferRepository.create({
        reference: this.generateReference(),
        sourceLocationId: dto.sourceLocationId,
        destinationLocationId: dto.destinationLocationId,
        assignedUserId: dto.assignedUserId,
        createdById: currentUser.id,
        status: TransferStatus.DRAFT,
        notes: this.normalizeOptional(dto.notes),
        readyAt: null,
        startedAt: null,
        completedAt: null,
        cancelledAt: null,
      });

      const savedTransfer = await transferRepository.save(transfer);

      const lines = dto.lines.map((line) =>
        lineRepository.create({
          transferId: savedTransfer.id,
          productId: line.productId,
          quantity: line.quantity,
          processedQuantity: 0,
        }),
      );

      await lineRepository.save(lines);

      return savedTransfer.id;
    });

    return this.findOne(transferId, currentUser);
  }

  async findAll(
    query: TransferQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<Transfer[]> {
    const qb = this.transferRepository
      .createQueryBuilder('transfer')
      .leftJoinAndSelect('transfer.sourceLocation', 'sourceLocation')
      .leftJoinAndSelect('sourceLocation.warehouse', 'sourceWarehouse')
      .leftJoinAndSelect(
        'transfer.destinationLocation',
        'destinationLocation',
      )
      .leftJoinAndSelect(
        'destinationLocation.warehouse',
        'destinationWarehouse',
      )
      .leftJoinAndSelect('transfer.assignedUser', 'assignedUser')
      .leftJoinAndSelect('transfer.createdBy', 'createdBy')
      .leftJoinAndSelect('transfer.lines', 'line')
      .leftJoinAndSelect('line.product', 'product')
      .orderBy('transfer.createdAt', 'DESC');

    if (currentUser.role === UserRole.WAREHOUSE_WORKER) {
      qb.andWhere('transfer.assignedUserId = :currentUserId', {
        currentUserId: currentUser.id,
      });
    } else if (query.assignedUserId) {
      qb.andWhere('transfer.assignedUserId = :assignedUserId', {
        assignedUserId: query.assignedUserId,
      });
    }

    if (query.status) {
      qb.andWhere('transfer.status = :status', {
        status: query.status,
      });
    }

    if (query.sourceLocationId) {
      qb.andWhere('transfer.sourceLocationId = :sourceLocationId', {
        sourceLocationId: query.sourceLocationId,
      });
    }

    if (query.destinationLocationId) {
      qb.andWhere(
        'transfer.destinationLocationId = :destinationLocationId',
        {
          destinationLocationId: query.destinationLocationId,
        },
      );
    }

    const search = query.search?.trim();

    if (search) {
      qb.andWhere(
        `(
          LOWER(transfer.reference) LIKE LOWER(:search)
          OR LOWER(sourceLocation.name) LIKE LOWER(:search)
          OR LOWER(sourceLocation.code) LIKE LOWER(:search)
          OR LOWER(destinationLocation.name) LIKE LOWER(:search)
          OR LOWER(destinationLocation.code) LIKE LOWER(:search)
          OR LOWER(product.name) LIKE LOWER(:search)
          OR LOWER(product.sku) LIKE LOWER(:search)
        )`,
        { search: `%${search}%` },
      );
    }

    return qb.getMany();
  }

  async findOne(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<Transfer> {
    const transfer = await this.findEntityWithRelations(id);

    this.ensureCanAccessTransfer(transfer, currentUser);

    return transfer;
  }

  async markReady(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<Transfer> {
    const transfer = await this.findEntityWithRelations(id);

    if (transfer.status !== TransferStatus.DRAFT) {
      throw new BadRequestException(
        'Only draft transfers can be marked as ready',
      );
    }

    await this.ensureStockAvailable(transfer);

    transfer.status = TransferStatus.READY;
    transfer.readyAt = new Date();

    await this.transferRepository.save(transfer);

    return this.findOne(id, currentUser);
  }

  async start(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<Transfer> {
    const transfer = await this.findEntityWithRelations(id);

    this.ensureCanProcessTransfer(transfer, currentUser);

    if (transfer.status !== TransferStatus.READY) {
      throw new BadRequestException(
        'Only ready transfers can be started',
      );
    }

    transfer.status = TransferStatus.IN_PROGRESS;
    transfer.startedAt = new Date();

    await this.transferRepository.save(transfer);

    return this.findOne(id, currentUser);
  }

  async complete(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<Transfer> {
    const accessTransfer = await this.findEntityWithRelations(id);
    this.ensureCanProcessTransfer(accessTransfer, currentUser);

    await this.dataSource.transaction(async (manager) => {
      const transferRepository = manager.getRepository(Transfer);
      const lineRepository = manager.getRepository(TransferLine);
      const inventoryRepository = manager.getRepository(Inventory);

      const transfer = await transferRepository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!transfer) {
        throw new NotFoundException('Transfer not found');
      }

      if (transfer.status !== TransferStatus.IN_PROGRESS) {
        throw new BadRequestException(
          'Only transfers in progress can be completed',
        );
      }

      const lines = await lineRepository.find({
        where: { transferId: id },
        order: { productId: 'ASC' },
      });

      if (lines.length === 0) {
        throw new BadRequestException('Transfer has no lines');
      }

      for (const line of lines) {
        const sourceInventory = await inventoryRepository.findOne({
          where: {
            productId: line.productId,
            locationId: transfer.sourceLocationId,
          },
          lock: { mode: 'pessimistic_write' },
        });

        if (
          !sourceInventory ||
          sourceInventory.quantity < line.quantity
        ) {
          throw new BadRequestException(
            `Insufficient stock for product ${line.productId}`,
          );
        }

        let destinationInventory = await inventoryRepository.findOne({
          where: {
            productId: line.productId,
            locationId: transfer.destinationLocationId,
          },
          lock: { mode: 'pessimistic_write' },
        });

        sourceInventory.quantity -= line.quantity;

        if (!destinationInventory) {
          destinationInventory = inventoryRepository.create({
            productId: line.productId,
            locationId: transfer.destinationLocationId,
            quantity: line.quantity,
          });
        } else {
          destinationInventory.quantity += line.quantity;
        }

        line.processedQuantity = line.quantity;

        await inventoryRepository.save(sourceInventory);
        await inventoryRepository.save(destinationInventory);
        await lineRepository.save(line);
      }

      transfer.status = TransferStatus.DONE;
      transfer.completedAt = new Date();

      await transferRepository.save(transfer);
    });

    return this.findOne(id, currentUser);
  }

  async cancel(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<Transfer> {
    const transfer = await this.findEntityWithRelations(id);

    if (
      transfer.status === TransferStatus.DONE ||
      transfer.status === TransferStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Completed or cancelled transfers cannot be cancelled',
      );
    }

    transfer.status = TransferStatus.CANCELLED;
    transfer.cancelledAt = new Date();

    await this.transferRepository.save(transfer);

    return this.findOne(id, currentUser);
  }

  private async findEntityWithRelations(id: string): Promise<Transfer> {
    const transfer = await this.transferRepository.findOne({
      where: { id },
      relations: {
        sourceLocation: {
          warehouse: true,
        },
        destinationLocation: {
          warehouse: true,
        },
        assignedUser: true,
        createdBy: true,
        lines: {
          product: true,
        },
      },
    });

    if (!transfer) {
      throw new NotFoundException('Transfer not found');
    }

    return transfer;
  }

  private async ensureStockAvailable(transfer: Transfer): Promise<void> {
    for (const line of transfer.lines) {
      const inventory = await this.inventoryRepository.findOne({
        where: {
          productId: line.productId,
          locationId: transfer.sourceLocationId,
        },
      });

      if (!inventory || inventory.quantity < line.quantity) {
        throw new BadRequestException(
          `Insufficient stock for ${line.product.name}. Required: ${line.quantity}, available: ${inventory?.quantity ?? 0}`,
        );
      }
    }
  }

  private ensureCanAccessTransfer(
    transfer: Transfer,
    currentUser: AuthenticatedUser,
  ): void {
    if (
      currentUser.role === UserRole.WAREHOUSE_WORKER &&
      transfer.assignedUserId !== currentUser.id
    ) {
      throw new ForbiddenException(
        'You can only access transfers assigned to you',
      );
    }
  }

  private ensureCanProcessTransfer(
    transfer: Transfer,
    currentUser: AuthenticatedUser,
  ): void {
    if (
      currentUser.role === UserRole.ADMIN ||
      currentUser.role === UserRole.WAREHOUSE_MANAGER
    ) {
      return;
    }

    if (
      currentUser.role === UserRole.WAREHOUSE_WORKER &&
      transfer.assignedUserId === currentUser.id
    ) {
      return;
    }

    throw new ForbiddenException(
      'You cannot process this transfer',
    );
  }

  private ensureNoDuplicateProducts(dto: CreateTransferDto): void {
    const productIds = dto.lines.map((line) => line.productId);

    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException(
        'A product can only appear once in a transfer',
      );
    }
  }

  private generateReference(): string {
    const suffix = randomUUID()
      .replace(/-/g, '')
      .slice(0, 12)
      .toUpperCase();

    return `TRF-${suffix}`;
  }

  private normalizeOptional(value?: string): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }
}

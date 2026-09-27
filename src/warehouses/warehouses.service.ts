import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { WarehouseQueryDto } from './dto/warehouse-query.dto';
import { Warehouse } from './entities/warehouse.entity';

@Injectable()
export class WarehousesService {
  constructor(
    @InjectRepository(Warehouse)
    private readonly warehouseRepository: Repository<Warehouse>,
  ) {}

  async create(dto: CreateWarehouseDto): Promise<Warehouse> {
    const code = this.normalizeCode(dto.code);

    await this.ensureCodeAvailable(code);

    const warehouse = this.warehouseRepository.create({
      name: dto.name.trim(),
      code,
      address: this.normalizeOptional(dto.address),
    });

    return this.warehouseRepository.save(warehouse);
  }

  async findAll(query: WarehouseQueryDto): Promise<Warehouse[]> {
    const qb = this.warehouseRepository
      .createQueryBuilder('warehouse')
      .where('warehouse.active = :active', { active: true })
      .orderBy('warehouse.createdAt', 'DESC');

    const search = query.search?.trim();

    if (search) {
      qb.andWhere(
        `(
          LOWER(warehouse.name) LIKE LOWER(:search)
          OR LOWER(warehouse.code) LIKE LOWER(:search)
          OR LOWER(COALESCE(warehouse.address, '')) LIKE LOWER(:search)
        )`,
        { search: `%${search}%` },
      );
    }

    return qb.getMany();
  }

  async findOne(id: string): Promise<Warehouse> {
    const warehouse = await this.warehouseRepository.findOne({
      where: { id, active: true },
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    return warehouse;
  }

  async update(id: string, dto: UpdateWarehouseDto): Promise<Warehouse> {
    const warehouse = await this.findEntityById(id);

    if (dto.name !== undefined) {
      warehouse.name = dto.name.trim();
    }

    if (dto.code !== undefined) {
      const code = this.normalizeCode(dto.code);
      await this.ensureCodeAvailable(code, id);
      warehouse.code = code;
    }

    if (dto.address !== undefined) {
      warehouse.address = this.normalizeOptional(dto.address);
    }

    if (dto.active !== undefined) {
      warehouse.active = dto.active;
    }

    return this.warehouseRepository.save(warehouse);
  }

  async archive(id: string): Promise<{ message: string }> {
    const warehouse = await this.findEntityById(id);

    if (!warehouse.active) {
      return { message: 'Warehouse is already archived' };
    }

    warehouse.active = false;
    await this.warehouseRepository.save(warehouse);

    return { message: 'Warehouse archived successfully' };
  }

  private async findEntityById(id: string): Promise<Warehouse> {
    const warehouse = await this.warehouseRepository.findOne({
      where: { id },
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    return warehouse;
  }

  private async ensureCodeAvailable(
    code: string,
    excludedWarehouseId?: string,
  ): Promise<void> {
    const existing = await this.warehouseRepository.findOne({
      where: { code },
    });

    if (existing && existing.id !== excludedWarehouseId) {
      throw new ConflictException(
        'A warehouse with this code already exists',
      );
    }
  }

  private normalizeCode(value: string): string {
    return value.trim().toUpperCase();
  }

  private normalizeOptional(value?: string): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }
}

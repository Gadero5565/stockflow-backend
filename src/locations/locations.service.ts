import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WarehousesService } from '../warehouses/warehouses.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { LocationQueryDto } from './dto/location-query.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { Location } from './entities/location.entity';

@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(Location)
    private readonly locationRepository: Repository<Location>,
    private readonly warehousesService: WarehousesService,
  ) {}

  async create(dto: CreateLocationDto): Promise<Location> {
    await this.warehousesService.findOne(dto.warehouseId);

    const code = this.normalizeCode(dto.code);
    await this.ensureCodeAvailable(dto.warehouseId, code);

    const location = this.locationRepository.create({
      name: dto.name.trim(),
      code,
      warehouseId: dto.warehouseId,
    });

    return this.locationRepository.save(location);
  }

  async findAll(query: LocationQueryDto): Promise<Location[]> {
    const qb = this.locationRepository
      .createQueryBuilder('location')
      .leftJoinAndSelect('location.warehouse', 'warehouse')
      .where('location.active = :active', { active: true })
      .andWhere('warehouse.active = :warehouseActive', {
        warehouseActive: true,
      })
      .orderBy('warehouse.name', 'ASC')
      .addOrderBy('location.name', 'ASC');

    if (query.warehouseId) {
      qb.andWhere('location.warehouseId = :warehouseId', {
        warehouseId: query.warehouseId,
      });
    }

    const search = query.search?.trim();

    if (search) {
      qb.andWhere(
        `(
          LOWER(location.name) LIKE LOWER(:search)
          OR LOWER(location.code) LIKE LOWER(:search)
          OR LOWER(warehouse.name) LIKE LOWER(:search)
          OR LOWER(warehouse.code) LIKE LOWER(:search)
        )`,
        { search: `%${search}%` },
      );
    }

    return qb.getMany();
  }

  async findOne(id: string): Promise<Location> {
    const location = await this.locationRepository.findOne({
      where: { id, active: true },
      relations: { warehouse: true },
    });

    if (!location || !location.warehouse.active) {
      throw new NotFoundException('Location not found');
    }

    return location;
  }

  async update(id: string, dto: UpdateLocationDto): Promise<Location> {
    const location = await this.findEntityById(id);

    const targetWarehouseId = dto.warehouseId ?? location.warehouseId;
    const targetCode =
      dto.code !== undefined ? this.normalizeCode(dto.code) : location.code;

    if (dto.warehouseId !== undefined) {
      await this.warehousesService.findOne(dto.warehouseId);
    }

    if (
      targetWarehouseId !== location.warehouseId ||
      targetCode !== location.code
    ) {
      await this.ensureCodeAvailable(
        targetWarehouseId,
        targetCode,
        location.id,
      );
    }

    if (dto.name !== undefined) {
      location.name = dto.name.trim();
    }

    if (dto.code !== undefined) {
      location.code = targetCode;
    }

    if (dto.warehouseId !== undefined) {
      location.warehouseId = dto.warehouseId;
    }

    if (dto.active !== undefined) {
      if (dto.active) {
        await this.warehousesService.findOne(targetWarehouseId);
      }

      location.active = dto.active;
    }

    return this.locationRepository.save(location);
  }

  async archive(id: string): Promise<{ message: string }> {
    const location = await this.findEntityById(id);

    if (!location.active) {
      return { message: 'Location is already archived' };
    }

    location.active = false;
    await this.locationRepository.save(location);

    return { message: 'Location archived successfully' };
  }

  private async findEntityById(id: string): Promise<Location> {
    const location = await this.locationRepository.findOne({
      where: { id },
    });

    if (!location) {
      throw new NotFoundException('Location not found');
    }

    return location;
  }

  private async ensureCodeAvailable(
    warehouseId: string,
    code: string,
    excludedLocationId?: string,
  ): Promise<void> {
    const existing = await this.locationRepository.findOne({
      where: { warehouseId, code },
    });

    if (existing && existing.id !== excludedLocationId) {
      throw new ConflictException(
        'A location with this code already exists in this warehouse',
      );
    }
  }

  private normalizeCode(value: string): string {
    return value.trim().toUpperCase();
  }
}

import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductQueryDto } from './dto/product-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product } from './entities/product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async create(dto: CreateProductDto): Promise<Product> {
    const sku = this.normalizeSku(dto.sku);
    const barcode = this.normalizeOptional(dto.barcode);

    await this.ensureSkuAvailable(sku);

    if (barcode) {
      await this.ensureBarcodeAvailable(barcode);
    }

    const product = this.productRepository.create({
      name: dto.name.trim(),
      sku,
      barcode,
      description: this.normalizeOptional(dto.description),
      unit: dto.unit?.trim() || 'unit',
    });

    return this.productRepository.save(product);
  }

  async findAll(query: ProductQueryDto): Promise<Product[]> {
    const qb = this.productRepository
      .createQueryBuilder('product')
      .where('product.active = :active', { active: true })
      .orderBy('product.createdAt', 'DESC');

    const search = query.search?.trim();

    if (search) {
      qb.andWhere(
        `(
          LOWER(product.name) LIKE LOWER(:search)
          OR LOWER(product.sku) LIKE LOWER(:search)
          OR product.barcode LIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    return qb.getMany();
  }

  async findOne(id: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id, active: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.findEntityById(id);

    if (dto.sku !== undefined) {
      const sku = this.normalizeSku(dto.sku);
      await this.ensureSkuAvailable(sku, id);
      product.sku = sku;
    }

    if (dto.barcode !== undefined) {
      const barcode = this.normalizeOptional(dto.barcode);

      if (barcode) {
        await this.ensureBarcodeAvailable(barcode, id);
      }

      product.barcode = barcode;
    }

    if (dto.name !== undefined) {
      product.name = dto.name.trim();
    }

    if (dto.description !== undefined) {
      product.description = this.normalizeOptional(dto.description);
    }

    if (dto.unit !== undefined) {
      product.unit = dto.unit.trim();
    }

    if (dto.active !== undefined) {
      product.active = dto.active;
    }

    return this.productRepository.save(product);
  }

  async archive(id: string): Promise<{ message: string }> {
    const product = await this.findEntityById(id);

    if (!product.active) {
      return { message: 'Product is already archived' };
    }

    product.active = false;
    await this.productRepository.save(product);

    return { message: 'Product archived successfully' };
  }

  private async findEntityById(id: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    return product;
  }

  private async ensureSkuAvailable(
    sku: string,
    excludedProductId?: string,
  ): Promise<void> {
    const existing = await this.productRepository.findOne({
      where: { sku },
    });

    if (existing && existing.id !== excludedProductId) {
      throw new ConflictException('A product with this SKU already exists');
    }
  }

  private async ensureBarcodeAvailable(
    barcode: string,
    excludedProductId?: string,
  ): Promise<void> {
    const existing = await this.productRepository.findOne({
      where: { barcode },
    });

    if (existing && existing.id !== excludedProductId) {
      throw new ConflictException(
        'A product with this barcode already exists',
      );
    }
  }

  private normalizeSku(value: string): string {
    return value.trim().toUpperCase();
  }

  private normalizeOptional(value?: string): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }
}

import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('products')
@Check(
  'CHK_products_reorderLevel_nonnegative',
  '"reorderLevel" >= 0',
)
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ length: 150 })
  name: string;

  @Index({ unique: true })
  @Column({ length: 64, unique: true })
  sku: string;

  @Index({ unique: true })
  @Column({
    type: 'varchar',
    length: 128,
    unique: true,
    nullable: true,
  })
  barcode: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ length: 32, default: 'unit' })
  unit: string;

  @Column({ type: 'integer', default: 0 })
  reorderLevel: number;

  @Index()
  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

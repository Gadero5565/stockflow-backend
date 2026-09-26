import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('products')
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

  @Index()
  @Column({ default: true })
  active: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

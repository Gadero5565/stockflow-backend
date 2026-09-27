import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Location } from '../../locations/entities/location.entity';
import { Product } from '../../products/entities/product.entity';
import { Transfer } from '../../transfers/entities/transfer.entity';
import { User } from '../../users/entities/user.entity';
import { StockMovementType } from '../enums/stock-movement-type.enum';

@Entity('stock_movements')
export class StockMovement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  productId: string;

  @ManyToOne(() => Product, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'productId' })
  product: Product;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  sourceLocationId: string | null;

  @ManyToOne(() => Location, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'sourceLocationId' })
  sourceLocation: Location | null;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  destinationLocationId: string | null;

  @ManyToOne(() => Location, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'destinationLocationId' })
  destinationLocation: Location | null;

  @Column({ type: 'integer' })
  quantity: number;

  @Index()
  @Column({
    type: 'enum',
    enum: StockMovementType,
  })
  type: StockMovementType;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  transferId: string | null;

  @ManyToOne(() => Transfer, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'transferId' })
  transfer: Transfer | null;

  @Index()
  @Column({ type: 'uuid' })
  createdById: string;

  @ManyToOne(() => User, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  @Column({ type: 'text', nullable: true })
  reason: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

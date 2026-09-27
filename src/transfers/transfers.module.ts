import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Inventory } from '../inventory/entities/inventory.entity';
import { LocationsModule } from '../locations/locations.module';
import { ProductsModule } from '../products/products.module';
import { StockMovementsModule } from '../stock-movements/stock-movements.module';
import { UsersModule } from '../users/users.module';
import { TransferLine } from './entities/transfer-line.entity';
import { Transfer } from './entities/transfer.entity';
import { TransfersController } from './transfers.controller';
import { TransfersService } from './transfers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transfer,
      TransferLine,
      Inventory,
    ]),
    LocationsModule,
    ProductsModule,
    UsersModule,
    StockMovementsModule,
  ],
  controllers: [TransfersController],
  providers: [TransfersService],
  exports: [TransfersService],
})
export class TransfersModule {}

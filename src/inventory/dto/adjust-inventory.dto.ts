import {
  IsInt,
  IsString,
  IsUUID,
  Length,
  NotEquals,
} from 'class-validator';

export class AdjustInventoryDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  locationId: string;

  @IsInt()
  @NotEquals(0)
  quantityDelta: number;

  @IsString()
  @Length(3, 500)
  reason: string;
}

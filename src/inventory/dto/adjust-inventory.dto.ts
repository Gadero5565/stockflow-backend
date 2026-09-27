import { IsInt, IsUUID, NotEquals } from 'class-validator';

export class AdjustInventoryDto {
  @IsUUID()
  productId: string;

  @IsUUID()
  locationId: string;

  @IsInt()
  @NotEquals(0)
  quantityDelta: number;
}

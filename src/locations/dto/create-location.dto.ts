import { IsString, IsUUID, Length } from 'class-validator';

export class CreateLocationDto {
  @IsString()
  @Length(2, 150)
  name: string;

  @IsString()
  @Length(1, 32)
  code: string;

  @IsUUID()
  warehouseId: string;
}

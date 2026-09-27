import { IsOptional, IsString, MaxLength } from 'class-validator';

export class WarehouseQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;
}

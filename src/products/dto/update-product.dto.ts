import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @Length(2, 150)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  sku?: string;

  @IsOptional()
  @IsString()
  @Length(1, 128)
  barcode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(1, 32)
  unit?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

import {
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateProductDto {
  @IsString()
  @Length(2, 150)
  name: string;

  @IsString()
  @Length(1, 64)
  sku: string;

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
}

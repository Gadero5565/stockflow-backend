import {
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @Length(2, 150)
  name: string;

  @IsString()
  @Length(2, 32)
  code: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;
}

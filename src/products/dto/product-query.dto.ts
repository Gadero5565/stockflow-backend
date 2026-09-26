import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ProductQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;
}

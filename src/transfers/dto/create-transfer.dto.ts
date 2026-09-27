import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateTransferLineDto } from './create-transfer-line.dto';

export class CreateTransferDto {
  @IsUUID()
  sourceLocationId: string;

  @IsUUID()
  destinationLocationId: string;

  @IsUUID()
  assignedUserId: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateTransferLineDto)
  lines: CreateTransferLineDto[];
}

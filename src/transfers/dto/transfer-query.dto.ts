import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { TransferStatus } from '../enums/transfer-status.enum';

export class TransferQueryDto {
  @IsOptional()
  @IsEnum(TransferStatus)
  status?: TransferStatus;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @IsOptional()
  @IsUUID()
  sourceLocationId?: string;

  @IsOptional()
  @IsUUID()
  destinationLocationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  search?: string;
}

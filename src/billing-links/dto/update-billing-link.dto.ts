import { IsOptional, IsString, IsInt, Min, MaxLength, IsIn } from 'class-validator';

export class UpdateBillingLinkDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  amount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string;
}

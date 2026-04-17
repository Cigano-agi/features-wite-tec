import { IsInt, IsString, Min, MaxLength } from 'class-validator';

export class CreateBillingLinkDto {
  @IsInt()
  @Min(1)
  amount: number;

  @IsString()
  @MaxLength(255)
  description: string;
}

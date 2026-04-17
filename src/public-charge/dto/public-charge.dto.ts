import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class PublicChargeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsString()
  @Matches(/^\d{11}$/, { message: 'cpf must be 11 digits' })
  cpf: string;
}

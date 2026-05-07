import { IsString, Length, Matches } from 'class-validator';

export class ConsultaRucDto {
  @IsString()
  @Length(11, 11, { message: 'El RUC debe tener exactamente 11 dígitos' })
  @Matches(/^\d{11}$/, { message: 'El RUC debe contener solo dígitos' })
  ruc: string;
}

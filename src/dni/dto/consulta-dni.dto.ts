import { IsString, Length, Matches } from 'class-validator';

export class ConsultaDniDto {
  @IsString()
  @Length(8, 8, { message: 'El DNI debe tener exactamente 8 dígitos' })
  @Matches(/^\d{8}$/, { message: 'El DNI debe contener solo dígitos' })
  dni: string;
}

import { IsNotEmpty, IsUUID } from 'class-validator';

export class UUIDParamDto {
  @IsUUID('4')
  @IsNotEmpty()
  id: string;
}

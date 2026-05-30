import { IsOptional, IsString, MaxLength, IsNotEmpty } from 'class-validator';

export class VerifyMentorBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class AssignRoleParamDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  role: string;
}

export class RevokeRoleBodyDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

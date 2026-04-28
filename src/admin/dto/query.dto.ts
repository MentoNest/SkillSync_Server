// admin/dto/query.dto.ts
import { IsOptional, IsNumberString, IsString } from 'class-validator';

export class QueryDto {
  @IsOptional()
  @IsNumberString()
  page = '1';

  @IsOptional()
  @IsNumberString()
  limit = '10';

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
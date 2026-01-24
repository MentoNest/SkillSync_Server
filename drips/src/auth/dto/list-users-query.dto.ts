import { IsOptional, Min, Max, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class ListUsersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}

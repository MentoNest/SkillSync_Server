import { IsArray, IsOptional, IsString } from 'class-validator';

export class MarkReadDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  ids?: string[];
}

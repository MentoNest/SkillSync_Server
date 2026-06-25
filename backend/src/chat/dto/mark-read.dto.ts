import { IsString, IsNotEmpty, IsArray, IsOptional } from 'class-validator';

export class MarkReadDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  messageIds?: string[];
}

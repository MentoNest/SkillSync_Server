import { IsInt, IsOptional, IsString, Max, Min, IsUUID } from 'class-validator';

export class CreateReviewDto {
  @IsUUID()
  sessionId: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

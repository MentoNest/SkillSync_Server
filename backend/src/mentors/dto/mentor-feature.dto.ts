import { IsInt, IsOptional, Min } from 'class-validator';

export class FeatureMentorDto {
  /** Optional manual sort position; appended to the end if omitted. */
  @IsOptional()
  @IsInt()
  @Min(0)
  featuredOrder?: number;
}

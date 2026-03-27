import { IsString, IsOptional, IsArray, ArrayUnique } from 'class-validator';

export class AssignTagsDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  tagSlugs: string[];
}

export class CreateTagDto {
  @IsString()
  name: string;

  @IsString()
  slug: string;
}

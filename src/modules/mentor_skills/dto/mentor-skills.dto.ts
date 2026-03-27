import { IsString, IsInt, IsArray, ArrayNotEmpty, ArrayUnique } from 'class-validator';

export class AttachSkillsDto {
  @IsString()
  mentorId: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  skillIds: number[];
}

export class DetachSkillsDto {
  @IsString()
  mentorId: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  skillIds: number[];
}

import { IsEnum, IsInt, IsUUID, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { SkillLevel } from '../entities/mentor-skill.entity';

export class AttachSkillDto {
  @ApiProperty({
    description: 'ID of the skill to attach',
    example: 'c5f5e3d5-8b7a-4f2d-9c1e-3f4a5b6c7d8e',
  })
  @IsUUID()
  skillId!: string;

  @ApiProperty({
    description: 'Proficiency level',
    enum: SkillLevel,
    example: SkillLevel.INTERMEDIATE,
  })
  @IsEnum(SkillLevel)
  level!: SkillLevel;

  @ApiProperty({
    description: 'Years of experience with this skill',
    example: 3,
    minimum: 0,
    maximum: 50,
  })
  @IsInt()
  @Min(0)
  @Max(50)
  yearsExperience!: number;
}

export class UpdateSkillDto {
  @ApiProperty({
    description: 'Proficiency level',
    enum: SkillLevel,
    example: SkillLevel.EXPERT,
  })
  @IsEnum(SkillLevel)
  level!: SkillLevel;

  @ApiProperty({
    description: 'Years of experience with this skill',
    example: 5,
    minimum: 0,
    maximum: 50,
  })
  @IsInt()
  @Min(0)
  @Max(50)
  yearsExperience!: number;
}

export class DetachSkillDto {
  @ApiProperty({
    description: 'ID of the skill to detach',
    example: 'c5f5e3d5-8b7a-4f2d-9c1e-3f4a5b6c7d8e',
  })
  @IsUUID()
  skillId!: string;
}

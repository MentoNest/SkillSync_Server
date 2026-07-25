import { IsEnum, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateMentorProfileDto } from './create-mentor-profile.dto.js';
import { CreateMenteeProfileDto } from './create-mentee-profile.dto.js';

export class CreateProfileDto {
  @IsEnum(['mentor', 'mentee'])
  profileType: 'mentor' | 'mentee';

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateMentorProfileDto)
  mentorData?: CreateMentorProfileDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateMenteeProfileDto)
  menteeData?: CreateMenteeProfileDto;
}

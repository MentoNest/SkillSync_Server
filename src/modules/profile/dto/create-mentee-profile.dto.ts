import { IsString, IsOptional, IsArray, IsEnum, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { MenteeGoal } from '../entities/mentee-profile.entity';

export class CreateMenteeProfileDto {
  @ApiPropertyOptional({ description: 'Personal bio or introduction' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ description: 'Areas of interest for learning' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  interests?: string[];

  @ApiPropertyOptional({ description: 'Learning goals', enum: MenteeGoal })
  @IsOptional()
  @IsEnum(MenteeGoal)
  primaryGoal?: MenteeGoal;

  @ApiPropertyOptional({ description: 'Additional goals or specific learning objectives' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  goals?: string[];

  @ApiPropertyOptional({ description: 'Current skill level' })
  @IsOptional()
  @IsString()
  skillLevel?: string;

  @ApiPropertyOptional({ description: 'Preferred learning style' })
  @IsOptional()
  @IsString()
  learningStyle?: string;

  @ApiPropertyOptional({ description: 'Time availability per week (hours)' })
  @IsOptional()
  @IsNumber()
  weeklyAvailability?: number;

  @ApiPropertyOptional({ description: 'Profile image URL' })
  @IsOptional()
  @IsString()
  profileImageUrl?: string;

  @ApiPropertyOptional({ description: 'Is profile actively seeking mentorship' })
  @IsOptional()
  isSeekingMentor?: boolean;
}

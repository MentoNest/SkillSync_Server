// src/mentors/dto/update-mentor.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateMentorDto } from './createMentor.dto';
import {
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateMentorDto extends PartialType(CreateMentorDto) {
  @IsOptional()
  @IsString()
  bio?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @IsOptional()
  @IsString()
  availability?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}
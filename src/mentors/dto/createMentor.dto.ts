import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class CreateMentorDto {
  @ApiProperty({ example: 'I am a fullstack developer with 29 years of experience', description: 'mentor bio' })
  @IsString()
  bio: string;
  
  @ApiProperty({ example: 'React, TypeScript, JavaScript, Machine Learning, AWS, Docker', description: 'mentor skills' })
  @IsString()
  skills: string[];
  
  @ApiProperty({ example: 'In a month time', description: 'mentor availability' })
  @IsString()
  availability?: string;
  
  @ApiProperty({ example: '', description: 'User associated id' })
  @IsString()
  userId: string; 
}

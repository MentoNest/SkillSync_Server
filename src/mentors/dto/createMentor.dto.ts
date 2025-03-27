import { ApiProperty } from "@nestjs/swagger";

export class CreateMentorDto {
  @ApiProperty({ example: 'I am a fullstack developer with 29 years of experience', description: 'mentor bio' })
  bio: string;
  
  @ApiProperty({ example: 'React, TypeScript, JavaScript, Machine Learning, AWS, Docker', description: 'mentor skills' })
  skills: string[];

  @ApiProperty({ example: 'In a month time', description: 'mentor availability' })
  availability?: string;    //availability could best be an enum
}

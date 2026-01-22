import { ApiProperty } from '@nestjs/swagger';

export class CreateSkillDto {
  @ApiProperty({
    description: 'Name of the skill',
    example: 'NestJS',
  })
  name!: string;

  @ApiProperty({
    description: 'Category of the skill',
    example: 'backend',
    required: false,
  })
  category?: string;
}

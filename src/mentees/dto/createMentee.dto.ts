import { ApiProperty } from "@nestjs/swagger";

export class CreateMenteeDto {
  @ApiProperty({ example: 'react, frontend, nestjs, api', description: 'mentee preferences' })
  preferences: string[];

  @ApiProperty({ example: 'I want to be an industry expert', description: 'mentee goal' })
  goal?: string;
}

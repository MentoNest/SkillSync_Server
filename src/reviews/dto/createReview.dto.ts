import { ApiProperty } from "@nestjs/swagger";

export class CreateReviewDto {
  @ApiProperty({ example: '5', description: 'Rating counts' })
  rating: number;

  @ApiProperty({ example: '', description: 'Review text' })
  reviewText: string;

  @ApiProperty({ example: '', description: 'Review text' })
  mentorId: string;

  @ApiProperty({ example: '', description: 'Review text' })
  menteeId: string;
}
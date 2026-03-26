import { ApiProperty } from '@nestjs/swagger';

export class UploadListingImageResponseDto {
  @ApiProperty({ description: 'Success message' })
  message: string;

  @ApiProperty({ description: 'URL of the uploaded image' })
  imageUrl: string;
}

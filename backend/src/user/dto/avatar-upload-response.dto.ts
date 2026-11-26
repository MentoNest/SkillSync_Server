import { ApiProperty } from '@nestjs/swagger';

export class AvatarUploadResponseDto {
  @ApiProperty({
    description: 'Optimized original avatar URL.',
    example: '/uploads/avatars/gdqp.../original-abc.jpg',
  })
  avatarUrl!: string;

  @ApiProperty({
    description: 'Thumbnail avatar URL (64x64).',
    example: '/uploads/avatars/gdqp.../thumbnail-abc.jpg',
  })
  avatarThumbnailUrl!: string;

  @ApiProperty({
    description: 'Small avatar URL (200x200).',
    example: '/uploads/avatars/gdqp.../small-abc.jpg',
  })
  avatarSmallUrl!: string;

  @ApiProperty({
    description: 'Medium avatar URL (400x400).',
    example: '/uploads/avatars/gdqp.../medium-abc.jpg',
  })
  avatarMediumUrl!: string;
}

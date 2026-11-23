import { ApiProperty } from '@nestjs/swagger';
import { MenteeProfile } from '../mentee-profile.entity';
import { MentorProfile } from '../mentor-profile.entity';
import { ProfileType } from './create-profile.dto';

export class CreateProfileResponseDto {
  @ApiProperty({ enum: ProfileType, example: ProfileType.MENTOR })
  profileType!: ProfileType;

  @ApiProperty({
    description: 'The created profile object. Shape varies by profileType.',
    oneOf: [
      { $ref: '#/components/schemas/MentorProfile' },
      { $ref: '#/components/schemas/MenteeProfile' },
    ],
  })
  profile!: MentorProfile | MenteeProfile;
}

export class UpdateProfileResponseDto {
  @ApiProperty({ enum: ProfileType, example: ProfileType.MENTOR })
  profileType!: ProfileType;

  @ApiProperty({
    description: 'The updated profile object. Shape varies by profileType.',
    oneOf: [
      { $ref: '#/components/schemas/MentorProfile' },
      { $ref: '#/components/schemas/MenteeProfile' },
    ],
  })
  profile!: MentorProfile | MenteeProfile;
}

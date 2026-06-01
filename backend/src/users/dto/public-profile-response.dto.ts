import { PublicMentorProfileDto } from './public-mentor-profile.dto';
import { PublicMenteeProfileDto } from './public-mentee-profile.dto';

/**
 * Public Profile Response - Union type for both mentor and mentee profiles
 */
export type PublicProfileResponse = PublicMentorProfileDto | PublicMenteeProfileDto;

/**
 * Public Profiles Not Found Response
 */
export class ProfileNotFoundDto {
  statusCode: number = 404;

  message: string = 'Profile not found';

  error: string = 'Not Found';
}

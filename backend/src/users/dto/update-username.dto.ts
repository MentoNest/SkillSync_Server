import { IsString, Length, Matches } from 'class-validator';

export class UpdateUsernameDto {
  @IsString()
  @Length(3, 30)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username must be alphanumeric with underscores only' })
  username: string;
}

import { UserResponseDto } from './user-response.dto';

export class ListUsersResponseDto {
  users!: UserResponseDto[];
  total!: number;
  page!: number;
  limit!: number;
  totalPages!: number;

  constructor(
    users: UserResponseDto[],
    total: number,
    page: number,
    limit: number,
  ) {
    this.users = users;
    this.total = total;
    this.page = page;
    this.limit = limit;
    this.totalPages = Math.ceil(total / limit);
  }
}

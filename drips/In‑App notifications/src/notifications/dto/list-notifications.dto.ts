import { IsOptional, IsNumber, Min, Max, IsEnum } from "class-validator";
import { Type } from "class-transformer";

export enum NotificationFilter {
  ALL = "ALL",
  READ = "READ",
  UNREAD = "UNREAD",
}

export class ListNotificationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(NotificationFilter)
  filter?: NotificationFilter = NotificationFilter.ALL;
}

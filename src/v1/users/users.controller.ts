// src/v1/users/users.controller.ts
import { Controller, Get, Version } from '@nestjs/common';

@Controller('users')
export class UsersControllerV1 {
  @Get()
  @Version('1')
  getUsersV1() {
    return { version: 'v1', data: [] };
  }
}
import {
  Module,
  Injectable,
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';

@Injectable()
export class UserService {
  findOne(id: string): Record<string, unknown> {
    return { id };
  }

  update(id: string, data: Record<string, unknown>): Record<string, unknown> {
    return { id, ...data };
  }

  remove(id: string): Record<string, unknown> {
    return { deleted: id };
  }
}

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.userService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.userService.remove(id);
  }
}

@Module({
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}

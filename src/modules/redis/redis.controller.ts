import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { RedisService } from './providers/redis.service';
import { CreateRediDto } from './dto/create-redi.dto';
import { UpdateRediDto } from './dto/update-redi.dto';

@Controller('redis')
export class RedisController {
  constructor(private readonly redisService: RedisService) {}

  @Post()
  create(@Body() createRediDto: CreateRediDto) {
    return this.redisService.create(createRediDto);
  }

  @Get()
  findAll() {
    return this.redisService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.redisService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateRediDto: UpdateRediDto) {
    return this.redisService.update(+id, updateRediDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.redisService.remove(+id);
  }
}

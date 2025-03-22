import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Mentee } from '../mentee.entity';
import { CreateMenteeDto } from '../dto/createMentee.dto';
import { UpdateMenteeDto } from '../dto/updateMentee.dto';
import { RedisService } from 'src/common/redis/cache.service';

@Injectable()
export class MenteeService {
  constructor(
    @InjectRepository(Mentee)
    private menteeRepository: Repository<Mentee>,
    private readonly redisService: RedisService
  ) {}

  async create(createMenteeDto: CreateMenteeDto): Promise<Mentee> {
    const mentee = this.menteeRepository.create(createMenteeDto);
    await this.menteeRepository.save(mentee);
    await this.redisService.set(`mentee:${mentee.id}`, mentee, 1800);
    await this.redisService.delete('mentees:all');
    return mentee;
  }

  async findAll(): Promise<Mentee[]> {
    const cachedMentees = await this.redisService.get<Mentee[]>('mentees:all');
    if (cachedMentees) {
      return cachedMentees;
    }
    const mentees = await this.menteeRepository.find();
    await this.redisService.set('mentees:all', mentees, 900);
    return mentees;
  }

  async findOne(id: number): Promise<Mentee> {
    const cachedMentee = await this.redisService.get<Mentee>(`mentee:${id}`);
    if (cachedMentee) {
      return cachedMentee;
    }
    const mentee = await this.menteeRepository.findOne({ where: { id } });
    if (!mentee) {
      throw new NotFoundException(`Mentee with id ${id} not found`);
    }
    await this.redisService.set(`mentee:${id}`, mentee, 1800);
    return mentee;
  }

  async update(id: number, updateMenteeDto: UpdateMenteeDto): Promise<Mentee> {
    let mentee = await this.menteeRepository.preload({
      id,
      ...updateMenteeDto,
    });
    if (!mentee) {
      throw new NotFoundException(`Mentee with id ${id} not found`);
    }
    mentee = await this.menteeRepository.save(mentee);
    await this.redisService.set(`mentee:${id}`, mentee, 1800);
    await this.redisService.delete('mentees:all');
    return mentee;
  }

  async remove(id: number): Promise<void> {
    const result = await this.menteeRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Mentee with id ${id} not found`);
    }
    await this.redisService.delete(`mentee:${id}`);
    await this.redisService.delete('mentees:all');
  }
}

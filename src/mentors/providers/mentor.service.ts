import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Mentor } from '../mentor.entity';
import { CreateMentorDto } from '../dto/createMentor.dto';
import { UpdateMentorDto } from '../dto/update-Mentor.dto';
import { RedisService } from 'src/common/redis/cache.service';

@Injectable()
export class MentorService {
  constructor(
    @InjectRepository(Mentor)
    private mentorRepository: Repository<Mentor>,
    private readonly redisService: RedisService,
  ) {}

  async create(createMentorDto: CreateMentorDto): Promise<Mentor> {
    const mentor = this.mentorRepository.create(createMentorDto);
    const savedMentor = await this.mentorRepository.save(mentor);

    // Cache the new mentor
    await this.redisService.set(`mentor:${savedMentor.id}`, savedMentor, 1800);

    // Invalidate mentor list cache
    await this.redisService.delete('mentors:all');

    return savedMentor;
  }

  async findAll(): Promise<Mentor[]> {
    // Try to get from cache first
    const cachedMentors = await this.redisService.get<Mentor[]>('mentors:all');
    if (cachedMentors) {
      return cachedMentors;
    }

    const mentors = await this.mentorRepository.find();

    // Store in cache (15 minutes TTL)
    await this.redisService.set('mentors:all', mentors, 900);

    return mentors;
  }

  async findOne(id: number): Promise<Mentor> {
    // Try to get from cache first
    const cachedMentor = await this.redisService.get<Mentor>(`mentor:${id}`);
    if (cachedMentor) {
      return cachedMentor;
    }

    const mentor = await this.mentorRepository.findOne({ where: { id } });
    if (!mentor) {
      throw new NotFoundException(`Mentor with id ${id} not found`);
    }

    // Cache the result if found (30 minutes TTL)
    await this.redisService.set(`mentor:${id}`, mentor, 1800);

    return mentor;
  }

  async update(id: number, updateMentorDto: UpdateMentorDto): Promise<Mentor> {
    const mentor = await this.mentorRepository.preload({
      id,
      ...updateMentorDto,
    });

    if (!mentor) {
      throw new NotFoundException(`Mentor with id ${id} not found`);
    }

    const updatedMentor = await this.mentorRepository.save(mentor);

    // Update cache with new data
    await this.redisService.set(`mentor:${id}`, updatedMentor, 1800);
    await this.redisService.delete('mentors:all');

    return updatedMentor;
  }

  async remove(id: number): Promise<void> {
    const result = await this.mentorRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Mentor with id ${id} not found`);
    }

    // Delete from cache
    await this.redisService.delete(`mentor:${id}`);
    await this.redisService.delete('mentors:all');
  }
}

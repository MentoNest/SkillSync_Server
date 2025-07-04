import { Injectable } from '@nestjs/common';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { User } from '../entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateProfileDto } from 'src/profile/dto/update-profile.dto';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  create(createUserDto: CreateUserDto) {
    return `This action adds a new user with the following details: ${JSON.stringify(createUserDto)}`;
  }

  findAll() {
    return `This action returns all user`;
  }

  findOne(id: number) {
    return `This action returns a #${id} user`;
  }

  update(id: number, updateUserDto: UpdateUserDto | UpdateProfileDto) {
    return `This action updates a #${id} user with the following details: ${JSON.stringify(updateUserDto)}`;
  }

  remove(id: number) {
    return `This action removes a #${id} user`;
  }
  async updateProfileImage(userId: number, imageUrl: string): Promise<void> {
    await this.userRepository.update(userId, { profilePicture: imageUrl });
  }
}

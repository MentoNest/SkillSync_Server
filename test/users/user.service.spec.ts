// test/users/user.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';

import {UserService} from '../users/user.service';
import {CreateUserDto} from '../users/dto/create-user.dto';
import {UpdateUserDto} from '../users/dto/update-user.dto';

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UserService],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  describe('findAll', () => {
    it('should return all users', async () => {
      await service.create({ name: 'Test', email: 'test@example.com' });
      const users = await service.findAll();
      expect(users.length).toBeGreaterThan(0);
    });
  });

  describe('findOne', () => {
    it('should return a user by id', async () => {
      const user = await service.create({ name: 'Test', email: 'test@example.com' });
      const found = await service.findOne(user.id);
      expect(found).toEqual(user);
    });

    it('should return null if user not found', async () => {
      const result = await service.findOne('999');
      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('should create a new user', async () => {
      const dto: CreateUserDto = { name: 'New User', email: 'new@example.com' };
      const user = await service.create(dto);
      expect(user).toMatchObject(dto);
      expect(user.id).toBeDefined();
    });
  });

  describe('update', () => {
    it('should update an existing user', async () => {
      const user = await service.create({ name: 'Old', email: 'old@example.com' });
      const dto: UpdateUserDto = { name: 'Updated' };
      const updated = await service.update(user.id, dto);
      expect(updated.name).toBe('Updated');
    });

    it('should return null if user not found', async () => {
      const dto: UpdateUserDto = { name: 'Updated' };
      const result = await service.update('999', dto);
      expect(result).toBeNull();
    });
  });

  describe('remove', () => {
    it('should remove a user', async () => {
      const user = await service.create({ name: 'Delete Me', email: 'del@example.com' });
      const result = await service.remove(user.id);
      expect(result).toEqual({ deleted: true });
    });

    it('should return { deleted: false } if user not found', async () => {
      const result = await service.remove('999');
      expect(result).toEqual({ deleted: false });
    });
  });
});

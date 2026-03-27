// test/users/user.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import {UserController} from './user.controller';
import {UserService} from './user.service'

describe('UserController', () => {
  let controller: UserController;
  let service: UserService;

  const mockUserService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: UserService, useValue: mockUserService }],
    }).compile();

    controller = module.get<UserController>(UserController);
    service = module.get<UserService>(UserService);
  });

  describe('findAll', () => {
    it('should return an array of users', async () => {
      const result = [{ id: '1', name: 'Test User' }];
      mockUserService.findAll.mockResolvedValue(result);

      expect(await controller.findAll()).toEqual(result);
      expect(service.findAll).toHaveBeenCalled();
    });

    it('should handle errors', async () => {
      mockUserService.findAll.mockRejectedValue(new Error('DB error'));
      await expect(controller.findAll()).rejects.toThrow('DB error');
    });
  });

  describe('findOne', () => {
    it('should return a single user', async () => {
      const result = { id: '1', name: 'Test User' };
      mockUserService.findOne.mockResolvedValue(result);

      expect(await controller.findOne('1')).toEqual(result);
    });

    it('should throw if user not found', async () => {
      mockUserService.findOne.mockResolvedValue(null);
      await expect(controller.findOne('999')).resolves.toBeNull();
    });
  });

  describe('create', () => {
    it('should create a user', async () => {
      const dto = { name: 'New User' };
      const result = { id: '2', ...dto };
      mockUserService.create.mockResolvedValue(result);

      expect(await controller.create(dto)).toEqual(result);
    });
  });

  describe('update', () => {
    it('should update a user', async () => {
      const dto = { name: 'Updated User' };
      const result = { id: '1', ...dto };
      mockUserService.update.mockResolvedValue(result);

      expect(await controller.update('1', dto)).toEqual(result);
    });
  });

  describe('remove', () => {
    it('should remove a user', async () => {
      mockUserService.remove.mockResolvedValue({ deleted: true });
      expect(await controller.remove('1')).toEqual({ deleted: true });
    });
  });
});

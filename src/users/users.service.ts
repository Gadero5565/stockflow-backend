import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { UserRole } from '../common/enums/user-role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  private static readonly PASSWORD_SALT_ROUNDS = 12;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const email = this.normalizeEmail(dto.email);

    await this.ensureEmailIsAvailable(email);

    const passwordHash = await bcrypt.hash(
      dto.password,
      UsersService.PASSWORD_SALT_ROUNDS,
    );

    const user = this.userRepository.create({
      name: dto.name.trim(),
      email,
      passwordHash,
      role: dto.role ?? UserRole.WAREHOUSE_WORKER,
      isActive: true,
      refreshTokenHash: null,
    });

    return this.userRepository.save(user);
  }

  findAll(): Promise<User[]> {
    return this.userRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return user;
  }

  findByIdForAuthentication(id: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { id },
    });
  }

  async findByEmailForAuthentication(email: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('LOWER(user.email) = LOWER(:email)', {
        email: this.normalizeEmail(email),
      })
      .getOne();
  }

  async findByIdWithRefreshTokenHash(id: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.refreshTokenHash')
      .where('user.id = :id', { id })
      .getOne();
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findById(id);

    if (dto.email !== undefined) {
      const email = this.normalizeEmail(dto.email);

      if (email !== user.email) {
        await this.ensureEmailIsAvailable(email, id);
        user.email = email;
      }
    }

    if (dto.name !== undefined) {
      user.name = dto.name.trim();
    }

    if (dto.isActive !== undefined) {
      user.isActive = dto.isActive;

      // Immediately invalidate refresh sessions when the account is disabled.
      if (!dto.isActive) {
        await this.clearRefreshToken(id);
      }
    }

    return this.userRepository.save(user);
  }

  async updateRole(id: string, role: UserRole): Promise<User> {
    const user = await this.findById(id);
    user.role = role;

    return this.userRepository.save(user);
  }

  async setRefreshTokenHash(
    userId: string,
    refreshTokenHash: string,
  ): Promise<void> {
    await this.userRepository.update(userId, {
      refreshTokenHash,
    });
  }

  async clearRefreshToken(userId: string): Promise<void> {
    await this.userRepository.update(userId, {
      refreshTokenHash: null,
    });
  }

  private async ensureEmailIsAvailable(
    email: string,
    exceptUserId?: string,
  ): Promise<void> {
    const existing = await this.userRepository.findOne({
      where: { email },
    });

    if (existing && existing.id !== exceptUserId) {
      throw new ConflictException('A user with this email already exists.');
    }
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}

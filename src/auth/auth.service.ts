import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, timingSafeEqual } from 'crypto';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { JwtPayload } from '../common/interfaces/jwt-payload.interface';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends TokenPair {
  user: AuthenticatedUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmailForAuthentication(dto.email);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const tokens = await this.issueTokenPair(user.id);
    await this.rotateRefreshToken(user.id, tokens.refreshToken);

    return {
      ...tokens,
      user: this.toAuthenticatedUser(user),
    };
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const payload = await this.verifyRefreshToken(refreshToken);

    const user = await this.usersService.findByIdWithRefreshTokenHash(
      payload.sub,
    );

    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }

    if (!this.refreshTokenMatches(refreshToken, user.refreshTokenHash)) {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }

    const tokens = await this.issueTokenPair(user.id);

    // Rotation makes a previously used refresh token unusable.
    await this.rotateRefreshToken(user.id, tokens.refreshToken);

    return {
      ...tokens,
      user: this.toAuthenticatedUser(user),
    };
  }

  async logout(userId: string): Promise<{ message: string }> {
    await this.usersService.clearRefreshToken(userId);

    return {
      message: 'Logged out successfully.',
    };
  }

  private async issueTokenPair(userId: string): Promise<TokenPair> {
    const accessSecret =
      this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
    const refreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');

    const accessExpiresIn = this.configService.get<string>(
      'JWT_ACCESS_EXPIRES_IN',
      '15m',
    );

    const refreshExpiresIn = this.configService.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
      '7d',
    );

    const accessPayload: JwtPayload = {
      sub: userId,
      type: 'access',
    };

    const refreshPayload: JwtPayload = {
      sub: userId,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: accessSecret,
        expiresIn: accessExpiresIn as never,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: refreshSecret,
        expiresIn: refreshExpiresIn as never,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  private async verifyRefreshToken(refreshToken: string): Promise<JwtPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(
        refreshToken,
        {
          secret:
            this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        },
      );

      if (!payload.sub || payload.type !== 'refresh') {
        throw new Error('Invalid refresh token payload.');
      }

      return payload;
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired.');
    }
  }

  private async rotateRefreshToken(
    userId: string,
    refreshToken: string,
  ): Promise<void> {
    await this.usersService.setRefreshTokenHash(
      userId,
      this.hashRefreshToken(refreshToken),
    );
  }

  private hashRefreshToken(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private refreshTokenMatches(
    refreshToken: string,
    storedHash: string,
  ): boolean {
    const candidateHash = this.hashRefreshToken(refreshToken);
    const storedBuffer = Buffer.from(storedHash, 'hex');
    const candidateBuffer = Buffer.from(candidateHash, 'hex');

    return (
      storedBuffer.length === candidateBuffer.length &&
      timingSafeEqual(storedBuffer, candidateBuffer)
    );
  }

  private toAuthenticatedUser(user: User): AuthenticatedUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    };
  }
}

import { Body, Controller, Post } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { AuthService } from './auth.service';
import type { AuthResponse } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto): Promise<AuthResponse> {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto): Promise<AuthResponse> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  logout(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<{ message: string }> {
    return this.authService.logout(user.id);
  }
}
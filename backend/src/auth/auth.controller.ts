import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { RequestWithContext } from '../common/http/request-context.interface.js';
import type { SafeUserWithPermissions } from '../users/users.service.js';
import { UsersService } from '../users/users.service.js';
import { dataResponse } from '../common/http/api-response.js';
import type { AuthTokenResult } from './auth.service.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly usersService: UsersService) {}

  @Post('register')
  async register(@Req() request: RequestWithContext, @Body() registerDto: RegisterDto) {
    return dataResponse(await this.authService.register(request, registerDto));
  }

  @Post('login')
  async login(@Req() request: RequestWithContext, @Res({ passthrough: true }) response: Response, @Body() loginDto: LoginDto) {
    return dataResponse(this.setRefreshCookie(response, await this.authService.login(request, loginDto)));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() request: RequestWithContext, @Res({ passthrough: true }) response: Response) {
    try {
      return dataResponse(this.setRefreshCookie(response, await this.authService.refresh(request, this.readCookie(request, this.authService.getRefreshCookieName()))));
    } catch (error) {
      this.clearRefreshCookie(response);
      throw error;
    }
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() request: RequestWithContext, @Res({ passthrough: true }) response: Response) {
    try {
      return dataResponse(await this.authService.logout(request));
    } finally {
      this.clearRefreshCookie(response);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() request: RequestWithContext) {
    return dataResponse<SafeUserWithPermissions>(await this.usersService.findSafeByIdWithPermissions(request.user!.id));
  }

  private setRefreshCookie(response: Response, result: AuthTokenResult) {
    response.cookie(this.authService.getRefreshCookieName(), result.refreshToken, {
      httpOnly: true,
      secure: this.authService.getRefreshCookieSecure(),
      sameSite: 'lax',
      path: '/',
      maxAge: Math.max(0, new Date(result.sessionExpiresAt).getTime() - Date.now()),
    });
    const { refreshToken: _refreshToken, ...payload } = result;
    return payload;
  }

  private clearRefreshCookie(response: Response): void {
    response.clearCookie(this.authService.getRefreshCookieName(), {
      httpOnly: true,
      secure: this.authService.getRefreshCookieSecure(),
      sameSite: 'lax',
      path: '/',
    });
  }

  private readCookie(request: RequestWithContext, name: string): string | undefined {
    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) return undefined;
    const encodedValue = cookieHeader.split(';').map((value) => value.trim()).find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
    if (!encodedValue) return undefined;
    try {
      return decodeURIComponent(encodedValue);
    } catch {
      return undefined;
    }
  }
}

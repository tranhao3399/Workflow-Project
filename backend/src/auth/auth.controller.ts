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
import { ForgotPasswordRequestDto, ForgotPasswordResetDto, ForgotPasswordVerifyDto } from './dto/forgot-password.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAuthenticationErrors, ApiDataResponseDto, ApiResourceConflict, ApiValidationError } from '../common/http/swagger-response.dto.js';

@Controller('auth')
@ApiTags('Xác thực')
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly usersService: UsersService) {}

  @Post('register')
  @ApiOperation({ summary: 'Đăng ký tài khoản', description: 'Tạo tài khoản theo contract đăng ký hiện có. Endpoint không yêu cầu Bearer token.' })
  @ApiConsumes('application/json')
  @ApiBody({ type: RegisterDto })
  @ApiOkResponse({ description: 'Đăng ký thành công.', type: ApiDataResponseDto })
  @ApiValidationError()
  @ApiResourceConflict('Email đã tồn tại.')
  async register(@Req() request: RequestWithContext, @Body() registerDto: RegisterDto) {
    return dataResponse(await this.authService.register(request, registerDto));
  }

  @Post('login')
  @ApiOperation({ summary: 'Đăng nhập', description: 'Cấp access token và đặt refresh token bằng HttpOnly Cookie. Refresh token không có trong JSON response.' })
  @ApiConsumes('application/json')
  @ApiBody({ type: LoginDto })
  @ApiOkResponse({ description: 'Đăng nhập thành công; refresh token được đặt trong HttpOnly Cookie.', type: ApiDataResponseDto })
  @ApiValidationError()
  async login(@Req() request: RequestWithContext, @Res({ passthrough: true }) response: Response, @Body() loginDto: LoginDto) {
    return dataResponse(this.setRefreshCookie(response, await this.authService.login(request, loginDto)));
  }

  @Post('forgot-password/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Yêu cầu mã đặt lại mật khẩu', description: 'Gửi OTP qua SMTP nếu email thuộc một tài khoản đang hoạt động. Phản hồi luôn chung để không tiết lộ trạng thái email.' })
  @ApiConsumes('application/json')
  @ApiBody({ type: ForgotPasswordRequestDto })
  @ApiOkResponse({ description: 'Phản hồi chung cho yêu cầu gửi mã.', type: ApiDataResponseDto })
  @ApiValidationError()
  async requestPasswordReset(@Req() request: RequestWithContext, @Body() input: ForgotPasswordRequestDto) {
    return dataResponse(await this.authService.requestPasswordReset(request, input));
  }

  @Post('forgot-password/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Xác minh OTP đặt lại mật khẩu', description: 'Xác minh OTP 6 số và chỉ trả reset token dùng một lần.' })
  @ApiConsumes('application/json')
  @ApiBody({ type: ForgotPasswordVerifyDto })
  @ApiOkResponse({ description: 'OTP hợp lệ; response chứa resetToken.', type: ApiDataResponseDto })
  @ApiValidationError()
  async verifyPasswordResetOtp(@Body() input: ForgotPasswordVerifyDto) {
    return dataResponse(await this.authService.verifyPasswordResetOtp(input));
  }

  @Post('forgot-password/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đặt lại mật khẩu', description: 'Dùng reset token một lần để đặt mật khẩu mới và thu hồi toàn bộ phiên đăng nhập hiện có.' })
  @ApiConsumes('application/json')
  @ApiBody({ type: ForgotPasswordResetDto })
  @ApiOkResponse({ description: 'Đặt lại mật khẩu thành công. Không cấp access token hoặc refresh token.', type: ApiDataResponseDto })
  @ApiValidationError()
  async resetPassword(@Req() request: RequestWithContext, @Body() input: ForgotPasswordResetDto) {
    return dataResponse(await this.authService.resetPassword(request, input));
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Đổi mật khẩu của tôi', description: 'Yêu cầu mật khẩu hiện tại, sau đó thu hồi toàn bộ phiên đăng nhập để bảo mật.' })
  @ApiConsumes('application/json')
  @ApiBody({ type: ChangePasswordDto })
  @ApiOkResponse({ description: 'Đổi mật khẩu thành công và xóa refresh token hiện tại.', type: ApiDataResponseDto })
  @ApiAuthenticationErrors()
  @ApiValidationError()
  async changePassword(@Req() request: RequestWithContext, @Res({ passthrough: true }) response: Response, @Body() input: ChangePasswordDto) {
    const result = await this.authService.changePassword(request, input);
    this.clearRefreshCookie(response);
    return dataResponse(result);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Làm mới access token', description: 'Đọc refresh token từ HttpOnly Cookie để cấp access token mới. Không yêu cầu Bearer token.' })
  @ApiOkResponse({ description: 'Làm mới access token thành công; refresh token mới được đặt trong HttpOnly Cookie.', type: ApiDataResponseDto })
  @ApiValidationError()
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
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Đăng xuất', description: 'Thu hồi phiên hiện tại. Yêu cầu Bearer access token.' })
  @ApiOkResponse({ description: 'Đăng xuất thành công.', type: ApiDataResponseDto })
  @ApiAuthenticationErrors()
  async logout(@Req() request: RequestWithContext, @Res({ passthrough: true }) response: Response) {
    try {
      return dataResponse(await this.authService.logout(request));
    } finally {
      this.clearRefreshCookie(response);
    }
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Lấy hồ sơ hiện tại', description: 'Trả user hiện tại, role/roleIds và effective permissionKeys theo contract; không trả password, hash hoặc session secret.' })
  @ApiOkResponse({ description: 'Hồ sơ người dùng hiện tại.', type: ApiDataResponseDto })
  @ApiAuthenticationErrors()
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

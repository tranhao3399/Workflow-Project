import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { SafeUser, UsersService } from '../users/users.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtPayload } from './interfaces/jwt-payload.interface.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto): Promise<SafeUser> {
    const email = registerDto.email.toLowerCase();
    const existingUser = await this.usersService.findByEmailForAuth(email);

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(registerDto.password, 12);

    try {
      const user = await this.usersService.create({
        fullName: registerDto.fullName,
        email,
        passwordHash,
        role: registerDto.role,
        department: registerDto.department,
      });

      return this.usersService.toSafeUser(user);
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new ConflictException('Email is already registered');
      }

      throw error;
    }
  }

  async login(loginDto: LoginDto): Promise<{ accessToken: string; user: SafeUser }> {
    const user = await this.usersService.findByEmailForAuth(loginDto.email);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(loginDto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const safeUser = this.usersService.toSafeUser(user);
    const payload: JwtPayload = {
      sub: safeUser.id,
      email: safeUser.email,
      role: safeUser.role,
    };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: safeUser,
    };
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 11000;
  }
}

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Model } from 'mongoose';
import { SafeUser, UsersService } from '../../users/users.service.js';
import { JwtPayload } from '../interfaces/jwt-payload.interface.js';
import { UserSession } from '../schemas/user-session.schema.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly usersService: UsersService,
    @InjectModel(UserSession.name) private readonly sessionModel: Model<UserSession>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_ACCESS_SECRET') ?? configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<SafeUser> {
    const user = await this.usersService.findById(payload.sub);

    if (!user || !user.isActive) {
      throw new UnauthorizedException();
    }

    const session = await this.sessionModel.findOne({ _id: payload.sid, userId: payload.sub }).exec();
    if (!session) throw new UnauthorizedException({ message: 'Phiên đăng nhập không còn hiệu lực.', code: 'SESSION_REVOKED' });
    if (session.revokedAt) throw new UnauthorizedException({ message: 'Phiên đăng nhập không còn hiệu lực.', code: 'SESSION_REVOKED' });
    if (session.expiresAt <= new Date()) throw new UnauthorizedException({ message: 'Phiên đăng nhập đã hết hạn.', code: 'SESSION_EXPIRED' });

    return { ...this.usersService.toSafeUser(user), sessionId: session._id.toString() };
  }
}

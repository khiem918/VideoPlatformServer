import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthResolver } from './auth.resolver';
import { PrismaModule } from 'src/prisma/prisma.module';
import { RedisModule } from 'src/session/session.module';
import { JwtStrategy } from './strategy/jwt.strategy';
import { AuthRepository } from './repository/auth.repository';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    RedisModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<number>('JWT_EXPIRES_IN'),
        },
      }),
    }),
  ],
  providers: [AuthService, AuthResolver, JwtStrategy, AuthRepository],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}

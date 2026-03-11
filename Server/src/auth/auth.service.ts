import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserService } from 'src/user/user.service';
import { JwtPayload } from './type/jwt-payload.type';

@Injectable()
export class AuthService {
	constructor(
		private readonly userService: UserService,
		private readonly jwtService: JwtService,
	) {}

	async signIn(userEmail : string): Promise<string> {
		const user = await this.userService.findByEmail(userEmail);

		const payload: JwtPayload = {
			sub: user.id,
			userEmail: userEmail,
		};
		
		return this.jwtService.signAsync(payload);
	}
}

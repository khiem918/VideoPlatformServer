import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { AuthService } from './auth.service';
import { SignInInput } from './dto/sign-in.input';
import { AuthPayload } from './type/auth-payload.type';
import { OAuth2Client } from 'google-auth-library'

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  private client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  
  async verifyGoogleToken(idToken: string) {
    const ticket = await this.client.verifyIdToken({
      idToken: idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    return payload;
  }

  @Mutation(() => AuthPayload)
  async signIn(@Args('signInInput') signInInput: SignInInput): Promise<AuthPayload> {
    const GoogleTokenPayLoad = await this.verifyGoogleToken(signInInput.googleToken);
    
    if (GoogleTokenPayLoad?.email === undefined) {
      throw new Error('Invalid Google token');
    }
    
    const accessToken = await this.authService.signIn(GoogleTokenPayLoad.email);
    return { accessToken };
  }
}

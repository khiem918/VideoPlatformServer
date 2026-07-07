import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App, cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { DecodedIdToken, getAuth } from 'firebase-admin/auth';

@Injectable()
export class FirebaseService implements OnModuleInit {
  private app!: App;

  constructor(private readonly config: ConfigService) { }

  onModuleInit() {
    if (getApps().length) {
      this.app = getApp();
      return;
    }

    const privateKey = this.config
      .get<string>('FIREBASE_PRIVATE_KEY')
      ?.replace(/\\n/g, '\n');

    if (!privateKey || privateKey.includes('...')) {
      console.warn(
        'Set FIREBASE_PRIVATE_KEY in .env to a valid service account private key.',
      );
      return;
    }

    this.app = initializeApp({
      credential: cert({
        projectId: this.config.get('FIREBASE_PROJECT_ID'),
        clientEmail: this.config.get('FIREBASE_CLIENT_EMAIL'),
        privateKey,
      }),
    });
  }

  verifyIdToken(idToken: string): Promise<DecodedIdToken> {
    if (!this.app) {
      throw new Error(
        'Firebase is not initialized. Check FIREBASE_PRIVATE_KEY in .env',
      );
    }
    return getAuth(this.app).verifyIdToken(idToken);
  }
}

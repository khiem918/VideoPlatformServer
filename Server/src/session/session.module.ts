import { Global, Module } from '@nestjs/common';
import { RedisService } from './session.service';

@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}

import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    HttpModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        baseURL: config.get<string>('DOTNET_SERVICE_URL'),
        timeout: 10000,
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [HttpModule],
})
export class PspModule {}

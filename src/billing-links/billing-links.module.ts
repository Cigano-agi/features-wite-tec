import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingLink } from './billing-link.entity';
import { BillingLinksService } from './billing-links.service';
import { BillingLinksController } from './billing-links.controller';
import { JwtStrategy } from '../shared/auth/jwt.strategy';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    TypeOrmModule.forFeature([BillingLink]),
    PassportModule,
    JwtModule.register({ secret: process.env.JWT_SECRET ?? 'dev-secret-local' }),
  ],
  controllers: [BillingLinksController],
  providers: [BillingLinksService, JwtStrategy],
  exports: [BillingLinksService],
})
export class BillingLinksModule {}

import { Controller, Post, Body, Param, Headers, HttpCode, BadRequestException } from '@nestjs/common';
import { PublicChargeService } from './public-charge.service';
import { PublicChargeDto } from './dto/public-charge.dto';
import { CORRELATION_ID_HEADER } from '../shared/correlation/correlation-id.middleware';

@Controller('v1/public')
export class PublicChargeController {
  constructor(private readonly service: PublicChargeService) {}

  @Post('charge/:linkId')
  @HttpCode(201)
  async charge(
    @Param('linkId') linkId: string,
    @Body() dto: PublicChargeDto,
    @Headers('idempotency-key') idempotencyKey: string,
    @Headers(CORRELATION_ID_HEADER) correlationId: string,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Idempotency-Key header is required');
    }

    const result = await this.service.charge(linkId, dto, idempotencyKey, correlationId);

    if ((result as any).idempotent) {
      return { ...result, status: 409 };
    }

    return result;
  }
}

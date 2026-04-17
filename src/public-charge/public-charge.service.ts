import { Injectable, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { BillingLinksService } from '../billing-links/billing-links.service';
import { IdempotencyService } from '../shared/idempotency/idempotency.service';
import { PiiSanitizer } from '../shared/pii/pii-sanitizer';
import { PublicChargeDto } from './dto/public-charge.dto';

export interface ChargeResult {
  transaction_id: string;
  status: string;
  amount: number;
  billing_link_id: string;
  idempotent?: boolean;
}

@Injectable()
export class PublicChargeService {
  private readonly defaultEmail: string;
  private readonly defaultPhone: string;

  constructor(
    private readonly billingLinksService: BillingLinksService,
    private readonly idempotencyService: IdempotencyService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.defaultEmail = this.configService.get<string>('PUBLIC_CHARGE_DEFAULT_EMAIL') ?? 'noreply@witetec.com';
    this.defaultPhone = this.configService.get<string>('PUBLIC_CHARGE_DEFAULT_PHONE') ?? '+5500000000000';
  }

  async charge(linkId: string, dto: PublicChargeDto, idempotencyKey: string, correlationId: string): Promise<ChargeResult> {
    const link = await this.billingLinksService.findActiveById(linkId);
    if (!link) {
      throw new NotFoundException('billing_link_not_found_or_inactive');
    }

    const existing = await this.idempotencyService.exists(idempotencyKey);
    if (existing) {
      return { ...(existing as any), idempotent: true };
    }

    const payload = {
      billingLinkId: link.id,
      amount: link.amount,
      payerName: dto.name,
      payerCpf: dto.cpf,
      payerEmail: this.defaultEmail,
      payerPhone: this.defaultPhone,
      metadata: { billing_link_id: link.id, source: 'public_charge' },
    };

    let txResponse: { transactionId: string; status: string; amount: number };

    try {
      const response = await firstValueFrom(
        this.httpService.post('/internal/transactions', payload, {
          headers: { 'x-correlation-id': correlationId },
        }),
      );
      txResponse = response.data;
    } catch (err: any) {
      PiiSanitizer.safeBody(payload as any);
      throw new HttpException(
        { error: 'payment_processor_unavailable', correlationId },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const result: ChargeResult = {
      transaction_id: txResponse.transactionId,
      status: txResponse.status,
      amount: txResponse.amount,
      billing_link_id: link.id,
    };

    await this.idempotencyService.save(idempotencyKey, result as any);
    return result;
  }
}

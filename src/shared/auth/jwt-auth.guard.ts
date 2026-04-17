import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('invalid_token');
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string; email?: string }>(token);
      (request as any).user = { sellerId: payload.sub, email: payload.email };
      return true;
    } catch {
      throw new UnauthorizedException('invalid_token');
    }
  }

  private extractToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header) return null;
    const parts = header.split(' ');
    if (parts.length !== 2) return null;
    const [type, token] = parts;
    return type === 'Bearer' && token ? token : null;
  }
}

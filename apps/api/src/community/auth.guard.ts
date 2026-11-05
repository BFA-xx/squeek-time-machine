import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { AuthService, SESSION_COOKIE } from "./auth.service";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}
  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const user = await this.auth.fromToken(req.cookies?.[SESSION_COOKIE]);
    if (!user) throw new UnauthorizedException("Sign in first.");
    req.user = user;
    return true;
  }
}

/** Moderation routes stay closed when no token is configured. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const expected = process.env.ADMIN_TOKEN ?? "";
    const given = String(ctx.switchToHttp().getRequest().headers["x-admin-token"] ?? "");
    if (expected.length < 16) throw new UnauthorizedException();
    const a = Buffer.from(expected);
    const b = Buffer.from(given);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException();
    return true;
  }
}

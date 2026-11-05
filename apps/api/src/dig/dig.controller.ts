import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { AuthGuard } from "../community/auth.guard";
import { AuthService, SESSION_COOKIE } from "../community/auth.service";
import { DigService } from "./dig.service";

type Authed = Request & { user: { id: string; walletAddress: string | null } };
const WRITE = { default: { limit: 30, ttl: 60_000 } };

@Controller("dig")
export class DigController {
  constructor(private readonly dig: DigService, private readonly auth: AuthService) {}

  @Get()
  async state(@Req() req: Request) {
    const user = await this.auth.fromToken(req.cookies?.[SESSION_COOKIE]);
    return this.dig.state(user?.id);
  }
  @UseGuards(AuthGuard) @Throttle(WRITE) @Post("crew") @HttpCode(200)
  crew(@Req() req: Authed, @Body() b: Record<string, unknown>) { return this.dig.joinCrew(req.user, b.crew); }
  @UseGuards(AuthGuard) @Throttle(WRITE) @Post("call") @HttpCode(200)
  call(@Req() req: Authed, @Body() b: Record<string, unknown>) { return this.dig.call(req.user, b); }
  @UseGuards(AuthGuard) @Get("squeeks")
  squeeks(@Req() req: Authed) { return this.dig.mySqueeks(req.user); }
  @UseGuards(AuthGuard) @Throttle(WRITE) @Post("squeek") @HttpCode(200)
  show(@Req() req: Authed, @Body() b: Record<string, unknown>) { return this.dig.showSqueek(req.user, b.tokenId ?? null); }
}

import { Body, Controller, Get, Header, HttpCode, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { AuthGuard } from "../community/auth.guard";
import { AuthService, SESSION_COOKIE } from "../community/auth.service";
import { ContributionService } from "./contribution.service";
import { DigService } from "./dig.service";

type Authed = Request & { user: { id: string; walletAddress: string | null } };
const WRITE = { default: { limit: 30, ttl: 60_000 } };

@Controller("dig")
export class DigController {
  constructor(private readonly dig: DigService, private readonly auth: AuthService, private readonly contributions: ContributionService) {}

  @Get()
  async state(@Req() req: Request) {
    const user = await this.auth.fromToken(req.cookies?.[SESSION_COOKIE]);
    return this.dig.state(user?.id);
  }
  @UseGuards(AuthGuard) @Throttle(WRITE) @Post("crew") @HttpCode(200)
  crew(@Req() req: Authed, @Body() b: Record<string, unknown>) { return this.dig.joinCrew(req.user, b.crew); }
  @UseGuards(AuthGuard) @Throttle(WRITE) @Post("call") @HttpCode(200)
  call(@Req() req: Authed, @Body() b: Record<string, unknown>) { return this.dig.call(req.user, b); }
  @UseGuards(AuthGuard) @Throttle(WRITE) @Post("contributions") @HttpCode(200)
  contribute(@Req() req: Authed, @Body() b: Record<string, unknown>) { return this.contributions.credit(req.user, b.txHash); }
  @UseGuards(AuthGuard) @Throttle(WRITE) @Post("tasks/:slug") @HttpCode(200)
  task(@Req() req: Authed, @Param("slug") slug: string, @Body() b: Record<string, unknown>) { return this.dig.claimTask(req.user, slug, b?.proof); }
  @Get("ticket") @Header("cache-control", "no-store")
  async ticket(@Req() req: Request) { return this.dig.realtimeTicket(await this.auth.fromToken(req.cookies?.[SESSION_COOKIE])); }
  @UseGuards(AuthGuard) @Get("squeeks")
  squeeks(@Req() req: Authed) { return this.dig.mySqueeks(req.user); }
  @UseGuards(AuthGuard) @Throttle(WRITE) @Post("squeek") @HttpCode(200)
  show(@Req() req: Authed, @Body() b: Record<string, unknown>) { return this.dig.showSqueek(req.user, b.tokenId ?? null); }
}

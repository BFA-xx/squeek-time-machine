import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req, Res, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { AdminGuard, AuthGuard } from "./auth.guard";
import { AuthService, isValidSignatureShape, SESSION_COOKIE } from "./auth.service";
import { CommunityService } from "./community.service";

type Authed = Request & { user: { id: string; username: string; walletAddress: string | null; role: string; createdAt: Date; usernameChangedAt: Date | null } };
const WRITE = { default: { limit: 30, ttl: 60_000 } };
const AUTH = { default: { limit: Number(process.env.AUTH_THROTTLE_PER_MINUTE ?? 10), ttl: 60_000 } };

function setCookie(res: Response, session: { token: string; maxAge: number } | null) {
  if (session) res.cookie(SESSION_COOKIE, session.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: session.maxAge, path: "/" });
}
const str = (v: unknown) => (typeof v === "string" ? v : "");

@Controller()
export class CommunityController {
  constructor(private readonly auth: AuthService, private readonly community: CommunityService) {}

  @Throttle(AUTH) @Post("auth/register")
  async register(@Body() b: Record<string, unknown>, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.register(str(b.username), str(b.password));
    setCookie(res, r.session);
    return { user: r.user };
  }
  @Throttle(AUTH) @Post("auth/login") @HttpCode(200)
  async login(@Body() b: Record<string, unknown>, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(str(b.username), str(b.password));
    setCookie(res, r.session);
    return { user: r.user };
  }
  @Post("auth/logout") @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    return { ok: true };
  }
  @Get("auth/me")
  async me(@Req() req: Request) {
    const u = await this.auth.fromToken(req.cookies?.[SESSION_COOKIE]);
    return { user: u ? this.auth.publicUser(u) : null };
  }
  @Throttle(AUTH) @Post("auth/wallet/challenge") @HttpCode(200)
  challenge(@Req() req: Request, @Body() b: Record<string, unknown>) { return this.auth.walletChallenge(str(b.address), req.headers.origin); }
  @Throttle(AUTH) @Post("auth/wallet/verify") @HttpCode(200)
  async verify(@Body() b: Record<string, unknown>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!isValidSignatureShape(b.signature)) throw new BadRequestException("That isn't a signature.");
    const current = await this.auth.fromToken(req.cookies?.[SESSION_COOKIE]);
    const r = await this.auth.walletVerify(str(b.nonce), b.signature, current);
    setCookie(res, r.session);
    return { user: r.user };
  }

  @Get("community/memories")
  memories(@Query() q: Record<string, string>) { return this.community.listMemories({ subject: q.subject, kind: q.kind, cursor: q.cursor, limit: q.limit ? Math.max(1, Number(q.limit) || 30) : undefined }); }
  @UseGuards(AuthGuard) @Throttle(WRITE) @Post("community/memories")
  addMemory(@Req() req: Authed, @Body() b: Record<string, unknown>) { return this.community.createMemory(req.user, b); }

  @Get("community/comments")
  comments(@Query("subject") subject = "") { return this.community.listComments(subject); }
  @UseGuards(AuthGuard) @Throttle(WRITE) @Post("community/comments")
  addComment(@Req() req: Authed, @Body() b: Record<string, unknown>) { return this.community.createComment(req.user, b); }

  @Get("community/reactions")
  reactions(@Query("subject") subject = "") { return this.community.reactionsFor(subject); }
  @UseGuards(AuthGuard) @Throttle(WRITE) @Post("community/reactions") @HttpCode(200)
  react(@Req() req: Authed, @Body() b: Record<string, unknown>) { return this.community.toggleReaction(req.user, b); }

  @Get("community/polls")
  async polls(@Req() req: Request, @Query("scope") scope?: string) {
    const u = await this.auth.fromToken(req.cookies?.[SESSION_COOKIE]);
    return this.community.listPolls(scope, u?.id);
  }
  @UseGuards(AuthGuard) @Throttle(WRITE) @Post("community/polls")
  addPoll(@Req() req: Authed, @Body() b: Record<string, unknown>) { return this.community.createPoll(req.user, b); }
  @UseGuards(AuthGuard) @Throttle(WRITE) @Post("community/polls/:id/vote") @HttpCode(200)
  vote(@Req() req: Authed, @Param("id") id: string, @Body() b: Record<string, unknown>) { return this.community.vote(req.user, id, b.optionId); }

  @UseGuards(AuthGuard) @Throttle(WRITE) @Post("community/reports") @HttpCode(200)
  report(@Req() req: Authed, @Body() b: Record<string, unknown>) { return this.community.report(req.user, b); }

  @Get("community/feed") feed() { return this.community.feed(); }
  @Get("community/discovery") discovery() { return this.community.discovery(); }
  @Throttle(WRITE) @Post("community/share") @HttpCode(200)
  share(@Body() b: Record<string, unknown>) { return this.community.share(b.subject); }

  @Get("users/:username") profile(@Param("username") u: string) { return this.community.profile(u); }
  @UseGuards(AuthGuard) @Put("users/me/profile")
  updateProfile(@Req() req: Authed, @Body() b: Record<string, unknown>) { return this.community.updateProfile(req.user, b); }

  @UseGuards(AdminGuard) @Get("admin/reports") adminReports() { return this.community.adminReports(); }
  @UseGuards(AdminGuard) @Post("admin/reports/:id/resolve") @HttpCode(200)
  resolve(@Param("id") id: string, @Body() b: Record<string, unknown>) { return this.community.resolveReport(id, b.action); }
}

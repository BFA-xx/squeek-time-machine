import { BadRequestException, ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { usernameAllowed } from "@stm/shared";
import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { getAddress, isAddress, verifyMessage } from "viem";
import { PrismaService } from "../common/prisma.service";

const scryptAsync = promisify(scrypt) as (p: string, s: Buffer, l: number) => Promise<Buffer>;
const SESSION_MS = 30 * 24 * 3600_000;
export const SESSION_COOKIE = "stm_session";

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}
async function checkPassword(password: string, stored: string) {
  const [, salt, key] = stored.split("$");
  if (!salt || !key) return false;
  const a = await scryptAsync(password, Buffer.from(salt, "hex"), 64);
  const b = Buffer.from(key, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

@Injectable()
export class AuthService {
  constructor(private readonly db: PrismaService) {}

  private async createSession(userId: string) {
    const token = randomBytes(32).toString("base64url");
    await this.db.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + SESSION_MS) } });
    return { token, maxAge: SESSION_MS };
  }

  async register(username: string, password: string) {
    if (!usernameAllowed(username)) throw new BadRequestException("Usernames are 3 to 24 letters, numbers or underscores, and some names are reserved.");
    if (password.length < 10 || password.length > 200) throw new BadRequestException("Use a password of at least 10 characters.");
    const lower = username.toLowerCase();
    if (await this.db.user.findUnique({ where: { usernameLower: lower } })) throw new ConflictException("That username is taken.");
    const user = await this.db.user.create({ data: { username, usernameLower: lower, passwordHash: await hashPassword(password), profile: { create: {} } }, include: { profile: true } });
    return { user: this.publicUser(user), session: await this.createSession(user.id) };
  }

  async login(username: string, password: string) {
    const user = await this.db.user.findUnique({ where: { usernameLower: username.toLowerCase() }, include: { profile: true } });
    if (!user?.passwordHash || !(await checkPassword(password, user.passwordHash))) throw new UnauthorizedException("Wrong username or password.");
    if (user.bannedAt) throw new UnauthorizedException("This account has been suspended.");
    return { user: this.publicUser(user), session: await this.createSession(user.id) };
  }

  async fromToken(token?: string) {
    if (!token) return null;
    const s = await this.db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { include: { profile: true } } } });
    if (!s || s.expiresAt < new Date() || s.user.bannedAt) return null;
    return s.user;
  }

  async logout(token?: string) {
    if (token) await this.db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  /** The site named in the sign-in message. Only an allowed site can be named, so a wallet never shows one that isn't ours. */
  private walletDomain(origin?: string) {
    const allowed = (process.env.WEB_ORIGINS ?? "").split(",").map((s) => s.trim());
    if (origin && allowed.includes(origin)) return new URL(origin).host;
    return process.env.WALLET_DOMAIN ?? "localhost:3300";
  }

  async walletChallenge(address: string, origin?: string) {
    if (!isAddress(address)) throw new BadRequestException("That isn't a wallet address.");
    const checksum = getAddress(address);
    const nonce = randomBytes(16).toString("hex");
    const domain = this.walletDomain(origin);
    const message = `${domain} asks you to sign in to Squeek Time Machine.\n\nThis only proves you own this wallet. It isn't a transaction and costs nothing.\n\nWallet: ${checksum}\nNonce: ${nonce}`;
    await this.db.walletChallenge.create({ data: { nonce, address: checksum, message, expiresAt: new Date(Date.now() + 10 * 60_000) } });
    return { nonce, message };
  }

  /** Links to the signed-in account, or else signs in or creates a wallet-only one. Each nonce works once. */
  async walletVerify(nonce: string, signature: string, current?: { id: string } | null) {
    const c = await this.db.walletChallenge.findUnique({ where: { nonce } });
    if (!c || c.usedAt || c.expiresAt < new Date()) throw new UnauthorizedException("That sign-in request has expired. Try again.");
    const claimed = await this.db.walletChallenge.updateMany({ where: { nonce, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count !== 1) throw new UnauthorizedException("That sign-in request was already used.");
    let ok = false;
    try {
      ok = await verifyMessage({ address: c.address as `0x${string}`, message: c.message, signature: signature as `0x${string}` });
    } catch {
      ok = false;
    }
    if (!ok) throw new UnauthorizedException("That signature doesn't match the wallet.");
    const owner = await this.db.user.findUnique({ where: { walletAddress: c.address }, include: { profile: true } });
    if (current) {
      if (owner && owner.id !== current.id) throw new ConflictException("That wallet is linked to another account.");
      const user = await this.db.user.update({ where: { id: current.id }, data: { walletAddress: c.address }, include: { profile: true } });
      return { user: this.publicUser(user), session: null };
    }
    if (owner) {
      if (owner.bannedAt) throw new UnauthorizedException("This account has been suspended.");
      return { user: this.publicUser(owner), session: await this.createSession(owner.id) };
    }
    const username = `hamster_${c.address.slice(2, 10).toLowerCase()}`;
    const user = await this.db.user.create({ data: { username, usernameLower: username, walletAddress: c.address, profile: { create: {} } }, include: { profile: true } });
    return { user: this.publicUser(user), session: await this.createSession(user.id) };
  }

  publicUser(u: { id: string; username: string; walletAddress: string | null; role: string; createdAt: Date; profile?: { displayName: string | null; bio: string } | null }) {
    return { id: u.id, username: u.username, displayName: u.profile?.displayName ?? null, bio: u.profile?.bio ?? "", wallet: u.walletAddress, role: u.role, createdAt: u.createdAt };
  }
}

export function isValidSignatureShape(s: unknown): s is string {
  return typeof s === "string" && /^0x[0-9a-fA-F]{130,}$/.test(s);
}

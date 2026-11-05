import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { getAddress, isAddress } from "viem";
import { z } from "zod";
import { SqueekApiClient } from "../ingestion/squeek-api.client";

const Token = z.object({ tokenId: z.string().regex(/^\d+$/), custody: z.string(), level: z.number(), basePower: z.string(), nextMergeHeight: z.string().nullable().optional(), mergeState: z.string().nullable().optional() }).passthrough();
const Account = z.object({
  account: z.string(), installationId: z.string(), nextCursor: z.string().nullable().optional(), tokens: z.array(Token),
  tokenCounts: z.object({ staking: z.string(), wallet: z.string() }).partial().passthrough().optional(),
  rewards: z.object({ claimableBaseUnits: z.string() }).passthrough().nullable().optional(),
  power: z.object({ nftPower: z.string(), sqkPower: z.string() }).passthrough().nullable().optional(),
}).passthrough();
const Squeek = z.object({
  tokenId: z.string(), level: z.number(), basePower: z.string(), nextMergeHeight: z.string().nullable().optional(), mergeState: z.string().nullable().optional(),
  custody: z.object({ owner: z.string().nullable().optional(), depositor: z.string().nullable().optional(), burned: z.boolean().optional() }).passthrough(),
  metadata: z.object({ status: z.string(), name: z.string().optional(), imageDataUri: z.string().optional(), attributes: z.array(z.object({ trait_type: z.string().optional(), value: z.unknown() }).passthrough()).optional() }).passthrough(),
}).passthrough();

// Only a base64 SVG passes. The browser shows it in an <img>, where scripts can't run, and it never goes into the page's markup.
const SAFE_ART = /^data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+$/;
const MAX_ART = 400_000;
const ACCOUNT_TTL = 20_000;
const SQUEEK_TTL = 5 * 60_000;
const MAX_PAGES = 5;

/** Reads a wallet's Squeeks for display. Public data, so viewing needs no signature, and nothing here can move anything. */
@Injectable()
export class SqueeksService {
  private readonly accounts = new Map<string, { at: number; value: unknown }>();
  private readonly squeeks = new Map<string, { at: number; value: unknown }>();
  constructor(private readonly api: SqueekApiClient) {}

  private remember<T>(cache: Map<string, { at: number; value: unknown }>, key: string, value: T) {
    if (cache.size > 2000) cache.clear();
    cache.set(key, { at: Date.now(), value });
    return value;
  }

  async forWallet(address: string) {
    if (!isAddress(address, { strict: false })) throw new BadRequestException("That isn't a wallet address.");
    const wallet = getAddress(address).toLowerCase();
    const hit = this.accounts.get(wallet);
    if (hit && Date.now() - hit.at < ACCOUNT_TTL) return hit.value;
    const tokens: z.infer<typeof Token>[] = [];
    let cursor: string | null | undefined;
    let first: z.infer<typeof Account> | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const q = new URLSearchParams({ limit: "100" });
      if (cursor) q.set("cursor", cursor);
      const res = await this.api.get("squeeks", `/v1/accounts/${wallet}?${q}`, Account);
      if (!res.ok) throw new ServiceUnavailableException("The official API can't show this wallet's Squeeks right now. Nothing has changed with your NFTs.");
      const data = (res as { data: z.infer<typeof Account> }).data;
      first ??= data;
      tokens.push(...data.tokens);
      cursor = data.nextCursor;
      if (!cursor) break;
    }
    return this.remember(this.accounts, wallet, {
      wallet: getAddress(address),
      installationId: first!.installationId,
      partial: !!cursor,
      counts: first!.tokenCounts ?? null,
      claimableBaseUnits: first!.rewards?.claimableBaseUnits ?? null,
      power: first!.power ?? null,
      tokens: tokens.map((t) => ({ tokenId: t.tokenId, custody: t.custody, level: t.level, basePower: t.basePower, nextMergeHeight: t.nextMergeHeight ?? null, mergeState: t.mergeState ?? null })),
    });
  }

  async one(tokenId: string) {
    if (!/^\d{1,6}$/.test(tokenId)) throw new BadRequestException("That isn't a Squeek number.");
    const hit = this.squeeks.get(tokenId);
    if (hit && Date.now() - hit.at < SQUEEK_TTL) return hit.value;
    const res = await this.api.get("squeeks", `/v1/squeeks/${tokenId}`, Squeek);
    if (!res.ok) {
      if (res.kind === "unavailable") throw new NotFoundException("That Squeek isn't available right now.");
      throw new ServiceUnavailableException("The official API can't show this Squeek right now.");
    }
    const s = (res as { data: z.infer<typeof Squeek> }).data;
    const art = s.metadata.imageDataUri;
    return this.remember(this.squeeks, tokenId, {
      tokenId: s.tokenId,
      name: s.metadata.name?.slice(0, 80) ?? `Squeek #${s.tokenId}`,
      level: s.level,
      basePower: s.basePower,
      mergeState: s.mergeState ?? null,
      nextMergeHeight: s.nextMergeHeight ?? null,
      burned: s.custody.burned ?? false,
      image: art && art.length <= MAX_ART && SAFE_ART.test(art) ? art : null,
      attributes: (s.metadata.attributes ?? []).slice(0, 30).map((a) => ({ trait: String(a.trait_type ?? "").slice(0, 60), value: String(a.value ?? "").slice(0, 80) })),
    });
  }
}

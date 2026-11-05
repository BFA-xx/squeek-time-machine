export const LIMITS = { displayName: 40, comment: 800, memory: 400, username: 24, bio: 240, pollQuestion: 160, pollOption: 80, report: 300 };

const LINK = /\b(?:https?:\/\/|www\.)[^\s<>]+|\b[a-z0-9-]+\.(?:com|net|org|io|xyz|app|gg|me|co|ru|cn|top|click|link|info|site|online|fun|lol|eth|limo)\b(?:\/[^\s<>]*)?/gi;
const ALLOWED_HOSTS = ["squeekchain.com", "etherscan.io"];
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁤﻿]/g;

export interface TextCheck {
  ok: boolean;
  text: string;
  reason?: "empty" | "too_long" | "links_blocked" | "seed_phrase" | "repetitive";
}

function hostAllowed(raw: string): boolean {
  const host = raw.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split(/[/?#]/)[0].toLowerCase();
  return ALLOWED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/**
 * Community text is plain text only, and the UI never renders it as HTML. Links are refused
 * unless they point somewhere the archive already trusts, because a history page full of
 * "claim here" links is the obvious way to attack this audience.
 */
export function checkUserText(input: string, max: number): TextCheck {
  const text = input.normalize("NFKC").replace(CONTROL, "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return { ok: false, text, reason: "empty" };
  if ([...text].length > max) return { ok: false, text, reason: "too_long" };
  const links = text.match(LINK) ?? [];
  if (links.some((l) => !hostAllowed(l))) return { ok: false, text, reason: "links_blocked" };
  if (/\b(seed phrase|private key|connect (your )?wallet|claim (your )?(airdrop|reward)s? (now|here))\b/i.test(text)) {
    return { ok: false, text, reason: "seed_phrase" };
  }
  if (/(.)\1{14,}/.test(text)) return { ok: false, text, reason: "repetitive" };
  return { ok: true, text };
}

export const USERNAME = /^[a-zA-Z0-9_]{3,24}$/;
const RESERVED = new Set(["admin", "squeektoshi", "squeekchain", "wheely9000", "moderator", "official", "support", "team"]);

export function usernameAllowed(name: string): boolean {
  return USERNAME.test(name) && !RESERVED.has(name.toLowerCase());
}

/** Display names can use spaces and symbols, so they're compared with those removed. "Squeek Toshi!" is still taken. */
export function displayNameAllowed(name: string): boolean {
  return !RESERVED.has(name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""));
}

export const REACTIONS = ["squeek", "wheel", "cheese", "heart", "wow"] as const;
export type ReactionKind = (typeof REACTIONS)[number];
export const REACTION_GLYPHS: Record<ReactionKind, string> = { squeek: "🐹", wheel: "🛞", cheese: "🧀", heart: "🧡", wow: "✨" };

/** Subjects a community post can attach to. Anything else is refused before it reaches the database. */
export function parseSubject(subject: string): { kind: "event" | "block" | "memory" | "poll" | "comment"; id: string } | null {
  const m = /^(event|block|memory|poll|comment):(.{1,600})$/s.exec(subject);
  return m ? { kind: m[1] as "event", id: m[2] } : null;
}

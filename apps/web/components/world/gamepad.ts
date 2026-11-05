import { ROOMS, type RoomSlug } from "@stm/shared";
import { useWorld } from "@/lib/store";
import { sendEmote } from "@/lib/multiplayer";
import { hopStart } from "./hop";
import { ride, rideTap } from "./ride";
import { input } from "./input";

/** Standard mapping, which Chrome, Edge, Firefox and Safari use for a DualSense. */
export const PAD = { cross: 0, circle: 1, square: 2, triangle: 3, l1: 4, r1: 5, l2: 6, r2: 7, options: 9, up: 12, down: 13, left: 14, right: 15 } as const;
const DEAD = 0.16;

export const deadzone = (v: number) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

/** Which room comes next when cycling with L1 or R1. */
export function nextRoom(current: string, dir: 1 | -1): RoomSlug | "hub" {
  const order: (RoomSlug | "hub")[] = ["hub", ...ROOMS.map((r) => r.slug)];
  const at = Math.max(0, order.indexOf(current as RoomSlug));
  return order[(at + dir + order.length) % order.length];
}

let held: boolean[] = [];
let announced = false;

const scroller = () => document.querySelector<HTMLElement>('[aria-label="Details"]');

export function pollGamepad(dt: number) {
  input.padX = input.padY = 0;
  input.padBoost = 0;
  const pad = [...(navigator.getGamepads?.() ?? [])].find((p) => p && p.connected);
  if (!pad) {
    held = [];
    return;
  }
  const store = useWorld.getState();
  if (!announced) {
    announced = true;
    store.pushToast({ title: "Controller ready: left stick walks, right stick looks, X uses or hops, O goes back, hold R1 to boost", tone: "chain" });
  }
  const panel = store.panel;
  const lx = deadzone(pad.axes[0] ?? 0), ly = deadzone(pad.axes[1] ?? 0);
  const rx = deadzone(pad.axes[2] ?? 0), ry = deadzone(pad.axes[3] ?? 0);
  if (panel) {
    scroller()?.scrollBy(0, (ly + ry) * dt * 900);
  } else {
    input.padX = lx;
    input.padY = ly;
    if (rx || ry) input.onOrbit?.(rx * dt * 520, ry * dt * 340);
  }
  // Hold R1 to boost: X taps count for more on a wheel, and you sprint on foot.
  input.padBoost = pad.buttons[PAD.r1]?.pressed ? 1 : 0;
  const zoom = (pad.buttons[PAD.down]?.pressed ? 1 : 0) - (pad.buttons[PAD.up]?.pressed ? 1 : 0);
  if (!panel && zoom) input.onZoom?.(zoom * dt * 1100);

  const pressed = (b: number) => !!pad.buttons[b]?.pressed && !held[b];
  if (store.ride) {
    ride.boost = Math.max(input.padBoost, input.keyBoost);
    if (pressed(PAD.cross)) rideTap();
    if (pressed(PAD.circle)) store.setRide(false);
  } else if (panel) {
    if (pressed(PAD.circle)) (store.history.length ? store.backPanel() : store.closePanel());
  } else {
    // X uses whatever you're next to. With nothing to use, it hops.
    if (pressed(PAD.cross)) {
      if (store.prompt) store.prompt.action();
      else hopStart();
    }
    if (pressed(PAD.right)) sendEmote("wave");
    if (pressed(PAD.left)) sendEmote("squeek");
    if (pressed(PAD.l2)) store.requestTravel(nextRoom(store.location, 1));
    if (pressed(PAD.l1)) store.requestTravel(nextRoom(store.location, -1));
    if (pressed(PAD.triangle)) store.openPanel({ kind: "search" });
    if (pressed(PAD.options)) store.openPanel({ kind: "settings" });
  }
  held = pad.buttons.map((b) => b.pressed);
}

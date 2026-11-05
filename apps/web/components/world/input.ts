/** Shared input state, read every frame. It lives outside React so moving never triggers a render. */
export const input = {
  keys: new Set<string>(),
  axisX: 0,
  axisY: 0,
  padX: 0,
  padY: 0,
  padBoost: 0,
  keyBoost: 0,
  dragging: false,
  onOrbit: null as ((dx: number, dy: number) => void) | null,
  onZoom: null as ((d: number) => void) | null,
};

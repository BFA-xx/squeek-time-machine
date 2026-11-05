/** Shared input state, read every frame. It lives outside React so moving never triggers a render. */
export const input = {
  keys: new Set<string>(),
  axisX: 0,
  axisY: 0,
  dragging: false,
  onOrbit: null as ((dx: number, dy: number) => void) | null,
  onZoom: null as ((d: number) => void) | null,
};

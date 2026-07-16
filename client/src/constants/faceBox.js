// Face-box coordinate contract (Gate Scanner + V-Patrol).
//
// FastAPI returns exactly `box = [x, y, width, height]` in pixels of the
// CAPTURED frame (the hidden canvas the snapshot was drawn onto). There is no
// other format — the frontend maps it directly and never guesses corner
// orderings.
//
// The preview element (`.video-feed`) renders the camera with
// `object-fit: contain`, so the frame is letterboxed inside the container.
// These helpers clamp the box to the frame and project it into container
// pixel coordinates, accounting for the contain (or cover) scaling + offsets
// so the overlay lines up with the face on screen.

/** Clamp [x, y, width, height] so the box never leaves the frame bounds. */
export function clampBoxToFrame(box, frameWidth, frameHeight) {
  const [rawX, rawY, rawW, rawH] = box.map(Number);
  const x = Math.min(Math.max(rawX || 0, 0), frameWidth);
  const y = Math.min(Math.max(rawY || 0, 0), frameHeight);
  const width = Math.min(Math.max(rawW || 0, 0), frameWidth - x);
  const height = Math.min(Math.max(rawH || 0, 0), frameHeight - y);
  return { x, y, width, height };
}

/**
 * Project a frame-space box into container pixel coordinates for an element
 * displayed with object-fit. `fit` is 'contain' (letterboxed, default) or
 * 'cover' (cropped). Returns null when either rect has no size yet.
 */
export function mapBoxToContainer(box, frame, container, fit = 'contain') {
  if (!frame?.width || !frame?.height || !container?.width || !container?.height) return null;
  const { x, y, width, height } = clampBoxToFrame(box, frame.width, frame.height);

  const scale = fit === 'cover'
    ? Math.max(container.width / frame.width, container.height / frame.height)
    : Math.min(container.width / frame.width, container.height / frame.height);
  const offsetX = (container.width - frame.width * scale) / 2;
  const offsetY = (container.height - frame.height * scale) / 2;

  return {
    left: offsetX + x * scale,
    top: offsetY + y * scale,
    width: width * scale,
    height: height * scale,
  };
}

// Box smoothing: blend the previous frame-space box with the newest tracking
// box so the overlay follows the face without jitter. 0.55/0.45 keeps latency
// low (over-smoothing would make the box visibly lag the person).
export const BOX_SMOOTHING_PREV_WEIGHT = 0.55;

/**
 * Blend two frame-space boxes ({x, y, width, height}). Returns the current box
 * unchanged when there is no previous box to smooth against.
 */
export function smoothBox(previous, current, prevWeight = BOX_SMOOTHING_PREV_WEIGHT) {
  if (!current) return null;
  if (!previous) return current;
  const currentWeight = 1 - prevWeight;
  return {
    x: previous.x * prevWeight + current.x * currentWeight,
    y: previous.y * prevWeight + current.y * currentWeight,
    width: previous.width * prevWeight + current.width * currentWeight,
    height: previous.height * prevWeight + current.height * currentWeight,
  };
}

/** Same projection, as a ready-to-spread CSS style ({left/top/width/height} px). */
export function faceBoxStyle(box, frame, container, fit = 'contain') {
  const rect = mapBoxToContainer(box, frame, container, fit);
  if (!rect) return null;
  return {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}

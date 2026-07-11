// CJS/ESM interop guard for @mui/icons-material@5 deep imports.
//
// The package ships its deep files ('@mui/icons-material/Videocam') as
// CommonJS with NO package "exports" map. Vitest and the Rollup production
// build unwrap `exports.default` automatically, but the Vite dev server can
// hand JSX the raw module object ({ __esModule: true, default: Component }),
// which crashes React with "Element type is invalid ... got: object".
//
// This resolver unwraps one or more nested `.default` wrappers while leaving
// real component types alone: plain function components, and React.memo /
// forwardRef objects (which carry a `$$typeof` tag) pass through untouched.
export function resolveIconComponent(icon) {
  let candidate = icon;
  const visited = new Set();

  while (
    candidate &&
    typeof candidate === "object" &&
    !candidate.$$typeof &&
    candidate.default &&
    !visited.has(candidate)
  ) {
    visited.add(candidate);
    candidate = candidate.default;
  }

  return candidate || null;
}

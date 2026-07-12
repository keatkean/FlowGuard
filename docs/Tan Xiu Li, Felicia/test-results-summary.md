# Felicia Test Results Summary

This file records the current verification run only. Stale historical totals have been removed.

## Latest Run

| Area | Command | Result |
|---|---|---|
| Client tests | `cd client && npm test -- --run` | Passed: 41 test files, 376 tests. |
| Production build | `cd client && npm run build` | Passed. Vite emitted the existing large chunk warning for the bundled app assets. |
| Server tests | `cd server && npx jest --runInBand --forceExit` | Passed: 23 suites, 270 tests. Jest force-exit notice shown after completion. |
| AI/Pi focused tests | `cd ai-service && python -m pytest test/test_track_endpoint.py ../raspberry-pi/test_pi_camera_stream.py -q` | Not run: local Python environment reported `No module named pytest`. |

## Notes

- Client jsdom printed existing warnings for unimplemented canvas/navigation APIs during the successful run.
- No stale totals such as 79/79, 70/70, 214/214 or 206/206 are retained here.

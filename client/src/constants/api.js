// Backend API base URL.
// - Local dev: leave VITE_API_BASE_URL unset — relative "/api" URLs go through
//   the Vite proxy to the local Node server.
// - Vercel/production: set VITE_API_BASE_URL to the deployed Node backend
//   (e.g. https://flowguard-api.onrender.com). The Vite proxy does not exist in
//   a production build, so this must be configured for deployment.
// The frontend NEVER calls the FastAPI AI service directly — all facial
// recognition traffic goes through the Node backend.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

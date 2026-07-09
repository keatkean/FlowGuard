// Server binding configuration — works locally AND on cloud hosts.
//
// Port: cloud platforms (Render, Cloud Run, Heroku) inject PORT; local dev uses
// APP_PORT from .env; 5001 is the documented local default.
// Host: 0.0.0.0 so a deployed container accepts external traffic. Binding
// exclusively to 127.0.0.1 breaks any cloud deployment; 0.0.0.0 also works for
// local development (localhost still resolves to it).

const resolvePort = (env = process.env) =>
  Number(env.PORT || env.APP_PORT || 5001);

const resolveHost = (env = process.env) => env.HOST || '0.0.0.0';

module.exports = { resolvePort, resolveHost };

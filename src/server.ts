import { createApp } from '../backend/src/server.ts';

function applyServiceEnvironment(): void {
  if (process.env.PI_WEB_PORT && !process.env.PORT) {
    process.env.PORT = process.env.PI_WEB_PORT;
  }

  if (process.env.PI_WEB_CWD && !process.env.SDK_CWD) {
    process.env.SDK_CWD = process.env.PI_WEB_CWD;
  }

  if (process.env.PI_WEB_SESSIONS_DIR && !process.env.SESSIONS_DIR) {
    process.env.SESSIONS_DIR = process.env.PI_WEB_SESSIONS_DIR;
  }

  if (process.env.PI_WEB_MODEL && !process.env.SDK_MODEL) {
    process.env.SDK_MODEL = process.env.PI_WEB_MODEL;
  }
}

applyServiceEnvironment();

const { app, config, logger } = createApp();
app.listen(config.port, () => {
  logger.info({ port: config.port }, 'pi-web backend listening');
});

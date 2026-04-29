import type { Request, Response, Router } from 'express';
import express from 'express';
import { execFile } from 'node:child_process';
import type { Config } from '../config/index.js';

function execFileAsync(file: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { env }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || error.message || 'command failed').trim()));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

export function createMaintenanceRouter(config: Config): Router {
  const router = express.Router();

  router.get('/systemd', (_req: Request, res: Response) => {
    res.json({
      restartEnabled: config.allowSystemdRestart,
      service: config.systemdServiceName,
    });
  });

  router.post('/systemd/restart', async (_req: Request, res: Response) => {
    if (!config.allowSystemdRestart) {
      res.status(403).json({ error: 'Systemd restart is disabled (set PI_WEB_ALLOW_SYSTEMD_RESTART=true)' });
      return;
    }

    try {
      const uid = typeof process.getuid === 'function' ? process.getuid() : Number(process.env.UID ?? 1000);
      const env = {
        ...process.env,
        XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR ?? `/run/user/${uid}`,
        DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS ?? `unix:path=/run/user/${uid}/bus`,
      };
      await execFileAsync('systemctl', ['--user', 'restart', config.systemdServiceName], env);
      const status = await execFileAsync('systemctl', ['--user', 'is-active', config.systemdServiceName], env);
      res.json({ ok: true, service: config.systemdServiceName, active: status.stdout.trim() });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      res.status(503).json({ error: message });
    }
  });

  return router;
}

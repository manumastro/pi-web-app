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

function buildUserBusEnv(uid: number): NodeJS.ProcessEnv {
  return {
    ...process.env,
    XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR ?? `/run/user/${uid}`,
    DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS ?? `unix:path=/run/user/${uid}/bus`,
  };
}

async function runRestart(config: Config): Promise<{ active: string }> {
  if (config.restartStrategy === 'systemd-user') {
    if (config.systemdUser && typeof process.getuid === 'function' && process.getuid() === 0) {
      const uidResult = await execFileAsync('id', ['-u', config.systemdUser], process.env);
      const targetUid = Number(uidResult.stdout.trim());
      const targetEnv = {
        ...process.env,
        XDG_RUNTIME_DIR: `/run/user/${targetUid}`,
        DBUS_SESSION_BUS_ADDRESS: `unix:path=/run/user/${targetUid}/bus`,
      };
      await execFileAsync('sudo', ['-u', config.systemdUser, 'env', `XDG_RUNTIME_DIR=${targetEnv.XDG_RUNTIME_DIR}`, `DBUS_SESSION_BUS_ADDRESS=${targetEnv.DBUS_SESSION_BUS_ADDRESS}`, 'systemctl', '--user', 'restart', config.systemdServiceName], process.env);
      const status = await execFileAsync('sudo', ['-u', config.systemdUser, 'env', `XDG_RUNTIME_DIR=${targetEnv.XDG_RUNTIME_DIR}`, `DBUS_SESSION_BUS_ADDRESS=${targetEnv.DBUS_SESSION_BUS_ADDRESS}`, 'systemctl', '--user', 'is-active', config.systemdServiceName], process.env);
      return { active: status.stdout.trim() };
    }

    const uid = typeof process.getuid === 'function' ? process.getuid() : Number(process.env.UID ?? 1000);
    const env = buildUserBusEnv(uid);
    await execFileAsync('systemctl', ['--user', 'restart', config.systemdServiceName], env);
    const status = await execFileAsync('systemctl', ['--user', 'is-active', config.systemdServiceName], env);
    return { active: status.stdout.trim() };
  }

  if (config.restartStrategy === 'systemd-system') {
    await execFileAsync('systemctl', ['restart', config.systemdServiceName], process.env);
    const status = await execFileAsync('systemctl', ['is-active', config.systemdServiceName], process.env);
    return { active: status.stdout.trim() };
  }

  if (config.restartStrategy === 'command' && config.restartCommand) {
    await execFileAsync('/bin/sh', ['-lc', config.restartCommand], process.env);
    if (config.restartStatusCommand) {
      const status = await execFileAsync('/bin/sh', ['-lc', config.restartStatusCommand], process.env);
      return { active: status.stdout.trim() || 'unknown' };
    }
    return { active: 'unknown' };
  }

  throw new Error('Restart is disabled');
}

export function createMaintenanceRouter(config: Config): Router {
  const router = express.Router();

  router.get('/systemd', (_req: Request, res: Response) => {
    res.json({
      restartEnabled: config.restartStrategy !== 'disabled',
      service: config.systemdServiceName,
      strategy: config.restartStrategy,
    });
  });

  const restartHandler = async (_req: Request, res: Response) => {
    if (config.restartStrategy === 'disabled') {
      res.status(403).json({ error: 'Restart is disabled (set PI_WEB_ALLOW_SYSTEMD_RESTART=true or PI_WEB_RESTART_COMMAND)' });
      return;
    }

    try {
      const result = await runRestart(config);
      res.json({ ok: true, service: config.systemdServiceName, active: result.active, strategy: config.restartStrategy });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      res.status(503).json({ error: message });
    }
  };

  router.post('/systemd/restart', restartHandler);
  router.post('/restart', restartHandler);

  return router;
}

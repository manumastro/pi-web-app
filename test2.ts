import { SessionManager, createAgentSession, DefaultResourceLoader, AuthStorage, ModelRegistry, SettingsManager } from "@mariozechner/pi-coding-agent";
import path from "path";

async function run() {
  const cwd = "/home/manu/pi-web-app";
  const agentDir = path.join("/home/manu", ".pi", "agent");
  const sm = SessionManager.open("/home/manu/.pi/agent/sessions/--home-manu-pi-web-app--/2026-04-12T13-41-01-080Z_5a456370-9073-4ae6-a843-0caa2c597554.jsonl");
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    authStorage: new AuthStorage(agentDir),
    modelRegistry: new ModelRegistry(agentDir),
    resourceLoader: new DefaultResourceLoader({cwd, agentDir, additionalExtensionPaths: []}),
    settingsManager: SettingsManager.create(cwd, agentDir),
    sessionManager: sm,
  });
  console.log(session.messages.slice(-2));
}
run();

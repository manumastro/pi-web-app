import { SessionManager } from "@mariozechner/pi-coding-agent";
const sm = SessionManager.create("/tmp");
sm.appendMessage({ role: "user", content: "hello" });
console.log(sm.getEntries());

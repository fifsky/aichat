import { loadConfig } from "../config";
import { cleanSession } from "../session/store";
import { expandHome } from "../config/paths";

export async function cleanCommand(): Promise<void> {
  const config = await loadConfig();
  await cleanSession(config);
  console.log(`Session cleared: ${expandHome(config.session.path)}`);
}

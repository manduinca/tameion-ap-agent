import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import dotenv from 'dotenv';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export function loadConfig(env = process.env) {
  const envFile = env.AP_ENV_FILE || path.join(ROOT, '.env');
  const local = fs.existsSync(envFile) ? dotenv.parse(fs.readFileSync(envFile)) : {};
  const merged = {...local, ...env};
  const policyPath = merged.AP_POLICY_FILE || path.join(ROOT, 'config/policy.json');
  return {
    root: ROOT, envFile, env: merged,
    dataDir: path.resolve(merged.AP_DATA_DIR || path.join(ROOT, 'data')),
    walletsFile: merged.AP_WALLETS_FILE || path.join(path.dirname(envFile), 'wallets.json'),
    policy: JSON.parse(fs.readFileSync(policyPath, 'utf8')),
    rpc: 'https://rpc.testnet.arc.io',
    model: merged.LLM_MODEL || 'muse-spark-1.3-contributor',
  };
}

export function writePrivate(file, data) {
  fs.mkdirSync(path.dirname(file), {recursive:true, mode:0o700});
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2)+'\n', {mode:0o600});
  fs.renameSync(temp, file);
}

export function requireTestnet(config) {
  if (config.policy.chainId !== 5042002 || config.policy.blockchain !== 'ARC-TESTNET') throw Error('Only Arc testnet is supported.');
  if (!config.env.CIRCLE_API_KEY?.startsWith('TEST_API_KEY:')) throw Error('A Circle TEST_API_KEY is required. Mainnet credentials are rejected.');
}

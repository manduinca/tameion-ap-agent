import "dotenv/config";
import fs from "node:fs";
import {
  initiateDeveloperControlledWalletsClient,
  registerEntitySecretCiphertext,
} from "@circle-fin/developer-controlled-wallets";

const BLOCKCHAIN = "ARC-TESTNET";
const WALLETS_FILE = "wallets.json";
const REGISTERED_MARKER = "secrets/entity-secret-registered";
const ROLES = [
  "agent-treasury",
  "owner-approver",
  "vendor-google-workspace",
  "vendor-cloudflare",
  "vendor-digitalocean",
  "vendor-meta-ads",
];

const apiKey = process.env.CIRCLE_API_KEY;
const entitySecret = process.env.CIRCLE_ENTITY_SECRET;
if (!apiKey || !entitySecret) throw new Error("CIRCLE_API_KEY / CIRCLE_ENTITY_SECRET missing in .env");

if (!fs.existsSync(REGISTERED_MARKER)) {
  const response = await registerEntitySecretCiphertext({
    apiKey,
    entitySecret,
    recoveryFileDownloadPath: "secrets",
  });
  if (response.data?.recoveryFile) {
    fs.writeFileSync("secrets/recovery_file.dat", response.data.recoveryFile, { mode: 0o600 });
  }
  fs.writeFileSync(REGISTERED_MARKER, new Date().toISOString());
  console.log("Entity secret registered; recovery file saved under secrets/");
}

const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

if (!fs.existsSync(WALLETS_FILE)) {
  const walletSet = await client.createWalletSet({ name: "Deep Skill AP Agent" });
  const walletSetId = walletSet.data.walletSet.id;
  const created = await client.createWallets({
    walletSetId,
    blockchains: [BLOCKCHAIN],
    accountType: "SCA",
    count: ROLES.length,
    metadata: ROLES.map((name) => ({ name, refId: name })),
  });
  const wallets = Object.fromEntries(
    created.data.wallets.map((wallet) => [wallet.refId || wallet.name, { id: wallet.id, address: wallet.address }]),
  );
  fs.writeFileSync(WALLETS_FILE, JSON.stringify({ blockchain: BLOCKCHAIN, walletSetId, wallets }, null, 2) + "\n");
  console.log(`Created ${created.data.wallets.length} SCA wallets on ${BLOCKCHAIN}`);
}

const { wallets } = JSON.parse(fs.readFileSync(WALLETS_FILE, "utf8"));
const treasury = wallets["agent-treasury"];
try {
  const faucet = await client.requestTestnetTokens({ address: treasury.address, blockchain: BLOCKCHAIN, usdc: true });
  console.log(`Faucet request for agent-treasury: HTTP ${faucet.status}`);
} catch (error) {
  // New accounts get 403 from the faucet API; the console faucet takes the wallet ID instead.
  console.log(`Faucet API unavailable (${error.status ?? error.message}); fund ${treasury.id} at console.circle.com/faucet`);
}

for (const [role, wallet] of Object.entries(wallets)) {
  const balances = await client.getWalletTokenBalance({ id: wallet.id });
  const usdc = balances.data.tokenBalances.find((balance) => balance.token.symbol?.startsWith("USDC"));
  console.log(`${role.padEnd(24)} ${wallet.address}  USDC ${usdc?.amount ?? "0"}`);
}

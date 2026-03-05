import { Redis } from "@upstash/redis";

export interface ForwarderConfig {
  clientId: string;
  clientSecret: string;
  webhookUrl: string;
  destination: "teams" | "slack" | "whatsapp" | "generic";
  enabled: boolean;
  createdAt: string;
  lastPoll?: string;
  lastAlertId?: string;
  whatsappToken?: string;
  recipientPhone?: string;
}

function getRedis(): Redis | null {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

const CONFIG_PREFIX = "forwarder:config:";
const INDEX_KEY = "forwarder:configs";

function configKey(id: string) {
  return `${CONFIG_PREFIX}${id}`;
}

export async function saveConfig(
  id: string,
  config: ForwarderConfig
): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error("Redis not configured (set KV_REST_API_URL and KV_REST_API_TOKEN)");

  await redis.set(configKey(id), JSON.stringify(config));
  await redis.sadd(INDEX_KEY, id);
}

export async function getConfig(id: string): Promise<ForwarderConfig | null> {
  const redis = getRedis();
  if (!redis) return null;

  const raw = await redis.get<string>(configKey(id));
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : (raw as unknown as ForwarderConfig);
}

export async function getAllConfigIds(): Promise<string[]> {
  const redis = getRedis();
  if (!redis) return [];

  return await redis.smembers(INDEX_KEY);
}

export async function deleteConfig(id: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  await redis.del(configKey(id));
  await redis.srem(INDEX_KEY, id);
}

export async function updateLastPoll(
  id: string,
  lastPoll: string,
  lastAlertId?: string
): Promise<void> {
  const config = await getConfig(id);
  if (!config) return;

  config.lastPoll = lastPoll;
  if (lastAlertId) config.lastAlertId = lastAlertId;

  const redis = getRedis();
  if (redis) await redis.set(configKey(id), JSON.stringify(config));
}

export function isRedisConfigured(): boolean {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return !!(url && token);
}

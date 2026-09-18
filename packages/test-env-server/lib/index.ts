import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

function getDataDir() {
  return resolve(tmpdir(), `keybr-tests-${randomBytes(6).toString("hex")}`);
}

function getPublicDir() {
  return resolve(import.meta.dirname, "..", "..", "..", "root", "public");
}

// Tests must never inherit or mutate a user's configured profile.
const dataDir = getDataDir();
process.env.DATA_DIR = dataDir;
process.env.PUBLIC_DIR = getPublicDir();
process.env.APP_URL = "https://www.keybr.com/";
process.env.SERVER_HOST = "127.0.0.1";
process.env.SERVER_PORT = "3000";
process.env.SERVER_PORT_WS = "3001";
process.env.DATABASE_CLIENT = "sqlite";
process.env.DATABASE_FILENAME = join(dataDir, "database.sqlite");
process.env.KNEX_DEBUG = "";

process.env.COOKIE_DOMAIN = "";
process.env.COOKIE_PATH = "/";
process.env.COOKIE_SECURE = "false";

process.env.AUTH_GOOGLE_CLIENT_ID = "id";
process.env.AUTH_GOOGLE_CLIENT_SECRET = "secret";

process.env.AUTH_FACEBOOK_CLIENT_ID = "id";
process.env.AUTH_FACEBOOK_CLIENT_SECRET = "secret";

process.env.PADDLE_API_KEY = "apiKey";
process.env.PADDLE_SECRET_KEY = "secretKey";

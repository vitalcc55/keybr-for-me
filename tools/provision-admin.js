/* eslint-disable n/no-extraneous-import */

import { existsSync, lstatSync, readSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { Container } from "@fastr/invert";
import { ConfigModule, Env } from "@keybr/config";
import { createSchema, User, UserLoginRequest } from "@keybr/database";
import Knex from "knex";

const email = "admin@localhost";
const displayName = "admin";

Env.probeFilesSync();
const localConfiguration = assertLocalConfiguration();
const checkOnly = process.argv.includes("--check");
if (checkOnly) {
  console.log(JSON.stringify(localConfiguration));
  process.exit(0);
}
const accessToken = readLoginToken();
const container = new Container();
container.load(new ConfigModule());
const knex = container.get(Knex);

try {
  await createSchema(knex);

  const nameOwner = await User.query().findOne({ name: displayName });
  if (nameOwner != null && nameOwner.email !== email) {
    throw new Error(
      `User name '${displayName}' is already used by another account.`,
    );
  }

  const tokenOwner = await UserLoginRequest.findByAccessToken(accessToken);
  if (tokenOwner != null && tokenOwner.email !== email) {
    throw new Error(
      "The local admin login token is already used by another account.",
    );
  }

  const user = await User.login(email);
  if (user.name !== displayName) {
    throw new Error(
      `Expected account name '${displayName}', got '${user.name}'.`,
    );
  }

  const request = await UserLoginRequest.findByEmail(email);
  if (request == null) {
    await UserLoginRequest.query().insert({
      email,
      accessToken,
    });
  } else {
    await request.$query().patch({
      accessToken,
      createdAt: new Date(),
    });
  }

  const currentUser = await User.findByEmail(email);
  if (currentUser == null) {
    throw new Error(`Account '${email}' was not found after creation.`);
  }

  if (currentUser.order == null) {
    await currentUser.$relatedQuery("order").insert({
      provider: "manual",
      id: email,
      createdAt: new Date(),
      name: currentUser.name ?? null,
      email: currentUser.email ?? null,
    });
  }

  console.log(
    JSON.stringify({
      id: currentUser.id,
      email,
      name: currentUser.name,
      premium: true,
      dataDir: localConfiguration.dataDir,
      databaseFilename: localConfiguration.databaseFilename,
    }),
  );
} finally {
  await knex.destroy();
}

function assertLocalConfiguration() {
  const databaseClient = Env.getString("DATABASE_CLIENT", "mysql");
  if (databaseClient !== "sqlite") {
    throw new Error(
      "Local provisioning requires DATABASE_CLIENT=sqlite; refusing a remote database.",
    );
  }

  const databaseFilename = Env.getString("DATABASE_FILENAME", ":memory:");
  if (databaseFilename === ":memory:") {
    throw new Error(
      "Local provisioning requires a file-backed DATABASE_FILENAME.",
    );
  }
  const databasePath = Env.asPath(databaseFilename);
  const dataDir = Env.getPath("DATA_DIR", "/var/lib/keybr");
  const publicDir = Env.getPath("PUBLIC_DIR", "/opt/keybr/public");
  assertLocalPath(databasePath, "DATABASE_FILENAME");
  assertLocalPath(dataDir, "DATA_DIR");
  assertLocalPath(publicDir, "PUBLIC_DIR");
  const homeRelativeDataDir = relative(homedir(), dataDir);
  if (isAbsolute(homeRelativeDataDir) || homeRelativeDataDir.startsWith("..")) {
    throw new Error(
      "Local provisioning requires DATA_DIR inside the current user profile.",
    );
  }
  const repositoryRoot = resolve(process.cwd());
  const repositoryRelativeDataDir = relative(repositoryRoot, dataDir);
  if (
    !isAbsolute(repositoryRelativeDataDir) &&
    !repositoryRelativeDataDir.startsWith("..")
  ) {
    throw new Error(
      "Local provisioning must not use a DATA_DIR inside the checkout.",
    );
  }
  if (resolve(publicDir) !== resolve(join(process.cwd(), "root", "public"))) {
    throw new Error(
      "Local provisioning requires the checked-out root/public directory.",
    );
  }
  const relativeDatabasePath = relative(dataDir, databasePath);
  if (
    isAbsolute(relativeDatabasePath) ||
    relativeDatabasePath === "" ||
    relativeDatabasePath.startsWith("..")
  ) {
    throw new Error(
      "DATABASE_FILENAME must point inside the configured local DATA_DIR.",
    );
  }

  const appUrl = new URL(Env.getString("APP_URL", "https://www.keybr.com/"));
  if (
    appUrl.protocol !== "http:" ||
    appUrl.origin !== "http://localhost:3000" ||
    appUrl.pathname !== "/"
  ) {
    throw new Error(
      "Local provisioning requires APP_URL=http://localhost:3000/.",
    );
  }

  const cookieDomain = Env.getString("COOKIE_DOMAIN", "");
  if (cookieDomain !== "localhost") {
    throw new Error(
      "Local provisioning requires COOKIE_DOMAIN=localhost for the canonical origin.",
    );
  }
  if (Env.getBoolean("COOKIE_SECURE", true)) {
    throw new Error(
      "Local provisioning requires COOKIE_SECURE=false for http://localhost.",
    );
  }

  const serverHost = Env.getString("SERVER_HOST", "127.0.0.1");
  if (serverHost !== "127.0.0.1") {
    throw new Error("Local provisioning requires SERVER_HOST=127.0.0.1.");
  }
  if (Env.getPort("SERVER_PORT", 3000) !== 3000) {
    throw new Error("Local provisioning requires SERVER_PORT=3000.");
  }
  if (Env.getPort("SERVER_PORT_WS", 3001) !== 3001) {
    throw new Error("Local provisioning requires SERVER_PORT_WS=3001.");
  }

  return { dataDir, databaseFilename: databasePath };
}

function readLoginToken() {
  const chunks = [];
  const buffer = Buffer.alloc(256);
  let size = 0;
  while (true) {
    const count = readSync(0, buffer, 0, buffer.length, null);
    if (count === 0) {
      break;
    }
    size += count;
    if (size > 128) {
      throw new Error("Local provisioning token input is too large.");
    }
    chunks.push(Buffer.from(buffer.subarray(0, count)));
  }
  const token = Buffer.concat(chunks).toString("utf8").trim();
  if (!/^[A-Za-z0-9_-]{32,}$/.test(token)) {
    throw new Error(
      "Local provisioning requires a CSPRNG login token on stdin.",
    );
  }
  return token;
}

function assertLocalPath(path, name) {
  if (path.startsWith("\\\\") || path.startsWith("//")) {
    throw new Error(`${name} must not use a UNC/network path.`);
  }
  let current = resolve(path);
  while (true) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      throw new Error(`${name} must not traverse a symbolic link or junction.`);
    }
    const parent = resolve(join(current, ".."));
    if (parent === current) {
      break;
    }
    current = parent;
  }
}

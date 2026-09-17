/* eslint-disable n/no-extraneous-import */

import { Container } from "@fastr/invert";
import { ConfigModule, Env } from "@keybr/config";
import { createSchema, User, UserLoginRequest } from "@keybr/database";
import Knex from "knex";

const email = "admin@localhost";
const displayName = "admin";
const accessToken = "admin";

Env.probeFilesSync();
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
    }),
  );
} finally {
  await knex.destroy();
}

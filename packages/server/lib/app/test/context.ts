import { readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, beforeEach } from "node:test";
import { Container } from "@fastr/invert";
import { ConfigModule } from "@keybr/config";
import { useDatabase } from "@keybr/database/lib/testing.ts";
import { ServerModule } from "../../server/module.ts";
import { Mailer } from "../mail/index.ts";
import { ApplicationModule } from "../module.ts";
import { FakeMailer } from "./mail.ts";

export class TestContext extends Container {
  readonly mailer = new FakeMailer();

  constructor() {
    super();
    this.load(new ConfigModule());
    this.load(new ApplicationModule());
    this.load(new ServerModule());
    this.bind(Mailer).toValue(this.mailer); // Re-bind the mailer object.
    useDatabase();
    beforeEach(async () => {
      await clearTestFiles(this.get("dataDir"));
    });
    afterEach(async () => {
      await clearTestFiles(this.get("dataDir"));
    });
  }
}

async function clearTestFiles(dataDir: string): Promise<void> {
  const databaseFilename = process.env.DATABASE_FILENAME;
  const preserved = new Set(
    databaseFilename == null
      ? []
      : [
          resolve(databaseFilename),
          `${resolve(databaseFilename)}-wal`,
          `${resolve(databaseFilename)}-shm`,
        ],
  );
  for (const name of await readdir(dataDir)) {
    const path = resolve(dataDir, name);
    if (!preserved.has(path)) {
      await rm(path, { force: true, recursive: true });
    }
  }
}

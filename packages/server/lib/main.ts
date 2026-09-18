import cluster, { type ClusterSettings } from "node:cluster";
import { Application } from "@fastr/core";
import { Container } from "@fastr/invert";
import { Manifest } from "@keybr/assets";
import { ConfigModule, Env } from "@keybr/config";
import { Logger } from "@keybr/logger";
import { Game } from "@keybr/multiplayer-server";
import { ApplicationModule, kGame, kMain } from "./app/index.ts";
import { ServerModule } from "./server/module.ts";
import { Service } from "./server/service.ts";

// Allow Node to bind to port 80 and 443 without sudo:
// sudo setcap cap_net_bind_service=+ep $(which node)

let isShuttingDown = false;

initErrorHandlers();
if (cluster.isPrimary) {
  process.once("SIGINT", () => {
    shutdown();
  });
  process.once("SIGTERM", () => {
    shutdown();
  });

  Env.probeFilesSync();
  const container = makeContainer();
  Logger.info("Configuration", {
    dataDir: container.get("dataDir"),
    publicDir: container.get("publicDir"),
    canonicalUrl: container.get("canonicalUrl"),
  });
  process.title = "keybr master process";
  fork({ args: ["http"] });
  fork({ args: ["http"] });
  fork({ args: ["http"] });
  fork({ args: ["http"] });
  fork({ args: ["ws"] });
} else {
  const container = makeContainer();
  const service = container.get(Service);
  switch (process.argv[2]) {
    case "http":
      process.title = "keybr server worker process";
      service.start({
        app: container.get(Application, kMain),
        host: Env.getString("SERVER_HOST", ""),
        port: Env.getPort("SERVER_PORT", 3000),
      });
      break;
    case "ws":
      process.title = "keybr game server worker process";
      service.start({
        app: container.get(Application, kGame),
        host: Env.getString("SERVER_HOST", ""),
        port: Env.getPort("SERVER_PORT_WS", 3001),
      });
      container.get(Game).start();
      break;
  }
}

function makeContainer() {
  const container = new Container();
  container.load(new ConfigModule());
  container.load(new ApplicationModule());
  container.load(new ServerModule());
  container.get(Manifest); // Sanity check.
  return container;
}

function fork(settings: ClusterSettings) {
  cluster.setupPrimary(settings);
  const worker = cluster.fork({});
  worker.on("online", () => {
    Logger.info("Worker started", { pid: worker.process.pid });
  });
  worker.on("exit", (code, signal) => {
    if (cluster.isPrimary && isShuttingDown) {
      return;
    }
    Logger.info("Worker died, starting a new worker", {
      pid: worker.process.pid,
      code,
      signal,
    });
    fork(settings); // Restart failed worker.
  });
}

function shutdown() {
  if (!cluster.isPrimary || isShuttingDown) {
    return;
  }
  isShuttingDown = true;
  Logger.info("Stopping master process", { pid: process.pid });

  let finished = false;
  const finish = (exitCode: number) => {
    if (!finished) {
      finished = true;
      process.exit(exitCode);
    }
  };

  for (const worker of Object.values(cluster.workers ?? {})) {
    if (worker != null && worker.isConnected()) {
      worker.process.kill("SIGTERM");
    }
  }

  cluster.disconnect(() => {
    finish(0);
  });

  setTimeout(() => {
    for (const worker of Object.values(cluster.workers ?? {})) {
      if (worker != null) {
        worker.process.kill("SIGKILL");
      }
    }
    finish(0);
  }, 5000).unref();
}

function initErrorHandlers() {
  process.on("warning", (warning) => {
    Logger.warn("Warning", warning);
  });
  process.on("multipleResolves", (type, promise, reason) => {
    Logger.error("Multiple resolvers", { type, promise, reason });
    process.exit(1);
  });
  process.on("uncaughtException", (error) => {
    Logger.error("Uncaught exception", error);
    process.exit(1);
  });
  process.on("unhandledRejection", (reason) => {
    Logger.error("Unhandled rejection", reason);
    process.exit(1);
  });
}

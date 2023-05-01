/*
iipzy-sentinel-admin.
*/
const express = require("express");
const app = express();
const http_ = require("http");
const fs = require("fs");

const Defs = require("iipzy-shared/src/defs");
const { log, logInit, setLogLevel } = require("iipzy-shared/src/utils/logFile");
const logPath = "/var/log/iipzy";
logInit(logPath, "iipzy-sentinel-admin");
const http = require("iipzy-shared/src/services/httpService");
const { ConfigFile } = require("iipzy-shared/src/utils/configFile");
const { processErrorHandler, sleep } = require("iipzy-shared/src/utils/utils");

const { adminInit } = require("./backgroundServices/admin");
const { adminHeartbeatInit } = require("./backgroundServices/adminHeartbeat");

require("./startup/routes")(app);

const userDataPath = "/etc/iipzy";
let configFile = null;

let logLevel = undefined;

let server = null;

let createServerTries = 6;
function createServer() {
  log("createServer", "strt", "info");
  const port = Defs.port_sentinel_admin;
  server = http_
    .createServer(app)
    .listen(port, () => {
      log(`Listening on port ${port}...`, "main", "info");
    })
    .on("error", async err => {
      log("(Exception) createServer: code = " + err.code, "strt", "info");
      if (err.code === "EADDRINUSE") {
        // port is currently in use
        createServerTries--;
        if (createServerTries === 0) {
          log(
            "main: too many createServer failures. Exiting in 5 seconds",
            "strt",
            "info"
          );
          await sleep(5 * 1000);
          process.exit(0);
        }
        // try again in 5 seconds.
        await sleep(5 * 1000);
        createServer();
      }
    });
}

async function main() {
  configFile = new ConfigFile(userDataPath, Defs.configFilename);
  await configFile.init();

  logLevel = configFile.get("logLevel");
  if (logLevel) setLogLevel(logLevel);

  // wait forever to get a client token.
  while (true) {
    const clientToken = configFile.get("clientToken");
    if (clientToken) {
      http.setClientTokenHeader(clientToken);
      break;
    }
    await sleep(1000);
  }

  http.setBaseURL(configFile.get("serverAddress") + ":" + Defs.port_server);

  configFile.watch(configWatchCallback);

  await adminInit(configFile);
  await adminHeartbeatInit(configFile);

  createServer();
}

processErrorHandler();

main();

function configWatchCallback() {
  log("configWatchCallback", "main", "info");

  // handle log level change.
  const logLevel_ = configFile.get("logLevel");
  if (logLevel_ !== logLevel) {
    log(
      "configWatchCallback: logLevel change: old = " +
        logLevel +
        ", new = " +
        logLevel_,
      "main",
      "info"
    );
  }
  if (logLevel_) {
    // tell log.
    logLevel = logLevel_;
    setLogLevel(logLevel);
  }
}

// process.on("uncaughtException", function(err) {
//   log("(Exception) uncaught exception: " + err, "strt", "error");
//   log("stopping in 2 seconds", "strt", "info");
//   setTimeout(() => {
//     process.exit(1);
//   }, 2 * 1000);
// });

module.exports = server;

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

let serverAddress = undefined;
let clientToken = undefined;
let logLevel = undefined;

let server = null;

let createServerTries = 6;
function createServer() {
  log("createServer", "strt", "info");
  const port = 8004;
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

  serverAddress = configFile.get("serverAddress");
  http.setBaseURL(serverAddress);

  clientToken = configFile.get("clientToken");

  logLevel = configFile.get("logLevel");
  if (logLevel) setLogLevel(logLevel);
  else configFile.set("logLevel", "info");

  configFile.watch(configWatchCallback);

  await adminInit(configFile);
  await adminHeartbeatInit(configFile);

  createServer();
}

processErrorHandler();

main();

function configWatchCallback() {
  log("configWatchCallback", "main", "info");

  // handle server address change.
  const serverAddress_ = configFile.get("serverAddress");
  if (serverAddress_ !== serverAddress) {
    log(
      "configWatchCallback: serverAddress change: old = " +
        serverAddress +
        ", new = " +
        serverAddress_,
      "main",
      "info"
    );

    if (serverAddress_) {
      serverAddress = serverAddress_;
      http.setBaseURL(serverAddress);
    }
  }

  clientToken_ = configFile.get("clientToken");
  if (clientToken_ !== clientToken) {
    log(
      "configWatchCallback: clientToken change: old = " +
        clientToken +
        ", new = " +
        clientToken_,
      "main",
      "info"
    );

    if (clientToken_) {
      clientToken = clientToken_;
      http.setClientTokenHeader(clientToken);
    }
  }

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

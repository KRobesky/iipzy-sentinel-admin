const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const { ConfigFile } = require("iipzy-shared/src/utils/configFile");
const Defs = require("iipzy-shared/src/defs");
const {
  fileExistsAsync,
  fileReadAsync
} = require("iipzy-shared/src/utils/fileIO");
const http = require("iipzy-shared/src/services/httpService");
const { log } = require("iipzy-shared/src/utils/logFile");
const { sleep } = require("iipzy-shared/src/utils/utils");
const { spawnAsync } = require("iipzy-shared/src/utils/spawnAsync");

const { sendLogFiles, sendPingPlotRrdb } = require("../utils/sendLogFiles");

let configFile = null;
let exec = null;
let execTimeout = null;
let execError = "";
let adminStatus = { inProgress: false, step: "done", failed: false };

async function adminInit(configFile_) {
  log(">>>adminInit", "admn", "info");
  configFile = configFile_;
  log("<<<adminInit", "admn", "info");
}

// function doExecHelper(command, params, options, timeoutMins, callback) {
//   // ip -j -4  addr show dev eth0
//   log(
//     "exec: command = " +
//       command +
//       ", params = " +
//       JSON.stringify(params) +
//       ", options = " +
//       JSON.stringify(options),
//     "admn",
//     "info"
//   );

//   execError = "";

//   exec = spawn(command, params, options);
//   if (!exec) {
//     execError = "spawn failed";
//     return callback(1);
//   }

//   execTimeout = setTimeout(() => {
//     if (exec) {
//       log("(Error) exec timeout", "admn", "info");
//       execError = "operation cancelled after " + timeoutMins + " minutes";
//       exec.kill(9);
//     }
//   }, timeoutMins * 60 * 1000);

//   exec.stdout.on("data", data => {
//     const str = data.toString();
//     log("stdout: " + str, "admn", "info");
//   });

//   exec.stderr.on("data", data => {
//     const str = data.toString();
//     log("stderr: " + str, "admn", "info");
//     execError = str;
//   });

//   exec.on("exit", code => {
//     log(`${command} exited with code ${code}`, "admn", "info");
//     exec = null;
//     clearTimeout(execTimeout);
//     execTimeout = null;
//     callback(code);
//   });
// }

// // returns true if success, false if not.
// function doExec(command, params, options, timeoutMins) {
//   return new Promise((resolve, reject) => {
//     doExecHelper(command, params, options, timeoutMins, code => {
//       resolve(code !== undefined && code !== null && code === 0);
//     });
//   });
// }

// entry point
function admin(adminParams) {
  log("admin - admin: " + JSON.stringify(adminParams, null, 2), "admn", "info");

  if (adminStatus.step !== "done" && !adminStatus.failed)
    return { status: Defs.statusAdminInProgress };

  adminStatus = {
    inProgress: true,
    step: "starting",
    startTimestamp: new Date().toLocaleString(),
    timestamp: new Date().toLocaleString(),
    action: adminParams.action,
    actionUuid: adminParams.actionUuid,
    target: "",
    failed: false
  };

  sendAdminStatus();

  switch (adminParams.action) {
    case Defs.adminCmd_sentinel_reboot: {
      doReboot();
      break;
    }
    case Defs.adminCmd_sentinel_resetNetworkDevicesDatabase: {
      doNothing();
      break;
    }
    case Defs.adminCmd_sentinel_restartSentinel: {
      doRestartSentinel();
      break;
    }
    case Defs.adminCmd_sentinel_restartSentinelAdmin: {
      doRestartSentinelAdmin();
      break;
    }
    case Defs.adminCmd_sentinel_restartSentinelWeb: {
      doRestartSentinelWeb();
      break;
    }
    case Defs.adminCmd_sentinel_restartUpdater: {
      doRestartUpdater();
      break;
    }
    case Defs.adminCmd_sentinel_sendLogs: {
      doSendLogs();
      break;
    }
    case Defs.adminCmd_sentinel_setLogLevelDetailed: {
      doSetLogLevel(true);
      break;
    }
    case Defs.adminCmd_sentinel_setLogLevelNormal: {
      doSetLogLevel(false);
      break;
    }
    default: {
      doNothing();
      break;
    }
  }

  return { status: Defs.statusOk };
}

async function doNothing() {
  await sleep(1000);
  setAdminStatus("done");
}

async function doReboot() {
  setAdminStatus("rebooting in 5 seconds");
  setTimeout(() => {
    spawn("sudo", ["reboot"]);
  }, 7 * 1000);
  await sleep(5 * 1000);
  setAdminStatus("done");
}

async function doRestartSentinel() {
  setAdminStatus("restarting sentinel");
  await sleep(5 * 1000);
  await restartService("iipzy-service", "iipzy-pi");
  setAdminStatus("done");
}

async function doRestartSentinelAdmin() {
  setAdminStatus("restarting sentinel admin");
  setTimeout(() => {
    process.exit(99);
  }, 7 * 1000);
  await sleep(5 * 1000);
  setAdminStatus("done");
}

async function doRestartSentinelWeb() {
  setAdminStatus("restarting sentinel web");
  await sleep(5 * 1000);
  await restartService("iipzy-sentinel-web", "iipzy-sentinel-web");
  setAdminStatus("done");
}

async function doRestartUpdater() {
  setAdminStatus("restarting updater");
  await sleep(5 * 1000);
  await restartService("iipzy-updater", "iipzy-updater");
  setAdminStatus("done");
}

async function doSendLogs() {
  sendLogsAsync()
    .then(() => {
      setAdminStatus("done");
    })
    .catch(() => {
      setAdminStatus("failed");
    });
}

async function doSetLogLevel(logLevelDetailed) {
  let step = "setting log level to ";
  if (logLevelDetailed) step += "verbose";
  else step += "info";
  setAdminStatus(step);
  await sleep(5 * 1000);
  await configFile.set("logLevel", logLevelDetailed ? "verbose" : "info");
  setAdminStatus("done");
}

async function restartService(serviceDirectory, serviceName) {
  log(
    "restartService: serviceDirectory = " +
      serviceDirectory +
      ", serviceName = " +
      serviceName,
    "main",
    "info"
  );
  const { stdout } = await spawnAsync("ps", ["-Af"]);
  const lines = stdout.split("\n");
  let iipzyService = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.indexOf(serviceDirectory) != -1) {
      iipzyService = line;
      break;
    }
  }
  if (iipzyService) {
    const postFix =
      iipzyService.indexOf(serviceDirectory + "-a") != -1 ? "a" : "b";
    log("restartService: postFix = " + postFix, "info");
    await spawnAsync("sudo", [
      "systemctl",
      "restart",
      serviceName + "-" + postFix
    ]);
  }
}

function sendLogsAsync() {
  return new Promise(async (resolve, reject) => {
    setAdminStatus("sending Sentinel logs");
    await sendLogFiles("appliance", "iipzy-pi");
    setAdminStatus("sending Sentinel Admin logs");
    await sendLogFiles("admin", "iipzy-sentinel-admin");
    setAdminStatus("sending Updater logs");
    await sendLogFiles("updater", "iipzy-updater");
    setAdminStatus("sending pingplot.rrdb");
    await sendPingPlotRrdb();
    resolve();
  });
}

async function sendAdminStatus() {
  log("sendAdminStatus: " + adminStatus.step, "admn", "info");
  const { data, status } = await http.post("/sentineladmin/status", {
    data: {
      adminStatus
    }
  });
}

async function setAdminStatus(step) {
  adminStatus.step = step;
  adminStatus.timestamp = new Date().toLocaleString();
  if (step === "done") adminStatus.inProgress = false;
  await sendAdminStatus();
}

function getAdminStatus() {
  return adminStatus;
}

module.exports = { admin, adminInit, getAdminStatus };

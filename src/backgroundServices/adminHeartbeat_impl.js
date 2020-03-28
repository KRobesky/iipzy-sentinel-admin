const Defs = require("iipzy-shared/src/defs");
const http = require("iipzy-shared/src/services/httpService");
const { log } = require("iipzy-shared/src/utils/logFile");
const { sleep } = require("iipzy-shared/src/utils/utils");

const { admin, getAdminStatus } = require("./admin");

let configFile = null;
let clientToken = null;

async function adminHeartbeatInit(configFile_) {
  log("adminHeartbeatInit", "htbt", "info");

  configFile = configFile_;

  setTimeout(async () => {
    adminHeartbeat();
  }, 20 * 1000);

  await adminHeartbeat_helper();
}

async function adminHeartbeat() {
  while (true) {
    const res = await adminHeartbeat_helper();
    log("after calling adminHeartbeat_helper: res = " + res, "htbt", "info");
    if (!res) await sleep(20 * 1000);
  }
}

async function adminHeartbeat_helper() {
  log("adminHeartbeat", "htbt", "info");

  if (!clientToken) {
    clientToken = configFile.get("clientToken");
    if (clientToken) http.setClientTokenHeader(clientToken);
    // no client token yet.
    else return false;
  }

  log("adminHeartbeat: sending heartbeat", "htbt", "info");
  const { data: adminResponse, status: statusResponse } = await http.post(
    "/sentineladmin/heartbeat",
    {
      data: {
        adminStatus: getAdminStatus()
      }
    }
  );
  log(
    "adminHeartbeat: AFTER sending heartbeat: status = " + statusResponse,
    "htbt",
    "info"
  );

  if (adminResponse && adminResponse.starting) {
    log(
      "/sentineladmin/heartbeat: response = " +
        JSON.stringify(adminResponse.params, null, 2),
      "htbt",
      "info"
    );
    await admin(adminResponse.params);
  }

  return statusResponse === Defs.httpStatusOk;
}

module.exports = { adminHeartbeatInit };

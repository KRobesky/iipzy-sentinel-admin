const express = require("express");
const router = express.Router();

const Defs = require("iipzy-shared/src/defs");
const { log, timestampToString } = require("iipzy-shared/src/utils/logFile");

const { getAdminStatus } = require("../backgroundServices/admin");

router.get("/", async (req, res) => {
  log(
    "GET - admin: timestamp = " + timestampToString(req.header("x-timestamp")),
    "rout",
    "info"
  );

  const data = {
    adminStatus: getAdminStatus()
  };

  log("GET admin: response = " + JSON.stringify(data, null, 2), "rout", "info");

  res.status(Defs.httpStatusOk).send(data);
});

module.exports = router;

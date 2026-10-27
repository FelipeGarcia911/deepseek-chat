import { execFileSync } from "node:child_process";
import path from "node:path";
import { test } from "vitest";

test("should import application modules without listening, reading storage, creating directories or loading dotenv", () => {
  execFileSync(
    process.execPath,
    [
      "-r",
      "ts-node/register",
      "-e",
      `
    const assert = require('node:assert/strict');
    require('node:net').Server.prototype.listen = () => { throw new Error('Unexpected listener'); };
    require('node:fs/promises').readFile = () => { throw new Error('Unexpected storage read'); };
    require('node:fs/promises').mkdir = () => { throw new Error('Unexpected directory creation'); };
    require('dotenv').config = () => { throw new Error('Unexpected environment loading'); };
    for (const name of ['app', 'composition', 'server', 'config', 'controllers/ConversationController', 'services/ConversationService', 'controllers/HealthController', 'services/HealthService', 'routes/HealthRoutes', 'db/cli']) require('./src/' + name);
    assert.equal(typeof require('./src/app').createApp, 'function');
  `,
    ],
    { cwd: path.join(__dirname, ".."), timeout: 10_000 }
  );
});

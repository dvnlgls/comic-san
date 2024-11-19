// worker.js
const { workerData, parentPort } = require('worker_threads')
const { execSync } = require('child_process');

// take parameters from main/parent thread
const commands = workerData.cmd;
// const workerId = workerData.workerId;

for (let i = 0; i < commands.length; i++) {
  execSync(commands[i], { stdio: [] });
  parentPort.postMessage('');
  // parentPort.postMessage(`Worker ${workerId} processed ${files[i]}`);
}

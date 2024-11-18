// worker.js
const { workerData, parentPort } = require('worker_threads')
const { execSync } = require('child_process');

// take parameters from main/parent thread
const files = workerData.files;
// const workerId = workerData.workerId;
const dirExtractedPages = workerData.dirExtractedPages;
const dirPanels = workerData.dirPanels;
const kumikoPath = workerData.kumikoPath;

for (let i = 0; i < files.length; i++) {
  execSync('source  ' + kumikoPath + 'bin/activate && ' + kumikoPath + './kumiko -i ' + dirExtractedPages + files[i] + ' -s ' + dirPanels, { stdio: [] });
  parentPort.postMessage('');
  // parentPort.postMessage(`Worker ${workerId} processed ${files[i]}`);
}

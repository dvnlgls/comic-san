/*------------------------------------------------------------------------
COMIC-SAN

Comic-san is a Mac (possibly Linux too) software to create e-books from comic books, that are
suitable for (small) e-book readers, including black & white variants.

------------------------------------------------------------------------*/

const fs = require('fs');
const { execSync } = require('child_process');
const readline = require('readline/promises');
const { Worker } = require('worker_threads');
const os = require('os');
const cliProgress = require('cli-progress');

//------------------------------------------------------------------------
// NOTE: The following must be set properly

// absolute path to your program directory WITH the trailing slash eg: /Users/Frodo/Documents/comic-san/
const programDir = '/Users/devin/Documents/projects/comic-san/';
const kumikoPath = '/Users/devin/Documents/projects/kumiko/';

// change these:
const originalPageWidth = 3000; // width of a single page of the original comic book (in px).
const bwPanelResizeWidth = 1448; // width of the black & white panels apropriate for your target device
const bwPanelResizeHeight = 1072; // height of the black & white panels apropriate for your target device

//------------------------------------------------------------------------

const dirData = programDir + 'data/';
const spacerImage = programDir + 'space.jpg'; // image used to add gap between panels. modify it however you like
const dirExtractedPages = dirData + 'extracted_pages/'; // dir to store pages extracted from the original book
const dirPanels = dirData + 'panels/'; // dir to store the color panels extracted from the pages
const dirStitchedColor = dirData + 'stitched_color/'; // dir to store the stitched color panels
const dirStitchedBw = dirData + 'stitched_bw/'; // dir to store the stitched b/w panels
const dirAssets = dirData + 'assets/'; // // dir to store the newly created books and any other useful stuff like panels etc

let bookName = '';

// flags:
// -log: enable verbose logging
// -cpage: enable manual cleanup of extracted pages
// -zipPanels: enable zipping of extracted panels
// -cleanup: cleanup unwanted files after a successful run
// -skipgrey: skip conversion to grey scale
const args = { log: false, cpage: false, zipPanels: false, cleanup: false, skipgrey: false, help: false };

const imageStitchingProgressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

main();

//------------------------------------------------------------------------

async function main() {

  // order of functions is critical.
  getArguments(); // primitive method to get args passed on the cmd line
  if(args.help) {
    printHelp();
    return;
  }

  let elapsedTime = performance.now();
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  init();
  findBookName(); // must be run before zipping panels to give the archive a name
  unzip(); // cbz is just an archive. unzip to get the individual pages

  elapsedTime = performance.now() - elapsedTime;
  if (args.cpage) {
    console.log('=======> Pages have been extracted. Please check the extracted_pages directory and remove/change unwanted images');
    await rl.question('\t Press any key to continue: \n');
  }
  elapsedTime = performance.now() - elapsedTime;
  
  await extractPanels();
  
  // after the panels have been extracted, it's necessary to cleanup unwanted ones and to check if they look ok
  elapsedTime = performance.now() - elapsedTime;
  console.log('\n=======> Comic panels have been extracted. Please check the panels directory and remove/change unwanted images');
  await rl.question('\t Press any key to continue: ');
  rl.close();
  elapsedTime = performance.now() - elapsedTime;

  stitchImages(); // join the panels together
  await createGreyScaleImages();
  buildColorBook();
  buildBwBook();
  zipPanels(); // might be a good idea to save the extracted panels for future use
  cleanup();

  elapsedTime = performance.now() - elapsedTime;
  printProcessingTime(elapsedTime);
  console.log('\nFind your book(s) in the assets folder. Happy reading!');
}

function extractPanels() {
  log('Status: Extracting panels from comic pages. Parallel processing is in progress...');

  const fileGroup = splitFilesBasedOnCpuCores(dirExtractedPages, 'jpg');
  const totalFiles = fileGroup.reduce((acc, curr) => acc + curr.length, 0);

  const progressBar = new cliProgress.SingleBar({
    hideCursor: true,
    stopOnComplete: true,
  }, cliProgress.Presets.shades_classic);

  progressBar.start(totalFiles, 0);

  const commands = [];

  fileGroup.forEach(files => {
    const arr = [];
    for (let i = 0; i < files.length; i++) {
      arr.push('source  ' + kumikoPath + 'bin/activate && ' + kumikoPath + './kumiko -i ' + dirExtractedPages + files[i] + ' -s ' + dirPanels);
    }
    commands.push(arr);
  });

  return executeParallel(commands, progressBar);
}

function createGreyScaleImages() {
  if (args.skipgrey) {
    return;
  }
  log('Status: Creating B/W panels from color panels. Parallel processing is in progress...');

  const resolution = bwPanelResizeWidth + 'x' + bwPanelResizeHeight;
  const fileGroup = splitFilesBasedOnCpuCores(dirStitchedColor, 'jpg');
  const totalFiles = fileGroup.reduce((acc, curr) => acc + curr.length, 0);

  const progressBar = new cliProgress.SingleBar({
    hideCursor: true,
    stopOnComplete: true,
  }, cliProgress.Presets.shades_classic);

  progressBar.start(totalFiles, 0);

  const commands = [];

  fileGroup.forEach(files => {
    const arr = [];
    for (let i = 0; i < files.length; i++) {
      arr.push('magick mogrify -path ' + dirStitchedBw + ' -resize ' + resolution + ' -intensity average -colorspace gray -strip -interlace Plane -quality 50% ' + dirStitchedColor + files[i]);
    }
    commands.push(arr);
  });

  return executeParallel(commands, progressBar);
}

async function executeParallel(commands, progressBar) {

  return new Promise(async (resolve, reject) => {
    const workerPromises = [];

    for (let i = 0; i < commands.length; i++) {
      const workerData = { cmd: commands[i], workerId: i + 1 };
      workerPromises.push(spawnWorker(workerData, progressBar));
    }

    await Promise.all(workerPromises);
    resolve();
  });
}

function spawnWorker(workerData, progressBar) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./worker.js', { workerData })

    worker.on('message', (data) => {
      progressBar.increment();
    });
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0)
        reject(new Error(`Worker stopped with exit code ${code}`))
      else
        resolve();
    });
  });
}

function splitFilesBasedOnCpuCores(path, extension) {

  const numCores = os.cpus().length;
  const files = fs.readdirSync(path).filter(file => file.endsWith('.' + extension));
  const filesPerCore = Math.ceil(files.length / numCores);
  const filesArrays = [];

  // split the files into arrays based on the number of CPU cores
  for (let i = 0; i < numCores; i++) {
    filesArrays.push(files.slice(i * filesPerCore, (i + 1) * filesPerCore));
  }

  // remove empty arrays from filesArrays if any. (if the files array is less than the number of cores)
  filesArrays.forEach((array, index) => {
    if (array.length === 0) {
      filesArrays.splice(index, 1);
    }
  });

  return filesArrays;
}

function getArguments() {

  process.argv.slice(2).forEach(v => {
    const flag = v.toLocaleLowerCase().trim();

    if (flag === '-log') {
      args.log = true;
    }
    if (flag === '-cpage') {
      args.cpage = true;
    }
    if (flag === '-cleanup') {
      args.cleanup = true;
    }
    if (flag === '-zippanels') {
      args.zipPanels = true;
    }
    if (flag === '-skipgrey') {
      args.skipgrey = true;
    }
    if (flag === '-help') {
      args.help = true;
    }
  });
}

function init() {
  // make the required directories if they don't exist
  // cleanup if they exist
  log('Status: Initializing. Checking the data directories...');

  const dirs = [
    'assets',
    'extracted_pages',
    'panels',
    'stitched_bw',
    'stitched_color'
  ];

  dirs.forEach(v => {
    const dir = dirData + v;
    if (fs.existsSync(dir)) {
      execSync('rm -rf  ' + dir + '/*.*', { encoding: 'utf8' });
    } else {
      fs.mkdirSync(dir);
    }
  });
}

function cleanup() {
  if (!args.cleanup) {
    return;
  }

  // cleanup after a successful run
  log('Status: Cleaning up unwanted files...');

  const dirs = [
    'extracted_pages',
    'panels',
    'stitched_bw',
    'stitched_color'
  ];

  dirs.forEach(v => {
    const dir = dirData + v;
    if (fs.existsSync(dir)) {
      execSync('rm -rf  ' + dir, { encoding: 'utf8' });
    }
  });
}

function findBookName() {
  // this function assumes theres is only one book in the data dir
  const files = fs.readdirSync(dirData);

  files.forEach(f => {
    if (bookName === '' && f.split('.').pop() === 'cbz') {
      bookName = f.replace('.cbz', ''); // assumes a sane file name!
    }
  });

  log('Status: Processing book: ' + bookName)
}

function unzip() {
  log('Status: Extracting pages from the book');

  execSync('unzip -j ' + dirData + '*.cbz -d ' + dirExtractedPages);
}

function buildColorBook() {
  log('Status: Creating color book from panels');

  execSync('zip -rj "' + dirAssets + bookName + '_color.cbz" ' + dirStitchedColor + '*.jpg');
  log('\tColor book created!');
}

function buildBwBook() {
  if (args.skipgrey) {
    return;
  }

  log('Status: Creating B/W book from panels');
  execSync('zip -rj "' + dirAssets + bookName + '_bw.cbz" ' + dirStitchedBw + '*.jpg');
  log('\tB/W book created!');
}

function zipPanels() {
  if (!args.zipPanels) {
    return;
  }

  log('Status: Zipping color panels');
  execSync('zip -rj "' + dirAssets + bookName + '_panels.zip" ' + dirPanels + '*.jpg');
}

/*
This function combines individual panels together. That's it. How many panels to
join depends on the target device and the layout of the book.
You should play with the logic to get the best results for your target device.
 
The following logic is designed to fit Tintin comics in Kobo Clara screen (1148x1072 px) 
in landscape mode.
 
The algorithm is as follows:
- the logic depends on the width of the panels w.r.t. the original page width (percentages refers to this ratio)
- if a panel is more than 65% of the original page width, do nothing (it's too wide.)
- if a panel is between 50% and 65% of the original page width, check the width of the next image, if any.
  - if the next image is at most 15%, combine the two together. In my experience, that's the maximum combined
  width that produced a readable strip.
- if a panel is less than 50% of the original page width, check the width of the next image, if any.
  - the logic is similar to the above step. configure according to your needs.
 
"Short of some advanced wizardry, there's no way to fully automate this process. But the pain can be vastly minimized." - Michael Scott
*/

function stitchImages() {
  log('Status: Stitching panels using AI borrowed from aliens!\n');

  const files = fs.readdirSync(dirPanels);
  const imageFiles = [];

  // todo: also consider jpeg?
  files.forEach(f => {
    if (f.split('.').pop() === 'jpg') {
      imageFiles.push(f);
    }
  });

  imageStitchingProgressBar.start(imageFiles.length, 0);

  // sort the filenames in natural order
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  imageFiles.sort(collator.compare)

  for (let i = 0; i < imageFiles.length; i++) {

    const sizeOfCurrentImage = getImageInfo(imageFiles[i]);
    const sizeOfCurrentImagePercentage = (sizeOfCurrentImage / originalPageWidth) * 100;

    if (sizeOfCurrentImagePercentage > 65) {
      saveImage(imageFiles[i]);
    }
    else if (sizeOfCurrentImagePercentage >= 50) {
      // check the next file to decide whether to merge with it or not
      const j = i + 1;

      if (j < imageFiles.length) {
        const sizeOfNextImage = getImageInfo(imageFiles[j]);
        const sizeOfNextImagePercentage = (sizeOfNextImage / originalPageWidth) * 100;

        if (sizeOfNextImagePercentage <= 15) {
          // merge the two images
          mergeTwoImages(imageFiles[i], imageFiles[j]);
          i++;
        } else {
          // second image is too big. So, just save the current image 
          saveImage(imageFiles[i]);
        }
      } else {
        // no more images, so just save this one
        saveImage(imageFiles[i]);
      }

    } else {
      // image is less than 50% of the original page width

      // check if the total width of the current and the next image is <= 65% of the original page width.
      // if yes, merge, else just save the current image
      const j = i + 1;

      if (j < imageFiles.length) {
        const sizeOfNextImage = getImageInfo(imageFiles[j]);
        const combinedSizePercentage = ((sizeOfCurrentImage + sizeOfNextImage) / originalPageWidth) * 100;

        if (combinedSizePercentage <= 65) {
          // merge the two images
          mergeTwoImages(imageFiles[i], imageFiles[j]);
          i++;
        } else {
          saveImage(imageFiles[i]);
        }
      } else {
        // no more images, so just save this one
        saveImage(imageFiles[i]);
      }
    }

  }
  imageStitchingProgressBar.stop();
  log('\nIt\'s done Sam! The panels have been stitched.');
};

function getImageInfo(imageName) {
  const imgPath = dirPanels + imageName;
  const result = execSync("magick identify -format '%w' '" + imgPath + "'", { encoding: 'utf8' });
  return parseInt(result);
}

// todo: make this more generic
function mergeTwoImages(imageName1, imageName2) {
  const imgPath1 = "'" + dirPanels + imageName1 + "'";
  const imgPath2 = "'" + dirPanels + imageName2 + "'";

  const outputFile = "'" + dirStitchedColor + (imageName1 + '_' + imageName2).replaceAll('.jpg', '') + '.jpg' + "'";

  execSync('magick montage ' + imgPath1 + ' ' + spacerImage + ' ' + imgPath2 + ' -geometry +1+1+1 ' + outputFile);
  imageStitchingProgressBar.increment(2);
}

function saveImage(imageName) {
  const imgPath = '"' + dirPanels + imageName + '"';
  execSync('cp ' + imgPath + ' ' + dirStitchedColor);
  imageStitchingProgressBar.increment();
}

function log(msg) {
  if (args.log) console.log(msg);
}

function printProcessingTime(time) {

  if (time < 1000) {
    console.log('\nProcess completed in ' + time.toFixed(1) + ' ms.');
    return;
  } else if (time < 60000) {
    console.log('\nProcess completed in ' + (time / 1000).toFixed(2) + ' seconds.');
    return;
  } else {
    time = (time / 1000) / 60;
    const minutes = Math.floor(time);
    const seconds = (time - minutes) * 60;
    console.log('\nProcess completed in ' + minutes + ' minutes and ' + seconds.toFixed(2) + ' seconds.');
  }
}

function printHelp() {
  console.log('\n');
  console.log('Usage: node main.js [options]');
  console.log('Options:');
  console.log('\t-log: enable verbose logging');
  console.log('\t-cpage: enable manual cleanup of extracted pages');
  console.log('\t-zipPanels: enable zipping of extracted panels');
  console.log('\t-cleanup: cleanup unwanted files after a successful run');
  console.log('\t-skipgrey: skip conversion to grey scale');
  console.log('\n');
  console.log('NOTE: Please ensure the following:');
  console.log('\t1. \'data\' directory is present in the same directory as main.js. If not, create it.');
  console.log('\t2. The comic book is inside the data directory. Only one book must be present.');
  console.log('\n');
}
/*------------------------------------------------------------------------
COMIC-SAN

Comic-san is a Mac (possibly Linux too) command line software to create e-books from comic books, that are
suitable for (small) e-book readers, including black & white variants.

------------------------------------------------------------------------*/
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import { createInterface } from 'readline/promises';

//------------------------------------------------------------------------
// NOTE: The following must be set properly

// absolute path to your data directory WITH the trailing slash eg: /Users/Frodo/Documents/comic-san/data/
const dirData = '/Users/dvn/Downloads/kotoon/node/data/';
const originalPageWidth = 3000; // width of a single page of the original comic book (in px).
const bwResizeWidth = 1448; // width of the black & white panels apropriate for your target device
const bwResizeHeight = 1072; // height of the black & white panels apropriate for your target device
//------------------------------------------------------------------------

const dirExtractedPages = dirData + 'extracted_pages/'; // dir to store pages extracted from the original book
const dirPanels = dirData + 'panels/'; // dir to store the color panels extracted from the pages
const dirStitchedColor = dirData + 'stitched_color/'; // dir to store the stitched color panels
const dirStitchedBw = dirData + 'stitched_bw/'; // dir to store the stitched b/w panels
const dirAssets = dirData + 'assets/'; // // dir to store the newly created books and any other useful stuff like panels etc

const spacerImage = '/Users/dvn/Downloads/kotoon/node/space.jpg'; // image used to add gap between panels. modify it however you like

let bookName = '';

// flags:
// -log: enable verbose logging
// -cpage: enable manual cleanup of extracted pages
const args = { log: false, cpage: false }

main();

//------------------------------------------------------------------------

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  // order of functions is critical.
  getArguments(); // primitive method to get args passed on the cmd line
  init();
  findBookName(); // must be run before zipping panels to give the archive a name
  unzip(); // cbz is just an archive. unzip to get the individual pages

  if (args.cpage) {
    console.log('=======> Pages have been extracted. Please check the extracted_pages directory and remove/change unwanted images');
    await rl.question('\tPress any key to continue: ');
  }

  extractPanels(); // get the individual comic panels from the pages

  // after the panels have been extracted, it's necessary to cleanup unwanted ones and to check if they look ok
  console.log('=======> Comic panels have been extracted. Please check the panels directory and remove/change unwanted images');

  const panelCleanupAnswer = await rl.question('\tPress y after manual cleanup. Any other key to quit the program: ');
  if (panelCleanupAnswer.toLocaleLowerCase().trim() !== 'y') {
    console.log('Exiting Comic-San. Please run the program manually.');
    rl.close();
    process.exit();
  }
  rl.close();
  console.log('resuming the process...');

  stitchImages(); // join the panels together
  convertToGreyScale();
  resizeBwPanels(); // to optimize for the target device
  buildBooks(); // zip the stitched panels to create the books
  zipPanels(); // might be a good idea to save the extracted panels for future use

  process.exit();
}

// --------------------------------------------------------

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
    if (existsSync(dir)) {
      execSync('rm -rf  ' + dir + '/*.*', { encoding: 'utf8' });
    } else {
      mkdirSync(dir);
    }
  });
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
  });
}

function unzip() {
  log('Status: Extracting pages from the book');

  execSync('unzip -j ' + dirData + '*.cbz -d ' + dirExtractedPages);
}

function extractPanels() {
  log('Status: Extracting panels. This little maneuver is gonna cost us 51 years!');

  execSync('source /Users/dvn/Downloads/kumiko/bin/activate && /Users/dvn/Downloads/kumiko/./kumiko -i ' + dirExtractedPages + ' -s ' + dirPanels)
}

function convertToGreyScale() {
  log('Status: Creating B/W panels from color panels');

  execSync('magick mogrify -path ' + dirStitchedBw + ' -intensity average -colorspace gray  -strip -interlace Plane -quality 50% ' + dirStitchedColor + '*.jpg')
}

function resizeBwPanels() {
  log('Status: Resizing B/W panels');
  const resolution = bwResizeWidth + 'x' + bwResizeHeight;

  execSync('mogrify -resize ' + resolution + ' ' + dirStitchedBw + '*.jpg')
}

function findBookName() {
  // this function assumes theres is only one book in the data dir
  const files = readdirSync(dirData);

  files.forEach(f => {
    if (bookName === '' && f.split('.').pop() === 'cbz') {
      bookName = f.replace('.cbz', ''); // assumes a sane file name!
    }
  });

  log('Status: Processing book: ' + bookName)
}

function buildBooks() {
  log('Status: Creating books from panels');

  execSync('zip -rj "' + dirAssets + bookName + '_color.cbz" ' + dirStitchedColor + '*.jpg');
  log('\tColor book created!');

  execSync('zip -rj "' + dirAssets + bookName + '_bw.cbz" ' + dirStitchedBw + '*.jpg');
  log('\tB/W book created!');
}

function zipPanels() {
  log('Status: Zipping color panels');

  execSync('zip -rj "' + dirAssets + bookName + '_panels.zip" ' + dirPanels + '*.jpg');
}

function stitchImages() {
  log('Status: Stitching panels using AI borrowed from aliens!');

  const files = readdirSync(dirPanels);
  const imageFiles = [];

  files.forEach(f => {
    if (f.split('.').pop() === 'jpg') {
      imageFiles.push(f);
    }
  });
  log('\tPanels found: ' + imageFiles.length);

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
          saveImage(imageFiles[i])
        }
      } else {
        // no more images, so just save this one
        saveImage(imageFiles[i]);
      }
    }

  }
  log('\tIt\'s done Sam! The panels have been stitched.');
};

function getImageInfo(imageName) {
  const imgPath = dirPanels + imageName;
  const result = execSync("magick identify -format '%w' " + imgPath, { encoding: 'utf8' });
  return parseInt(result);
}

function mergeTwoImages(imageName1, imageName2) {
  const imgPath1 = dirPanels + imageName1;
  const imgPath2 = dirPanels + imageName2;

  const outputFile = dirStitchedColor + (imageName1 + '_' + imageName2).replaceAll('.jpg', '') + '.jpg';

  execSync('magick montage ' + imgPath1 + ' ' + spacerImage + ' ' + imgPath2 + ' -geometry +1+1+1 ' + outputFile);
}

function saveImage(imageName) {
  const imgPath = dirPanels + imageName;
  execSync('cp ' + imgPath + ' ' + dirStitchedColor);
}

function log(msg) {
  if (args.log) console.log(msg);
}

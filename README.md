# COMIC-SAN

Comic-san is a command line software to extract panels from comic books and sittch them together to suit 
small displays of ebook readers. (Some manual interventaion is required but when tuned, 99% of the tasks can be 
automated.)

> Turn something like this:

![original_iamge](https://github.com/dvnlgls/comic-san/blob/master/samples/for_read_me/original.jpg)

> into something like this:

![readable_image](https://github.com/dvnlgls/comic-san/blob/master/samples/for_read_me/p1.jpg)

![readable_image](https://github.com/dvnlgls/comic-san/blob/master/samples/for_read_me/p2.jpg)

> In the above example, the readability is not bad in the first image but it's horrible for navigation. Whereas the processed images
are easy to navigate and offers much better visibility into the text. That's what this program is for.

> Check the `samples` folder to get an idea. A complete book is not included (damn copyright laws) but you'll get an idea. The goal of
this tool is NOT to automate the process completely but to vastly reduce manual intervention. 

Note: I wrote this script to convert my Tintin collection to books suitable for Kobo Clara BW. So, everything is designed with 
that in mind. However, the code is simple and you can play with the logic to suit your needs.

Also note that the script was developed on a Mac. There's no reason why it shouldn't work on linux (that I'm aware of.)

### Input
- You feed the program a color book in `cbz` format (which is basically an archive). `cbr` might possibly work but untested.
  - you can just as well use a b/w book but then you have to disable a few methods in the script (concerning greyscale conversion etc)
- The program is designed to process one book at a time but it's not difficult to modify it for batch processing.

### Output
- You will get the following three files in the `data/assets` dir:
  - A `cbz` color book optimized for landscape reading
  - A `cbz` resized b/w book optimized for landscape reading
  - A zip archive of all the extracted (but unstitched) panels for potential future use

Note: the script is modular. You can cherrypick what you need easily.

### How to install?

- Dependencies: (all of them must be available on the terminal)
  - Node JS

  - https://github.com/njean42/kumiko/ (my program will not be possible without this awesome software)
    - The way I could get this to work is by using a python virtual environment. If you use some other 
    method, you should change the main.js appropriately.
    - Since my program depends on this, it's a good idea to test this after installing it. If you get
    any error concerning "request", comment out any references to "requests" in kumikolib.py. There's no need for any
    web based features; we just need the image splitting function.
    - IMPORTANT: You MUST make this change in kumikolib.py to run my script in its default setting:
      - Change `output_path = os.path.join(output_base_path, os.path.basename(page.filename))` to `output_path = os.path.join(output_base_path)`
      - Change `output_file = os.path.join(output_path, f"panel_{i}.{output_format}")` to `output_file = os.path.join(output_path, f"panel_{nb_written_panels}.{output_format}")`
      - The reason for this change is to place all the extracted panels in a single directory instead of placing them in 
      sub-directories. You can ignore this but then you should change my script accordingly. (method `extractPanels()`)
  
  - ImageMagick

  - Zip
  
### How to use?

- After you've cloned the repo, you MUST create a directory named "data" in the root dir.

- Place your book in this `data` dir. The program will create other directories here 
automatically.
  - For subsequent runs, you can just delete everything inside the data dir and place only the book you intend to process.

- Edit main.js and set a few variables such as path at the very top (the section is clearly labeled).

- Now, don't be intimidated, but you should play with the `stitchImages()` method. It's pretty simple but involves some trial and error. 

- `node main.js` but I suggest you run `node main.js -cpage`. The flag `cpage` will pause the program for you to
check the pages unzipped from the book. Cleaning up unwanted/irregular pages will save some potential time/trouble and make the next
step easier.
  - You can also run with verbose logging: `node main.js -cpage -log`

- If you run with `cpage` flag, check the `data/extracted_pages` dir when the program tells you to do so. Remove/modify pages based on your book. Usually, I just save the title page somewhere temporarily and delete unwanted cover pages and such. Then use the title page in the next step.

- After the panels have been extracted, you will be prompted to check the `data/panels`. Look for any weird panels and deal with them
appropriately (I believe in you!)

- That's it! If all goes well, you will see the output files in the assets dir.

- To process another book, delete everything inside the data dir and place the next book there

### Pointers

- Processing time varies based on the book but I'll describe my experience:
  - Intel Mac Pro 2016 16GB RAM (yes, a vintage model!)
  - Tintin books: avg 400mb. Approximately 70 color pages, resolution: 3000x4000 px.
  - Time: approx. 6 minutes. (obviously excluding manual intervention). Use `time node main.js` to measure time.

- File sizes:
  (Based on the Tintin book example,)
  - Original book: 400 MB
  - Color book: 165 MB
  - B/W book (resized): 35 MB
  - Panels zip: 174 MB

- The code is intentionally left a little verbose without any cryptic optimizations for two reasons: 1) readibility 2) to cherrypick modular actions

- This contraption has been fashioned in the span of two evenings, so there's plenty of scope for improvement.

### Pitfalls

- The ideal input for this program is a page with well defined panels, as shown in the `samples` dir.
- So, other formats may not work correctly or at all.
- I'm collecting a detailed dump of everything that causes troubel. I hope to upload it as soon as I have completed my Tintin collection.

## Disclaimer

- IMO, Node is not the right tool for this kind of tasks. It gets the job done just fine but we are fitting a synchronous peg in an
asynchronous hole. But this is the tool I'm most familiar with and as such I must make peace with my choice.

### Contributions

- Have at it. 
/*
 * Author : André Rocha
 * Email : anr@isep.ipp.pt
 * Source : https://github.com/txroot/latexprinter
 *
 * Thanks to Manuels from:
 * https://github.com/manuels/texlive.js/
 * texlive.js is a port of TeX live 2016 to Javascript
 */

/**
* LatexPrinter Prototype
* @param {int} printerId    Id of the printer (optional)
* @param {string} targetLnk link dom object ID
* @param {string} targetBtn button dom object ID
*/

function processItem(imgArray, latexCode, link, button){
  var texpdf = new PDFTeX();
  var targetLnk = document.getElementById(link);
  var targetBtn = document.getElementById(button);
  console.time("Execution time");
  targetBtn.innerHTML= 'Processing';
  texpdf.set_TOTAL_MEMORY(80*1024*1024).then(function() {
    console.log("IMG Array Size: " + imgArray.length);
    for (let i = 0; i < imgArray.length; i++) {
      console.log("Filename: " + imgArray[i].filename);
      console.log("Base64: " + imgArray[i].base64img);
      texpdf.FS_createLazyFile('/', imgArray[i].filename, imgArray[i].base64img, true, true);
    }
    texpdf.compile(latexCode).then(function(pdf_dataurl) {

        console.timeEnd("Execution time");
        var errorCode;
        if (pdf_dataurl === false) errorCode = -2;
        console.log("errorCode: " + errorCode);
        console.log("dataURL: " + pdf_dataurl);
        targetLnk.href = pdf_dataurl;

        targetLnk.click();
        targetBtn.innerHTML= 'Print';
    });
  });
}

class latexprinter{
    constructor(printerId, targetLnk, targetBtn) {
        this.id = printerId || null,
        this.latexCode = null,
        this.texpdf = new PDFTeX(),
        this.jobState = -1;
        this.imgArr = new Array(),
        this.targetLnk = targetLnk,
        this.targetBtn = targetBtn,
        this.result = {
          errorCode: -3,
          pdfDataUrl: null
        },
        this.addTexFile = function(texSourceFile) {
            // Code do add image file
            this.latexCode = texSourceFile;
        },
        this.addImgFile = function(filename, base64img) {
            // Code do add image file
          this.imgArr.push({filename, base64img});
        },
        this.print = function() {
          let errorCode = 0;
          let pdf_dataurl = "";

          if(this.latexCode == null) errorCode = -1;
          else {

            processItem(this.imgArr, this.latexCode, this.targetLnk, this.targetBtn);
          }

          this.result.errorCode = errorCode;
        }
    };
};

var PDFTeX = function(opt_workerPath) {
    if (!opt_workerPath) {
      opt_workerPath = './texworker.js';
    }

    var worker = new Worker(opt_workerPath);
    var self = this;
    var initialized = false;

    self.on_stdout = function(msg) {
      console.log(msg);
    }

    self.on_stderr = function(msg) {
      console.log(msg);
    }

    worker.onmessage = function(ev) {
      var data = JSON.parse(ev.data);
      var msg_id;

      if(!('command' in data))
        console.log("missing command!", data);
      switch(data['command']) {
        case 'ready':
          onready.done(true);
          break;
        case 'stdout':
        case 'stderr':
          self['on_'+data['command']](data['contents']);
          break;
        default:
          //console.debug('< received', data);
          msg_id = data['msg_id'];
          if(('msg_id' in data) && (msg_id in promises)) {
            promises[msg_id].done(data['result']);
          }
          else
            console.warn('Unknown worker message '+msg_id+'!');
      }
    }

    var onready = new promise.Promise();
    var promises = [];
    var chunkSize = undefined;

    var sendCommand = function(cmd) {
      var p = new promise.Promise();
      var msg_id = promises.push(p)-1;

      onready.then(function() {
        cmd['msg_id'] = msg_id;
        //console.debug('> sending', cmd);
        worker.postMessage(JSON.stringify(cmd));
      });

      return p;
    };

    var determineChunkSize = function() {
      var size = 1024;
      var max = undefined;
      var min = undefined;
      var delta = size;
      var success = true;
      var buf;

      while(Math.abs(delta) > 100) {
        if(success) {
          min = size;
          if(typeof(max) === 'undefined')
            delta = size;
          else
            delta = (max-size)/2;
        }
        else {
          max = size;
          if(typeof(min) === 'undefined')
            delta = -1*size/2;
          else
            delta = -1*(size-min)/2;
        }
        size += delta;

        success = true;
        try {
          buf = String.fromCharCode.apply(null, new Uint8Array(size));
          sendCommand({
            command: 'test',
            data: buf,
          });
        }
        catch(e) {
          success = false;
        }
      }

      return size;
    };


    var createCommand = function(command) {
      self[command] = function() {
        var args = [].concat.apply([], arguments);

        return sendCommand({
          'command':  command,
          'arguments': args,
        });
      }
    }
    createCommand('FS_createDataFile'); // parentPath, filename, data, canRead, canWrite
    createCommand('FS_readFile'); // filename
    createCommand('FS_unlink'); // filename
    createCommand('FS_createFolder'); // parent, name, canRead, canWrite
    createCommand('FS_createPath'); // parent, name, canRead, canWrite
    createCommand('FS_createLazyFile'); // parent, name, canRead, canWrite
    createCommand('FS_createLazyFilesFromList'); // parent, list, parent_url, canRead, canWrite
    createCommand('set_TOTAL_MEMORY'); // size
    createCommand('copy_direct_file'); // file

    var curry = function(obj, fn, args) {
      return function() {
        return obj[fn].apply(obj, args);
      }
    }

    self.compile = function(source_code) {
      var p = new promise.Promise();

      self.compileRaw(source_code).then(function(binary_pdf) {
        if(binary_pdf === false)
          return p.done(false);

        pdf_dataurl = 'data:application/pdf;charset=binary;base64,' + window.btoa(binary_pdf);

        return p.done(pdf_dataurl);
      });
      return p;
    }

    self.compileRaw = function(source_code) {
      if(typeof(chunkSize) === "undefined")
        chunkSize = determineChunkSize();

      var commands;
      if(initialized)
        commands = [
          curry(self, 'FS_unlink', ['/input.tex']),
        ];
      else
        commands = [
          curry(self, 'FS_createDataFile', ['/', 'input.tex', source_code, true, true]),
          curry(self, 'FS_createLazyFilesFromList', ['/', 'texlive.lst', './texlive', true, true]),
        ];

      var sendCompile = function() {
        initialized = true;
        return sendCommand({
          'command': 'run',
          'arguments': ['-interaction=nonstopmode', '-output-format', 'pdf', 'input.tex'],
        });
      };

      var getPDF = function() {
        console.log(arguments);
        return self.FS_readFile('/input.pdf');
      }

      return promise.chain(commands)
        .then(sendCompile)
        .then(getPDF);
    };
  };
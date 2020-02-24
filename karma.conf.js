const jasmineSeedReporter = require("./seedreporter.js")

module.exports = function(config) {
    config.set({
      client: {
        jasmine: {
          random: true,
          // seed: '48978',
          timeoutInterval: Infinity
        }
      },

      // base path that will be used to resolve all patterns (eg. files, exclude)
      basePath: '',
  
  
      // frameworks to use
      // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
      frameworks: ['jasmine'],
  
  
      // list of files / patterns to load in the browser
      files: [
        "dist/openpgp.js",
        "dist/pouchdb.min.js",
        "dist/pouchdb.find.js",
        "medblocks.js",
        "test.js",
      ],
  
  
      // list of files / patterns to exclude
      exclude: [
          "dist/openpgp.worker.js"
      ],
  
  
      // preprocess matching files before serving them to the browser
      // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
      preprocessors: {
      },
  
  
      // test results reporter to use
      // possible values: 'dots', 'progress'
      // available reporters: https://npmjs.org/browse/keyword/karma-reporter
      plugins: [
        "karma-*",
        jasmineSeedReporter
      ],
    
      reporters: ['spec', "jasmine-seed"],

    
  
      // web server port
      port: 9876,
  
  
      // enable / disable colors in the output (reporters and logs)
      colors: true,
  
  
      // level of logging
      // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
      logLevel: config.LOG_INFO,
  
  
      // enable / disable watching file and executing tests whenever any file changes
      autoWatch: true,
  
      customLaunchers: {
        ChromeDebugging: {
          base: 'ChromeHeadless',
          flags: [ '--remote-debugging-port=9333' ],
          debug: true
        }
      },
    
      // start these browsers
      // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
      browsers: ['ChromeDebugging'],
  
  
      // Continuous Integration mode
      // if true, Karma captures browsers, runs the tests and exits
      singleRun: false,
  
      // Concurrency level
      // how many browser should be started simultaneous
      concurrency: Infinity
    })
  }
  
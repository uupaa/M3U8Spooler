// M3U8Spooler test

onmessage = function(event) {
    self.unitTest = event.data; // { message, setting: { secondary, baseDir } }

    if (!self.console) { // polyfill WebWorkerConsole
        self.console = function() {};
        self.console.dir = function() {};
        self.console.log = function() {};
        self.console.warn = function() {};
        self.console.error = function() {};
        self.console.table = function() {};
    }

    importScripts("../../lib/WebModule.js");

    WebModule.VERIFY  = true;
    WebModule.VERBOSE = true;
    WebModule.PUBLISH = true;

    importScripts("../../node_modules/uupaa.m3u8.js/node_modules/uupaa.uri.js/lib/URISearchParams.js");
    importScripts("../../node_modules/uupaa.m3u8.js/node_modules/uupaa.uri.js/lib/URI.js");
    importScripts("../../node_modules/uupaa.m3u8.js/node_modules/uupaa.fileloader.js/lib/FileLoader.js");
    importScripts("../../node_modules/uupaa.m3u8.js/node_modules/uupaa.fileloader.js/lib/FileLoaderQueue.js");
    importScripts("../../node_modules/uupaa.m3u8.js/node_modules/uupaa.aacprofile.js/lib/AACProfile.js");
    importScripts("../../node_modules/uupaa.m3u8.js/node_modules/uupaa.h264profile.js/lib/H264Profile.js");
    importScripts("../../node_modules/uupaa.m3u8.js/lib/M3U8.js");
    importScripts("../wmtools.js");
    importScripts("../../lib/M3U8Segment.js");
    importScripts("../../lib/M3U8Spooler.js");
    importScripts("../../release/M3U8Spooler.w.min.js");
    importScripts("../testcase.js");

    self.postMessage(self.unitTest);
};


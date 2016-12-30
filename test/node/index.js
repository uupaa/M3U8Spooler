// M3U8Spooler test

require("../../lib/WebModule.js");

WebModule.VERIFY  = true;
WebModule.VERBOSE = true;
WebModule.PUBLISH = true;

require("../../node_modules/uupaa.m3u8.js/node_modules/uupaa.uri.js/lib/URISearchParams.js");
require("../../node_modules/uupaa.m3u8.js/node_modules/uupaa.uri.js/lib/URI.js");
require("../../node_modules/uupaa.m3u8.js/node_modules/uupaa.fileloader.js/lib/FileLoader.js");
require("../../node_modules/uupaa.m3u8.js/node_modules/uupaa.fileloader.js/lib/FileLoaderQueue.js");
require("../../node_modules/uupaa.m3u8.js/node_modules/uupaa.aacprofile.js/lib/AACProfile.js");
require("../../node_modules/uupaa.m3u8.js/node_modules/uupaa.h264profile.js/lib/H264Profile.js");
require("../../node_modules/uupaa.m3u8.js/lib/M3U8.js");
require("../wmtools.js");
require("../../lib/M3U8Segment.js");
require("../../lib/M3U8Spooler.js");
require("../../release/M3U8Spooler.n.min.js");
require("../testcase.js");


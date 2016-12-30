(function moduleExporter(name, closure) {
"use strict";

var entity = GLOBAL["WebModule"]["exports"](name, closure);

if (typeof module !== "undefined") {
    module["exports"] = entity;
}
return entity;

})("M3U8Spooler", function moduleClosure(global, WebModule, VERIFY, VERBOSE) {
"use strict";

// --- technical terms / data structure --------------------
// --- dependency modules ----------------------------------
var M3U8        = WebModule["M3U8"];
var M3U8Segment = WebModule["M3U8Segment"];
// --- import / local extract functions --------------------
// --- define / local variables ----------------------------
// --- class / interfaces ----------------------------------
function M3U8Spooler(options) { // @arg Object = null - { autoStart, spoolThreshold, spoolCallback, errorCallback, m3u8Callback, tsCallback, endCallback, videoCanPlay, audioCanPlay, m3u8FetchIntervalRatio }
                                // @options.autoStart      Boolean = true
                                // @options.spoolThreshold UINT32 = 0 - msec
                                // @options.spoolCallback  Function = null - spoolCallback(cachedDurations:UINT32):void
                                // @options.errorCallback  Function = null - errorCallback(error:DetailError, url:URLString, code:HTTPStatusCodeUINT16):void
                                // @options.m3u8Callback   Function = null - m3u8Callback(m3u8URL:URLString, m3u8:String, playlist:MasterPlaylistObject|MediaPlaylistObject, master:Boolean):void
                                // @options.tsCallback     Function = null - tsCallback(tsID:UINT32, tsURL:URLString, tsBlob:Blob):void
                                // @options.endCallback    Function = null - endCallback():void
                                // @options.videoCanPlay   RegExp = /^(Base|Main)/ - video can play profile.
                                // @options.audioCanPlay   RegExp = /AAC/          - audio can play profile.
                                // @options.m3u8FetchIntervalRatio Number = 0.5
//{@dev
    if (VERIFY) {
        $valid($type(options, "Object|omit"), M3U8Spooler, "options");
        if (options) {
            $valid($type(options.autoStart,      "Boolean|omit"),  M3U8Spooler, "options.autoStart");
            $valid($type(options.spoolThreshold, "UINT32|omit"),   M3U8Spooler, "options.spoolThreshold");
            $valid($type(options.spoolCallback,  "Function|omit"), M3U8Spooler, "options.spoolCallback");
            $valid($type(options.errorCallback,  "Function|omit"), M3U8Spooler, "options.errorCallback");
            $valid($type(options.m3u8Callback,   "Function|omit"), M3U8Spooler, "options.m3u8Callback");
            $valid($type(options.tsCallback,     "Function|omit"), M3U8Spooler, "options.tsCallback");
            $valid($type(options.endCallback,    "Function|omit"), M3U8Spooler, "options.endCallback");
            $valid($type(options.videoCanPlay,   "RegExp|omit"),   M3U8Spooler, "options.videoCanPlay");
            $valid($type(options.audioCanPlay,   "RegExp|omit"),   M3U8Spooler, "options.audioCanPlay");
            $valid($type(options.m3u8FetchIntervalRatio, "Number|omit"), M3U8Spooler, "options.m3u8FetchIntervalRatio");
        }
    }
//}@dev

    this._options = options || {};

    if (!("autoStart" in this._options)) {
        this._options["autoStart"] = true;
    }
    this._options["spoolCallback"] = this._options["spoolCallback"] || function(cachedDurations) {
        console.info("M3U8Spooler::spoolCallback", cachedDurations);
    };
    this._options["errorCallback"] = this._options["errorCallback"] || function(error, url, code) {
        console.error("M3U8Spooler::errorCallback", error["message"], url, code);
    };
    this._options["m3u8Callback"] = this._options["m3u8Callback"] || function(m3u8URL, m3u8, mediaPlaylist) {
        console.info("M3U8Spooler::m3u8Callback", m3u8URL, m3u8, mediaPlaylist);
    };
    this._options["tsCallback"] = this._options["tsCallback"] || function(tsID, tsURL, tsBlob) {
        console.info("M3U8Spooler::tsCallback", tsID, tsURL, tsBlob);
    };
    this._options["endCallback"] = this._options["endCallback"] || function() {
        console.info("M3U8Spooler::endCallback");
    };

    this._m3u8URL        = "";   // M3U8URLString
    this._spooler        = null; // new M3U8VODSpooler(...) or new M3U8LiveSpooler(...)
    this._masterPlaylist = {};   // https://github.com/uupaa/M3U8.js/wiki/M3U8#masterplaylistobject
    this._mediaPlaylist  = {};   // https://github.com/uupaa/M3U8.js/wiki/M3U8#mediaplaylistobject
    this._videoCanPlay   = this._options["videoCanPlay"] || /^(Base|Main)/;
    this._audioCanPlay   = this._options["audioCanPlay"] || /AAC/;
}

M3U8Spooler["VERBOSE"] = VERBOSE;
M3U8Spooler["prototype"] = Object.create(M3U8Spooler, {
    "constructor":      { "value": M3U8Spooler       }, // new M3U8Spooler(...):M3U8Spooler
    "load":             { "value": M3U8Spooler_load  }, // #load(readyCallback:Function = null):void
    "has":              { "value": M3U8Spooler_has   }, // #has(msec:UINT32):Boolean
    "use":              { "value": M3U8Spooler_use   }, // #use(msec:UINT32):ChunkObject|null - { tsIDs:UIN32Array, tsInfos:TSInfoObjectArray, tsBlobs:BlobArray, chunkDurations:UINT32 }
    "used":             { "value": M3U8Spooler_used  }, // #used(indexes:UINT32Array):void
    "seek":             { "value": M3U8Spooler_seek  }, // #seek(seekTime:UINT32):Object|null - { tsID:UINT32, startTime:UINT32, endTime:UINT32 }
    "start":            { "value": M3U8Spooler_start }, // #start():void
    "stop":             { "value": M3U8Spooler_stop  }, // #stop():void
    "clear":            { "value": M3U8Spooler_clear }, // #clear():void
    "state":            { "get": M3U8Spooler_get_state }, // #state:Object|null - { info:String, totalDurations:UINT32, cachedDurations:UINT32, connections:UINT8 }
    "live":             { "get": function()    { return this._mediaPlaylist["type"] === "LIVE"; }}, // #live:Boolean
    "src":              { "get": function()    { return this._m3u8URL; },  // #src:URLString
                          "set": function(url) { this._m3u8URL = url;  }},
    "stopped":          { "get": M3U8Spooler_get_stopped         }, // #stopped:Boolean
    "totalDurations":   { "get": M3U8Spooler_get_totalDurations  }, // #totalDurations:UINT32
    "cachedDurations":  { "get": M3U8Spooler_get_cachedDurations }, // #cachedDurations:UINT32
});

// --- implements ------------------------------------------
function M3U8Spooler_load(readyCallback) { // @arg Function = null - readyCallback(playlist:MediaPlaylistObject):void
    readyCallback = readyCallback || function(playlist) {
        console.info(playlist);
    };

    var that = this;

    that["stop"]();
    that["clear"]();
    that._masterPlaylist = {};
    that._mediaPlaylist  = {};

    M3U8["load"](that._m3u8URL, function(m3u8, m3u8URL) {
        var playlist = M3U8["parse"](m3u8, m3u8URL); // MasterPlaylistObject|MediaPlaylistObject

        switch (playlist["type"]) {
        case "MASTER":
            that._masterPlaylist = playlist; // MasterPlaylistObject
            that._options["m3u8Callback"](m3u8URL, m3u8, playlist, true);

            _parseMasterPlaylist(that, m3u8URL, readyCallback);
            break;

        case "VOD":
        case "LIVE":
            that._mediaPlaylist = playlist; // MediaPlaylistObject
            that._options["m3u8Callback"](m3u8URL, m3u8, playlist, false);

            that._spooler = new M3U8Segment(playlist, that._options);
            readyCallback(playlist);
            if (that._options["autoStart"]) {
                that["start"]();
            }
        }
    }, that._options["errorCallback"], { "timeout": 2000 });
}

function _parseMasterPlaylist(that, m3u8URL, readyCallback) {
    var streams = that._masterPlaylist["streams"];
    var index = _selectBetterStream.call(that, streams);

    if (index < 0) {
        var error = new Error("Sorry, There is no playable stream");

        error["detail"] = { "url": m3u8URL, "code": 404 };
        that._options["errorCallback"](error, m3u8URL, 404);
    } else {
        var stream = streams[index]; // MasterStreamObject - { url, info, codecs, bandwidth, resolution, video, audio }

        M3U8["load"](stream["url"], function(m3u8, m3u8URL) {
            var playlist = M3U8["parse"](m3u8, m3u8URL);

            that._mediaPlaylist = playlist;
            that._options["m3u8Callback"](m3u8URL, m3u8, playlist, false);

            that._spooler = new M3U8Segment(playlist, that._options);
            readyCallback(playlist);
            if (that._options["autoStart"]) {
                that["start"]();
            }
        }, that._options["errorCallback"], { "timeout": 2000 });
    }
}

function M3U8Spooler_has(msec) { // @arg UINT32 - milliseconds
                               // @ret Boolean
    if (this._spooler) {
        return this._spooler["has"](msec);
    }
    return false;
}

function M3U8Spooler_use(msec) { // @arg UINT32 - milliseconds
                                 // @ret ChunkObject|null - { tsIDs:UIN32Array, tsInfos:TSInfoObjectArray, tsBlobs:BlobArray, chunkDurations:UINT32 }
    if (this._spooler) {
        return this._spooler["use"](msec);
    }
    return null;
}

function M3U8Spooler_used(tsIDs) { // @arg UINT32Array - [tsID, ...]
    if (this._spooler) {
        this._spooler["used"](tsIDs);
    }
}

function M3U8Spooler_seek(seekTime) { // @arg UINT32 - seek target time, seek estimated time.
                                      // @ret Object|null - { tsID:UINT32, startTime:UINT32, endTime:UINT32 }
    if (this._spooler) {
        return this._spooler["seek"](seekTime);
    }
    return null;
}

function M3U8Spooler_start() {
    if (this._spooler) {
        this._spooler["start"]();
    }
}

function M3U8Spooler_stop() {
    if (this._spooler) {
        this._spooler["stop"]();
    }
}

function M3U8Spooler_clear() {
    if (this._spooler) {
        this._spooler["clear"]();
    }
}

function M3U8Spooler_get_state() { // @ret Object|null - { state:String, totalDurations:UINT32, cachedDurations:UINT32, connections:UINT8 }
    if (this._spooler) {
        return this._spooler["state"];
    }
    return null;
}

function M3U8Spooler_get_stopped() { // @ret Boolean
    if (this._spooler) {
        return this._spooler["stopped"];
    }
    return true;
}

function M3U8Spooler_get_totalDurations() { // @ret UINT32 - msec
    if (this._spooler) {
        return this._spooler["totalDurations"];
    }
    return 0;
}

function M3U8Spooler_get_cachedDurations() { // @ret UINT32 - msec
    if (this._spooler) {
        return this._spooler["cachedDurations"];
    }
    return 0;
}

function _selectBetterStream(masterStreams) { // @arg MasterStreamObjectArray - [MasterStreamObject, ...]
                                              // @ret Number - stream-index or -1
                                              // @desc selecting the appropriate HLS stream.
    for (var i = 0, iz = masterStreams.length; i < iz; ++i) {
        var stream = masterStreams[i];

        if ( this._videoCanPlay.test(stream["video"]["profile"]) &&
             this._audioCanPlay.test(stream["audio"]["profile"]) ) {
            return i; // H.264 Baseline profile, AAC-LC -> NICE
        }
    }
    return -1;
}

return M3U8Spooler; // return entity

});


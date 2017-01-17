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
function M3U8Spooler(options) { // @arg Object = null - { autoStart, updateCallback, errorCallback, m3u8Callback, tsCallback, endCallback, m3u8FetchIntervalRatio }
                                // @options.autoStart      Boolean = true
                                // @options.updateCallback Function = null - updateCallback(cachedDurations:UINT32, notify:UINT8):void
                                // @options.errorCallback  Function = null - errorCallback(error:DetailError, url:URLString, code:HTTPStatusCodeUINT16):void
                                // @options.m3u8Callback   Function = null - m3u8Callback(m3u8URL:URLString, m3u8:String, playlist:MasterPlaylistObject|MediaPlaylistObject, master:Boolean):void
                                // @options.tsCallback     Function = null - tsCallback(tsID:UINT32, tsURL:URLString, tsBlob:Blob):void
                                // @options.endCallback    Function = null - endCallback():void
                                // @options.m3u8FetchIntervalRatio Number = 0.5
//{@dev
    if (VERIFY) {
        $valid($type(options, "Object|omit"), M3U8Spooler, "options");
        if (options) {
            $valid($type(options.autoStart,      "Boolean|omit"),  M3U8Spooler, "options.autoStart");
            $valid($type(options.updateCallback, "Function|omit"), M3U8Spooler, "options.updateCallback");
            $valid($type(options.errorCallback,  "Function|omit"), M3U8Spooler, "options.errorCallback");
            $valid($type(options.m3u8Callback,   "Function|omit"), M3U8Spooler, "options.m3u8Callback");
            $valid($type(options.tsCallback,     "Function|omit"), M3U8Spooler, "options.tsCallback");
            $valid($type(options.endCallback,    "Function|omit"), M3U8Spooler, "options.endCallback");
            $valid($type(options.m3u8FetchIntervalRatio, "Number|omit"), M3U8Spooler, "options.m3u8FetchIntervalRatio");
        }
    }
//}@dev

    this._options = options || {};

    if (!("autoStart" in this._options)) {
        this._options["autoStart"] = true;
    }
    this._options["updateCallback"] = this._options["updateCallback"] || function(cachedDurations, notify) {
        console.info("M3U8Spooler::updateCallback", cachedDurations, notify);
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
    this._mediaPlaylist  = {};   // https://github.com/uupaa/M3U8.js/wiki/M3U8#mediaplaylistobject
}

M3U8Spooler["VERBOSE"] = VERBOSE;
M3U8Spooler["prototype"] = Object.create(M3U8Spooler, {
    "constructor":      { "value": M3U8Spooler       }, // new M3U8Spooler(...):M3U8Spooler
    "load":             { "value": M3U8Spooler_load  }, // #load(readyCallback:Function = null, streamFilterCallback:Function = M3U8.baselineFilter):void
    "has":              { "value": M3U8Spooler_has   }, // #has(msec:UINT32):Boolean
    "use":              { "value": M3U8Spooler_use   }, // #use(msec:UINT32):ChunkObject|null - { tsIDs:UIN32Array, tsInfos:TSInfoObjectArray, tsBlobs:BlobArray, chunkDurations:UINT32 }
    "used":             { "value": M3U8Spooler_used  }, // #used(tsIDs:UINT32Array):void
    "seek":             { "value": M3U8Spooler_seek  }, // #seek(seekTime:UINT32):Object|null - { tsID:UINT32, startTime:UINT32, endTime:UINT32 }
    "start":            { "value": M3U8Spooler_start }, // #start():void
    "stop":             { "value": M3U8Spooler_stop  }, // #stop():void
    "clear":            { "value": M3U8Spooler_clear }, // #clear():void
    "state":            { "get": M3U8Spooler_get_state }, // #state:Object|null - { queue:String, totalDurations:UINT32, cachedDurations:UINT32, connections:UINT8 }
    "live":             { "get": function()    { return /LIVE/.test(this._mediaPlaylist["type"]); }}, // #live:Boolean
    "src":              { "get": function()    { return this._m3u8URL; },  // #src:URLString
                          "set": function(url) { this._m3u8URL = url;  }},
    "stopped":          { "get": M3U8Spooler_get_stopped         }, // #stopped:Boolean
    "totalDurations":   { "get": M3U8Spooler_get_totalDurations  }, // #totalDurations:UINT32
    "cachedDurations":  { "get": M3U8Spooler_get_cachedDurations }, // #cachedDurations:UINT32
});

// --- implements ------------------------------------------
function M3U8Spooler_load(readyCallback,          // @arg Function = null - readyCallback(playlist:MediaPlaylistObject):void
                          streamFilterCallback) { // @arg Function = M3U8.baselineFilter - streamFilterCallback(streams:MasterStreamObjectArray):UINT8
//{@dev
    if (VERIFY) {
        $valid($type(readyCallback,        "Function|omit"), M3U8Spooler_load, "readyCallback");
        $valid($type(streamFilterCallback, "Function|omit"), M3U8Spooler_load, "streamFilterCallback");
    }
//}@dev

    readyCallback = readyCallback || function(playlist) {
        console.info(playlist);
    };

    var that = this;

    that["stop"]();
    that["clear"]();
    that._mediaPlaylist  = {};

    M3U8["loadMediaPlaylist"](that._m3u8URL, function(m3u8, m3u8URL, playlist) {
        that._mediaPlaylist = playlist; // MediaPlaylistObject
        that._options["m3u8Callback"](m3u8URL, m3u8, playlist, false);

        that._spooler = new M3U8Segment(playlist, that._options);
        readyCallback(playlist);
        if (that._options["autoStart"]) {
            that["start"]();
        }
    }, that._options["errorCallback"], streamFilterCallback, { "timeout": 2000 });
}

function M3U8Spooler_has(msec) { // @arg UINT32 - milliseconds
                                 // @ret Boolean
//{@dev
    if (VERIFY) {
        $valid($type(msec, "UINT32"), M3U8Spooler_has, "msec");
    }
//}@dev

    if (this._spooler) {
        return this._spooler["has"](msec);
    }
    return false;
}

function M3U8Spooler_use(msec) { // @arg UINT32 - milliseconds
                                 // @ret ChunkObject|null - { tsIDs:UIN32Array, tsInfos:TSInfoObjectArray, tsBlobs:BlobArray, chunkDurations:UINT32 }
//{@dev
    if (VERIFY) {
        $valid($type(msec, "UINT32"), M3U8Spooler_use, "msec");
    }
//}@dev

    if (this._spooler) {
        return this._spooler["use"](msec);
    }
    return null;
}

function M3U8Spooler_used(tsIDs) { // @arg UINT32Array - [tsID, ...]
//{@dev
    if (VERIFY) {
        $valid($type(tsIDs, "UINT32Array"), M3U8Spooler_used, "tsIDs");
    }
//}@dev

    if (this._spooler) {
        this._spooler["used"](tsIDs);
    }
}

function M3U8Spooler_seek(seekTime) { // @arg UINT32 - seek target time, seek estimated time.
                                      // @ret Object|null - { tsID:UINT32, startTime:UINT32, endTime:UINT32 }
//{@dev
    if (VERIFY) {
        $valid($type(seekTime, "UINT32"), M3U8Spooler_seek, "seekTime");
    }
//}@dev

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

return M3U8Spooler; // return entity

});


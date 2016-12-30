(function moduleExporter(name, closure) {
"use strict";

var entity = GLOBAL["WebModule"]["exports"](name, closure);

if (typeof module !== "undefined") {
    module["exports"] = entity;
}
return entity;

})("M3U8Segment", function moduleClosure(global, WebModule /*, VERIFY, VERBOSE */) {
"use strict";

// --- technical terms / data structure --------------------
/*
# ChunkObject

- ChunkObject: { tsIDs, tsInfos, tsBlobs, chunkDurations }
    - tsIDs:            UIN32Array - [tsID, ...]
    - tsInfos:          TSInfoObjectArray - [TSInfoObject, ...]
    - tsBlobs:          BlobArray - [tsBlob, ...]
    - chunkDurations:   UINT32 - sum of tsDurarions in chunk(msec)

- TSInfoObject: { tsID, tsURL, tsDuration, tsRange, state, created_at, updated_at }
    - tsID              UINT32
    - tsURL             URLString
    - tsDuration        UINT32 - msec
    - tsRange           Object - { startTime:UINT32(msec), endTime:UINT32(msec) }
    - state             UINT8  - status (STATE_NEW|STATE_BLOB_FETCHED|STATE_BLOB_RESERVED|STATE_USED|STATE_ERROR)
    - created_at        UINT32 - time_t
    - updated_at        UINT32 - time_t
 */
// --- dependency modules ----------------------------------
var M3U8                = WebModule["M3U8"];
var FileLoader          = WebModule["FileLoader"];
// --- import / local extract functions --------------------
// --- define / local variables ----------------------------
var STATE_NEW           = 0; // "N" - tsMap, blobMap を作成した状態, Blob 読み込み対象
var STATE_LOADING       = 1; // "L" - Blob 読込中
var STATE_BLOB_FETCHED  = 2; // "F" - blobMap[tsID] != null の状態, Blob作成済み
var STATE_BLOB_RESERVED = 3; // "B" - blobMap[tsID] != null の状態, Blob使用予約済み
var STATE_USED          = 4; // "U" - blobMap[tsID] = null の状態, Blob 使用済み。この状態になったら再読み込みは発生しない
var STATE_ERROR         = 5; // "E" - blobMap[tsID] = null の状態, エラー, 読み込まない
// --- class / interfaces ----------------------------------
function M3U8Segment(playlist,  // @arg MediaPlaylistObject - { url, type, version, allowCache, mediaSequence, mediaSegments, targetDuration, totalDurations }
                     options) { // @arg Object - { spoolThreshold, spoolCallback, errorCallback, m3u8Callback, tsCallback, endCallback, m3u8FetchIntervalRatio }
    this._m3u8URL           = playlist["url"];
    this._spoolThreshold    = options["spoolThreshold"] || 0;
    this._spoolCallback     = options["spoolCallback"]; // spoolCallback(cachedDurations:UINT32):void
    this._errorCallback     = options["errorCallback"]; // errorCallback(error:DetailError, url:URLString, code:HTTPStatusCodeUINT16):void
    this._m3u8Callback      = options["m3u8Callback"];  // m3u8Callback(m3u8URL:URLString, m3u8:String, playlist:MasterPlaylistObject|MediaPlaylistObject, master:Boolean):void
    this._tsCallback        = options["tsCallback"];    // tsCallback(tsID:UINT32, tsURL:URLString, tsBlob:Blob):void
    this._endCallback       = options["endCallback"];   // endCallback():void
    this._m3u8FetchIntervalRatio = options["m3u8FetchIntervalRatio"] || 0.5;
    this._live              = playlist["type"] === "LIVE" ? true : false;
    // --- UNGREEDY mode properties ---
    this._suppressMemoryUsage = true;
    this._maxBlobCached     = 5;
    this._maxBlobReserved   = 5;
    this._suppressConnectionUsage = true;
    this._connections       = 0;
    this._maxConnections    = 5;
    // --- internal property ---
    this._fetchM3U8         = { fn: _fetchM3U8.bind(this), timerID: 0, interval: 0 };
    this._tsBlobMap         = {};   // { tsID: tsBlob, ... }
    this._tsInfoMap         = {};   // { tsID: TSInfoObject, ... }
    this._totalDurations    = 0;    // sum of media segment tsDurations (estimated duration)(VOD only)(msec)
    this._cachedDurations   = 0;    // msec. sum of tsDurations if STATE_BLOB_FETCHED
    this._m3u8              = "";   // last m3u8 string (for diff check)
    this._stopped           = true;
    this._view = {                  // media segment view
        cursor: 0,                  // current tsIDs cursor. use(), seek() で変化する
        tsIDs:  [],                 // [tsID, ...]
    };
}

M3U8Segment["prototype"] = Object.create(M3U8Segment, {
    "constructor":      { "value": M3U8Segment          }, // new M3U8Segment(...):M3U8Segment
    "has":              { "value": M3U8Segment_has      }, // #has(msec:UINT32):Boolean
    "use":              { "value": M3U8Segment_use      }, // #use(msec:UINT32):ChunkObject|null
    "used":             { "value": M3U8Segment_used     }, // #used(tsIDs:UINT32Array):void
    "seek":             { "value": M3U8Segment_seek     }, // #seek(seekTime:UINT32):Object|null - { tsID, startTime, endTime }
    "start":            { "value": M3U8Segment_start    }, // #start():void
    "stop":             { "value": M3U8Segment_stop     }, // #stop():void
    "clear":            { "value": M3U8Segment_clear    }, // #clear():void
    "state":            { "get": M3U8Segment_get_state  }, // #state:Object - { info:String, totalDurations:UINT32, cachedDurations:UINT32, connections:UINT8 }
    "stopped":          { "get": function() { return this._stopped;         }}, // #stopped:Boolean
    "totalDurations":   { "get": function() { return this._totalDurations;  }}, // #totalDurations:UINT32
    "cachedDurations":  { "get": function() { return this._cachedDurations; }}, // #cachedDurations:UINT32
});

// --- implements ------------------------------------------
function M3U8Segment_start() {
    this["stop"]();
    this._stopped = false;
    this._fetchM3U8.fn();
}

function M3U8Segment_stop() {
    if (this._fetchM3U8.timerID) {
        clearTimeout(this._fetchM3U8.timerID);
        this._fetchM3U8.timerID = 0;
    }
    this._stopped = true;
}

function M3U8Segment_get_state() { // @ret Object - { info:String, totalDurations:UINT32, cachedDurations:UINT32, connections:UINT8 }
    return {
        "info":             _toStateString.call(this),
        "totalDurations":   this._totalDurations,
        "cachedDurations":  this._cachedDurations,
        "connections":      this._connections,
    };
}

function _fetchM3U8() { // @desc playlist.m3u8 を読み込み ts ファイルの情報をマージする
    var that = this;

    if (!this._live) { // VOD
        // Liveはm3u8を定期的に再読み込みする必要があるがVODは1度だけで良い
        if (this._totalDurations) { // already m3u8 fetched?
            if (this._view.cursor === this._view.tsIDs.length - 1) { // finished?
                this["stop"](); // auto stop
                this._endCallback();
            } else {
                if (this._stopped) { return; }
                this._fetchM3U8.timerID = setTimeout(this._fetchM3U8.fn, this._fetchM3U8.interval); // fetch timer restart.
                _fetchMediaSegments(this);
            }
            return;
        }
    }

    // Liveでは繰り返しここにくるが
    // VODではここは1度しか走らない
    // load/reload MediaPlaylist
    M3U8["load"](this._m3u8URL, function(m3u8, m3u8URL) {
        if (that._stopped) { return; }
        that._fetchM3U8.timerID = setTimeout(that._fetchM3U8.fn, that._fetchM3U8.interval); // fetch timer restart.

        if (that._m3u8 !== m3u8) { // modified?
            that._m3u8 = m3u8;

            var playlist = M3U8["parse"](m3u8, m3u8URL); // MediaPlaylistObject

            if (playlist) {
                that._m3u8Callback(m3u8URL, m3u8, playlist, false);

              //that._fetchM3U8.interval = (playlist["targetDuration"] <= 3000) ? 400 : 1000;
                that._fetchM3U8.interval = playlist["targetDuration"] * that._m3u8FetchIntervalRatio;
                that._totalDurations = that._live ? 0 : playlist["totalDurations"];
                _mergeTSInfo.call(that, playlist["mediaSegments"]);
                _fetchMediaSegments(that);
            }
        }
    }, that._errorCallback, { "timeout": 5000 });
}

function M3U8Segment_has(msec) { // @arg UINT32 - milliseconds
    return this._cachedDurations >= msec;
}

function M3U8Segment_use(msec) { // @arg UINT32 - milliseconds
                                 // @ret ChunkObject|null - { tsIDs:UIN32Array, tsInfos:TSInfoObjectArray, tsBlobs:BlobArray, chunkDurations:UINT32 }
                                 // @desc 利用可能(STATE_BLOB_FETCHED)なMediaSegmentの塊を探し、STATE_BLOB_RESERVED にする
                                 //       必要な秒数分のデータが集まったらChunkObjectに格納して返す
    if (this._cachedDurations < msec) {
        return null;
    }
    var chunkObject = {
        "tsIDs":          [], // UINT32Array - [tsID, ...] 利用可能なtsIDの配列。恐らく連番になっている
        "tsInfos":        [], // TSInfoObject - [TSInfoObject, ...]
        "tsBlobs":        [], // BlobArray - [tsBlob, ...]
        "chunkDurations": 0,  // sum of tsDurations in chunk
    };
    for (var i = this._view.cursor, iz = this._view.tsIDs.length; i < iz; ++i) {
        var tsID   = this._view.tsIDs[i]; // segmentView.tsIDs = [ tsID, ... ]
        var tsInfo = this._tsInfoMap[tsID];      // tsInfoMap = { tsID: TSInfoObject, ... }

        if (tsInfo["state"] === STATE_BLOB_FETCHED) { // STATE_BLOB_FETCHED -> STATE_BLOB_RESERVED
            tsInfo["state"] = STATE_BLOB_RESERVED;
            tsInfo["updated_at"] = Date.now();

            chunkObject["tsIDs"].push(tsID);
            chunkObject["tsInfos"].push(tsInfo);
            chunkObject["tsBlobs"].push(this._tsBlobMap[tsID]); // blobMap = { tsID: tsBlob, ... }
            chunkObject["chunkDurations"] += tsInfo["tsDuration"];

            if (chunkObject["chunkDurations"] >= msec) {
                this._cachedDurations -= chunkObject["chunkDurations"];
                this._view.cursor = i; // move cursor

                return chunkObject;
            }
        }
    }
    return null;
}

function M3U8Segment_used(tsIDs) { // @arg UINT32Array - [tsID, ...]
    var now = Date.now();

    for (var i = 0, iz = tsIDs.length; i < iz; ++i) {
        var tsID = tsIDs[i];
        if (tsID in this._tsInfoMap) {
            var tsInfo = this._tsInfoMap[tsID]; // TSInfoObject = { tsID, tsURL, tsDuration, tsRange, state, created_at, updated_at }

            if (tsInfo["state"] === STATE_BLOB_RESERVED) {
                this._tsBlobMap[tsID] = null;
                tsInfo["updated_at"] = now;
                tsInfo["state"] = STATE_USED; // STATE_BLOB_RESERVED -> STATE_USED
            }
        }
    }
    _updateCachedDurations.call(this);
}

function M3U8Segment_seek(seekTime) { // @arg UINT32 - seek target time, seek estimated time.
                                      // @ret Object|null - { tsID:UINT32, startTime:UINT32, endTime:UINT32 }
                                      // @desc playlist 全体から ts.startTime <= seekTime <= ts.endTime に一致する ts を検索する
                                      //       seek を実行すると全てのキャッシュを破棄する
    if (this._live) { return null; } // live は seek 操作不能

    for (var i = 0, iz = this._view.tsIDs.length; i < iz; ++i) { // [tsID, ...]
        var tsID      = this._view.tsIDs[i];
        var tsInfo    = this._tsInfoMap[tsID]; // TSInfoObject = { tsID, tsURL, tsDuration, tsRange, state, created_at, updated_at }
        var startTime = tsInfo["tsRange"]["startTime"];
        var endTime   = tsInfo["tsRange"]["endTime"];

        if (seekTime >= startTime && seekTime <= endTime) { // include seek time
          //var a = this._view.cursor; // point a, old head
            var b = i;                 // point b, new head

            // キャッシュ破棄戦略
            //
            // 1. a = b の場合はseek不要? -> ts が１つしかない場合は 再取得が必要なのでseekが必要
            //
            //  if (a === b) {
            //      return { "tsID": tsID, "startTime": startTime, "endTime": endTime, };
            //  }
            //
            // 2. 過去にシーク(b < a) -> 全区間を破棄する
            //      -> 0 〜 b   には STATE_USED を設定し、再読み込み対象から外す
            //      -> b 〜 end には STATE_NEW  を設定し、再読み込み対象に設定する
            //                            +-------------------+
            //                            v                   |
            //
            //        0...................b...................a....................end
            //        | STATE_USED        |     STATE_NEW     |   STATE_NEW         |
            //
            //  if (b < a) {
            //      _dispose(this, this._view.slice(0, b), STATE_USED); // 0 .. b   -> STATE_USED
            //      _dispose(this, this._view.slice(b),    STATE_NEW);  // b .. end -> STATE_NEW
            //      this._view.cursor = b;
            //  }
            //
            // 3. 未来にシーク(b > a) ->
            //      -> 0 〜 b   には STATE_USED を設定し、再読み込み対象から外す
            //      -> a 〜 b   には STATE_USED を設定し、再読み込み対象から外す
            //      -> b 〜 end には STATE_NEW  を設定し、再読み込み対象にする
            //
            //                            +-------------------+
            //                            |                   v
            //
            //        0...................a...................b....................end
            //        | STATE_USED        |   STATE_USED      |   STATE_NEW         |
            //
            //  if (b >= a) {
            //      _dispose(this, this._view.slice(0, b), STATE_USED); // 0 .. b   -> STATE_USED
            //      _dispose(this, this._view.slice(b),    STATE_NEW);  // b .. end -> STATE_NEW
            //      this._view.cursor = b;
            //  }
            //
            // 結局 1. と 2. と 3. は以下のコードで表現できる

            _disposeMediaSegments.call(this, this._view.tsIDs.slice(0, b), STATE_USED); // 0 .. b   -> STATE_USED
            _disposeMediaSegments.call(this, this._view.tsIDs.slice(b),    STATE_NEW);  // b .. end -> STATE_NEW
            this._cachedDurations = 0;
            this._view.cursor = b; // update

            _fetchMediaSegments(this); // seek直後でキャッシュが空なため素早く再取得を行う
            this["start"](); // fetch timerが停止している可能性があるため、再スタートを行う

            return {
                "tsID":      tsID,
                "startTime": startTime,
                "endTime":   endTime,
            };
        }
    }
    return null;
}

function _disposeMediaSegments(tsIDs,      // @arg UINT32Array - [tsID, ...]
                               newState) { // @arg UINT8
    var now = Date.now();

    for (var i = 0, iz = tsIDs.length; i < iz; ++i) {
        var tsID = tsIDs[i];
        if (tsID in this._tsInfoMap) {
            var tsInfo = this._tsInfoMap[tsID]; // TSInfoObject = { tsID, tsURL, tsDuration, tsRange, state, created_at, updated_at }

            // 現在の状態を無視してキャッシュを破棄する
            this._tsBlobMap[tsID] = null;
            tsInfo["updated_at"] = now;
            tsInfo["state"] = newState;
        }
    }
}

function M3U8Segment_clear() {
    if (!this._stopped) {
        M3U8Segment_stop.call(this);
    }
  //this._m3u8URL
  //this._spoolThreshold
  //this._spoolCallback
  //this._errorCallback
  //this._m3u8Callback
  //this._tsCallback
  //this._live
    // --- UNGREEDY mode properties ---
  //this._suppressMemoryUsage
  //this._maxBlobCached
  //this._maxBlobReserved
  //this._suppressConnectionUsage
  //this._connections
  //this._maxConnections
    // --- internal property ---
  //this._fetchM3U8
    this._tsBlobMap         = {};
    this._tsInfoMap         = {};
    this._totalDurations    = 0;
    this._cachedDurations   = 0;
    this._m3u8              = "";
    this._stopped           = true;
    this._view = {
        cursor: 0,
        tsIDs:  [],
    };
}

function _mergeTSInfo(mediaSegments) { // @arg MediaSegmentObjectArray - [{ tsID, tsURL, tsDuration, tsRange, tsTitle }, ...]
    // @desc playlist.m3u8 の内容のコピーを tsInfoMap にマージする
    // VODでは1度しか呼ばれない
    var now = Date.now();

    for (var i = 0, iz = mediaSegments.length; i < iz; ++i) {
        var mediaSegment = mediaSegments[i]; // MediaSegmentObject = { tsID, tsURL, tsDuration, tsRange, tsTitle }
        var tsID         = mediaSegment["tsID"];

        if ( !(tsID in this._tsInfoMap) ) { // found new id
            this._tsBlobMap[tsID] = null;
            this._tsInfoMap[tsID] = {
                "tsID":          tsID,
                "tsURL":         mediaSegment["tsURL"],
                "tsDuration":    mediaSegment["tsDuration"],
                "tsRange": {
                    "startTime": mediaSegment["tsRange"]["startTime"],
                    "endTime":   mediaSegment["tsRange"]["endTime"],
                },
                "state":         STATE_NEW,
                "created_at":    now,
                "updated_at":    now,
            };
            this._view.tsIDs.push(tsID);   // [tsID, ...]
        }
    }
}

function _fetchMediaSegments(that) {
    // @desc media segment (ts) を読み込みBlob化してキャッシュする
    // このメソッドは定期的に呼ばれる

    // 現在のキャッシュ容量が設定値を超えている場合は処理を中断
    if (that._suppressMemoryUsage) {
        var counts = _countQueueState.call(that, STATE_BLOB_FETCHED); // { STATE_NEW, STATE_LOADING, STATE_BLOB_FETCHED, STATE_BLOB_RESERVED, STATE_USED, STATE_ERROR }

        if (counts[STATE_BLOB_FETCHED]  >= that._maxBlobCached ||
            counts[STATE_BLOB_RESERVED] >= that._maxBlobReserved) {
            return;
        }
    }

    for (var i = that._view.cursor, iz = that._view.tsIDs.length; i < iz; ++i) {
        // 現在のコネクション数が設定値を超えている場合は処理を中断
        if (that._suppressConnectionUsage) {
            if (that._connections >= that._maxConnections) {
                break;
            }
        }
        var tsID   = that._view.tsIDs[i];
        var tsInfo = that._tsInfoMap[tsID]; // { tsID, tsURL, tsDuration, tsRange, state, created_at, updated_at }

        if (tsInfo["state"] === STATE_NEW) {
            tsInfo["state"] = STATE_LOADING;

            ++that._connections;
            _loadMediaSegment(that, tsID, _onloaded);
        }
    }

    function _onloaded(tsID, tsURL, tsBlob) {
        if (--that._connections < 0) {
            that._connections = 0;
        }
        that._tsCallback(tsID, tsURL, tsBlob);
        if (that._cachedDurations >= that._spoolThreshold) {
            that._spoolCallback(that._cachedDurations);
        }
    }
}

function _loadMediaSegment(that, tsID, loadedCallback) {
    // @desc ts ファイルをBlobとして読み込み、blobMapに蓄える, _cachedDurations を更新する
    var tsInfoMap = that._tsInfoMap;
    var tsURL = tsInfoMap[tsID]["tsURL"];

    FileLoader["loadBlob"](tsURL, function(tsBlob) {
        if (tsID in tsInfoMap) {
            var tsInfo = tsInfoMap[tsID];
            if (tsInfo["state"] === STATE_LOADING) { // STATE_LOADING -> STATE_BLOB_FETCHED
                tsInfo["state"] = STATE_BLOB_FETCHED;
                tsInfo["updated_at"] = Date.now();

                that._tsBlobMap[tsID] = tsBlob; // cache
                _updateCachedDurations.call(that);

                loadedCallback(tsID, tsURL, tsBlob);
            }
        }
    }, function(error, url, code) {
        tsInfoMap[tsID]["state"]      = STATE_ERROR;
        tsInfoMap[tsID]["updated_at"] = Date.now();
        that._errorCallback(error, url, code);
    });
}

function _updateCachedDurations() {
    // view.cursor から再生可能(STATE_BLOB_FETCHED)な連続したtsを探し、それらの合計を返す
    //
    //  N = STATE_NEW, L = STATE_LOADING, F = STATE_BLOB_FETCHED, B = STATE_BLOB_RESERVED, U = STATE_USED, E = STATE_ERROR
    //
    //  例: ts[0]がまだcacheされていない -> 0 を返す
    //
    //      ts[0] ts[1] ts[2] ts[3] ts[4]
    //      +----++----++----++----++----+
    //      | L  || F  || F  || F  || F  |
    //      +----++----++----++----++----+
    //
    //  例: ts[2]がまだcacheされていない -> ts[0].duration + ts[1].duration を返す(ts[3].durationは含まない)
    //
    //      ts[0] ts[1] ts[2] ts[3] ts[4]
    //      +----++----++----++----++----+
    //      | F  || F  || N  || F  || F  |
    //      +----++----++----++----++----+
    //
    //  例: ts[0]とts[1]が使用済み -> ts[2].duration + ts[3].duration を返す
    //
    //      ts[0] ts[1] ts[2] ts[3] ts[4]
    //      +----++----++----++----++----+
    //      | B  || B  || F  || F  || N  |
    //      +----++----++----++----++----+
    //
    //  例: ts[0]とts[1]が使用済み(USED) -> ts[2].duration + ts[3].duration を返す
    //
    //      ts[0] ts[1] ts[2] ts[3] ts[4]
    //      +----++----++----++----++----+
    //      | U  || U  || F  || F  || N  |
    //      +----++----++----++----++----+
    var durations = 0;

    for (var i = this._view.cursor, iz = this._view.tsIDs.length; i < iz; ++i) {
        var tsID   = this._view.tsIDs[i];
        var tsInfo = this._tsInfoMap[tsID]; // { tsID, tsURL, tsDuration, tsRange, state, created_at, updated_at }

        if (tsInfo["state"] === STATE_NEW ||          // 検索終了 -> ここまでの durations を _cachedDurations に設定する
            tsInfo["state"] === STATE_LOADING) {
            break;
        }
        if (tsInfo["state"] === STATE_BLOB_FETCHED) { // 検索続行
            durations += tsInfo["tsDuration"];
        }
    }
    this._cachedDurations = durations; // update
}

function _toStateString() {
    var stateArray = [];

    for (var i = 0, iz = this._view.tsIDs.length; i < iz; ++i) {
        var tsID = this._view.tsIDs[i];

        if (tsID in this._tsInfoMap) {
            var tsInfo = this._tsInfoMap[tsID]; // { tsID, tsURL, tsDuration, tsRange, state, created_at, updated_at }
            var s = "";

            switch (tsInfo["state"]) {
            case STATE_NEW:             s = "N"; break;
            case STATE_LOADING:         s = "L"; break;
            case STATE_BLOB_FETCHED:    s = "F"; break;
            case STATE_BLOB_RESERVED:   s = "B"; break;
            case STATE_USED:            s = "U"; break;
            case STATE_ERROR:           s = "E"; break;
            }
            if (this._view.cursor === i) {
                s = s.toLowerCase();
            }
            stateArray.push(s);
        }
    }
    return stateArray.join("");
}

function _countQueueState() { // @ret Object - { STATE_NEW, STATE_LOADING, STATE_BLOB_FETCHED, STATE_BLOB_RESERVED, STATE_USED, STATE_ERROR }
    var result = {
            0: 0, // STATE_NEW
            1: 0, // STATE_LOADING
            2: 0, // STATE_BLOB_FETCHED
            3: 0, // STATE_BLOB_RESERVED
            4: 0, // STATE_USED
            5: 0, // STATE_ERROR
        };

    for (var i = 0, iz = this._view.tsIDs.length; i < iz; ++i) {
        var tsID = this._view.tsIDs[i];

        if (tsID in this._tsInfoMap) {
            var tsInfo = this._tsInfoMap[tsID]; // { tsID, tsURL, tsDuration, tsRange, state, created_at, updated_at }

            result[tsInfo["state"]]++;
        }
    }
    return result;
}

return M3U8Segment; // return entity

});


var ModuleTestM3U8Spooler = (function(global) {

var test = new Test(["M3U8Spooler"], { // Add the ModuleName to be tested here (if necessary).
        disable:    false, // disable all tests.
        browser:    true,  // enable browser test.
        worker:     false, // enable worker test.
        node:       true,  // enable node test.
        nw:         true,  // enable nw.js test.
        el:         true,  // enable electron (render process) test.
        button:     true,  // show button.
        both:       true,  // test the primary and secondary modules.
        ignoreError:false, // ignore error.
        callback:   function() {
        },
        errorback:  function(error) {
            console.error(error.message);
        }
    });

if (IN_BROWSER || IN_NW || IN_EL || IN_WORKER || IN_NODE) {
    test.add([
        testM3U8Spooler_VOD,
    ]);
}
if (IN_BROWSER || IN_NW || IN_EL) {
    test.add([
    ]);
}
if (IN_WORKER) {
    test.add([
    ]);
}
if (IN_NODE) {
    test.add([
    ]);
}

// --- test cases ------------------------------------------
function testM3U8Spooler_VOD(test, pass, miss) {
    var spooler = new M3U8Spooler({
        autoStart: true,
        m3u8FetchIntervalRatio: 0.1,
        spoolThreshold: 1,
        updateCallback: function(cachedDurations) { // @arg UINT32
            var chunk = spooler.use(cachedDurations); // { tsIDs:UIN32Array, tsInfos:TSInfoObjectArray, tsBlobs:BlobArray, chunkDurations:UINT32 }
//          console.info("CHUNK", chunk);
            console.info(spooler.state); // { queue: String, totalDurations:UINT32, cachedDurations:UINT32, connections:UINT8 }
            // -> {
            //   queue: "UUUUUbLFFFNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN",
            //   totalDurations:  596456,
            //   cachedDurations: 0,
            //   connections:     1,
            // }
            spooler.used(chunk.tsIDs);
        },
        errorCallback: function(error, url, code) {
            console.error("errorCallback", error, url, code);
            test.done(miss());
        },
        m3u8Callback: function(url, m3u8, playlist, master) {
//          console.log("m3u8Callback", url, m3u8, playlist, master);
        },
        tsCallback: function(id, url, blob) {
            console.log("tsCallback", id, url, blob.size || blob.byteLength);
        },
        endCallback: function() {
            console.info(spooler.state);
            // -> {
            //   queue: "UUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUu",
            //   totalDurations:  596456,
            //   cachedDurations: 0,
            //   connections:     0,
            // }
            var ok = /[Uu]/.test(spooler.state.queue); // all media segment used

            spooler.stop();
            spooler.clear();
            if (ok) {
                test.done(pass());
            } else {
                test.done(miss());
            }
        },
    });

    spooler.src = IN_NODE ? "assets/bbb/playlist.m3u8" :
                            "../../assets/bbb/playlist.m3u8";
    spooler.load();
}

return test.run();

})(GLOBAL);


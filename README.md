# M3U8Spooler.js [![Build Status](https://travis-ci.org/uupaa/M3U8Spooler.js.svg)](https://travis-ci.org/uupaa/M3U8Spooler.js)

[![npm](https://nodei.co/npm/uupaa.m3u8spooler.js.svg?downloads=true&stars=true)](https://nodei.co/npm/uupaa.m3u8spooler.js/)

M3U8 Spooler

This module made of [WebModule](https://github.com/uupaa/WebModule).

## Documentation
- [Overview](https://github.com/uupaa/M3U8Spooler.js/wiki/)
- [API Spec](https://github.com/uupaa/M3U8Spooler.js/wiki/M3U8Spooler)

## Browser, NW.js and Electron

```js
<script src="<module-dir>/lib/WebModule.js"></script>
<script src="<module-dir>/lib/M3U8Spooler.js"></script>
<script>

    // VOD example
    var spooler = new M3U8Spooler({
        autoStart: true,
        spoolThreshold: 1,
        spoolCallback: function(cachedDurations) { // @arg UINT32
            var chunk = spooler.use(cachedDurations); // { tsIDs:UIN32Array, tsInfos:TSInfoObjectArray, tsBlobs:BlobArray, chunkDurations:UINT32 }
            console.info(spooler.state); // { info: String, totalDurations:UINT32, cachedDurations:UINT32, connections:UINT8 }
            // -> {
            //   info: "UUUUUbLFFFNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNNN",
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
          //console.log("m3u8Callback", url, m3u8, playlist, master);
        },
        tsCallback: function(id, url, blob) {
            console.log("tsCallback", id, url, blob.size || blob.byteLength);
        },
        endCallback: function() {
            console.info(spooler.state);
            // -> {
            //   info: "UUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUUu",
            //   totalDurations:  596456,
            //   cachedDurations: 0,
            //   connections:     0,
            // }
            spooler.stop();
            spooler.clear();
        },
    });

    spooler.src = IN_NODE ? "assets/bbb/playlist.m3u8" :
                            "../../assets/bbb/playlist.m3u8";
    spooler.load();

</script>
```


## Node.js

```js
require("<module-dir>lib/WebModule.js");
require("<module-dir>lib/M3U8Spooler.js");

```


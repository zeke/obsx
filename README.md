# OBS Scripts

Small helpers for OBS via `obs-websocket-js`.

## OBS WebSocket expectations

These scripts connect to OBS via the built-in obs-websocket server (protocol v5).

- OBS: OBS 28+ (or obs-websocket 5.x installed)
- WebSocket server: enabled in OBS
- Host/port: `ws://localhost:4455`
- Authentication: none by default (use `--password` / interactive mode if enabled in OBS)

In OBS, look for `Tools -> WebSocket Server Settings` (or similar) and set the port to `4455`.
If you change the port/host or enable a password, update the scripts accordingly.

## Commands

Add a webcam source to the current scene:

```sh
./script/add-webcam
```

Interactive mode (hit enter to accept defaults):

```sh
./script/add-webcam --interactive
```

Or:

```sh
npm run obs:add-webcam
```

Add image sources for all images in the current directory (skips ones already in the scene):

```sh
./script/add-images
```

Or:

```sh
npm run obs:add-images -- --dir "$PWD"
```

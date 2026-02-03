# obsx

A CLI for [OBS](https://obsproject.com/).

## Install

Run without installing:

```sh
npx zeke/obsx <command>
```

Install globally:

```sh
npm install -g zeke/obsx
obsx <command>
```

## Usage

This CLI connects to OBS via the built-in obs-websocket server (protocol v5).

- OBS: OBS 28+ (or obs-websocket 5.x installed)
- WebSocket server: enabled in OBS
- Default URL: `ws://localhost:4455`
- Authentication: none by default (pass `--password` if enabled in OBS)

In OBS, look for `Tools -> WebSocket Server Settings` (or similar) and set the port to `4455`.
If you change the host/port, pass `--url`. If you enable a password, pass `--password`.

Add a webcam source to the current scene:

```sh
obsx add-webcam
```

Or without installing:

```sh
npx zeke/obsx add-webcam
```

Interactive mode (hit enter to accept defaults). Uses the default `ws://localhost:4455` unless you pass `--url` / `--password`:

```sh
obsx add-webcam --interactive
```

Add image sources for all images in the current directory (skips ones already in the scene):

```sh
obsx add-images
```

Use a specific directory:

```sh
obsx add-images --dir "$PWD"
```

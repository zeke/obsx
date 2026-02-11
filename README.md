# obsx

A CLI for [OBS](https://obsproject.com/).

## Install

Run without installing:

```sh
npx @zeke/obsx <command>
```

Install globally:

```sh
npm install -g @zeke/obsx
obsx <command>
```

## Usage

This CLI connects to OBS via the built-in obs-websocket server (protocol v5).

- OBS: OBS 28+ (or obs-websocket 5.x installed)
- WebSocket server: enabled in OBS
- Default URL: `ws://localhost:4455`
- Authentication: none by default

In OBS, look for `Tools -> WebSocket Server Settings` (or similar) and set the port to `4455`.

Connection config is optional; by default it uses `ws://localhost:4455` with no password.

To override, set environment variables:

- `OBSX_URL` (default: `ws://localhost:4455`)
- `OBSX_PASSWORD` (optional)

Add a webcam source to the current scene:

```sh
obsx add-webcam
```

Or without installing:

```sh
npx obsx add-webcam
```

Interactive mode (hit enter to accept defaults):

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

## yolo

Use natural language to control OBS. This sends your prompt to Claude along with the current state of your OBS instance, and executes the generated commands.

Requires the `ANTHROPIC_API_KEY` environment variable.

```sh
obsx yolo "start recording"
obsx yolo "switch to the BRB scene"
obsx yolo "hide the webcam"
obsx yolo "add a color source called 'Red Background' to the current scene"
obsx yolo "mute the mic"
obsx yolo "set the transition to fade and make it 500ms"
obsx yolo "move the webcam to the bottom right corner"
obsx yolo "take a screenshot of the current scene"
obsx yolo "create a new scene called Interview with two color sources side by side"
```

## Development

Run locally from the repo without publishing:

```sh
npm run dev -- <command>
```

For example:

```sh
npm run dev -- add-webcam
npm run dev -- add-webcam --device iphone
npm run dev -- add-images
```

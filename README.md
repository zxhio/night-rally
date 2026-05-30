# Night Rally

H5 Canvas prototype for a top-down arcade combat racer inspired by the feel of old mobile racing games.

The current goal is not content. The current goal is driving feel.

## Run

Start a local static server from the repo root:

```sh
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

The prototype loads vehicle JSON from `data/`, so opening `index.html` directly with `file://` will not load the car data in most browsers.

## Controls

- `W` / `ArrowUp`: throttle
- `S` / `ArrowDown`: brake / reverse
- `A` / `ArrowLeft`: steer left
- `D` / `ArrowRight`: steer right
- `R`: reset

## Tuning

Most driving feel values are at the top of `src/main.js` in `DEFAULT_TUNING`.
Vehicle speed and size data live in `data/cars/`.

Change one value, refresh the browser, drive a few laps, then keep or revert it.

## Docs

- [Driving model](docs/driving-model.md)
- [Vehicle baseline](docs/vehicle-baseline.md)

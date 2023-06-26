# leaflet-tiles
Generate leaflet tiles from an input image

## Usage

npm start "path/to/image.png"

You can also create a .env file which specifies any of the following variables:

IMAGE_PATH: The path to the large image that will be used to generate tiles. If IMAGE_PATH is provided, it is not necessary to supply a path via command line argument.

MAP_NAME: The folder name in which to store generated tiles.

MAX_ZOOM: The maximum zoom level for which to generate tiles (zero-indexed).

MIN_ZOOM: The minimum zoom level for which to generate tiles (zero-indexed).
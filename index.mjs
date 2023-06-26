import fs from 'fs/promises'
import path from 'path'

import sharp from 'sharp'
import ora from 'ora'
import dotenv from 'dotenv'

dotenv.config()

const imagePath = process.env.IMAGE_PATH || process.argv[2]
let inputImage = sharp(imagePath)

let metadata = inputImage.metadata()

const extendWidth = metadata.width % 256
const extendHeight = metadata.height % 256
if (extendWidth || extendHeight) {
  inputImage = inputImage.extend({
    right: extendWidth,
    bottom: extendHeight,
    background: {r: 1, g: 0, b: 0, alpha: 0}
  })
}

const maxZoom = Math.min(
  process.env.MAX_ZOOM,
  Math.max(metadata.width + extendWidth, metadata.height + extendHeight) / 256 -
    1
)
const minZoom = process.env.MIN_ZOOM || 0

fs.mkdir('output').catch(error => {
  if (!error.code === 'EEXIST') {
    console.log(error)
  }
})

const mapName =
  process.env.MAP_NAME ||
  imagePath.substring(
    imagePath.lastIndexOf(path.sep) + 1,
    imagePath.lastIndexOf('.')
  )
fs.mkdir(`output/${mapName}`).catch(error => {
  if (!error.code === 'EEXIST') {
    console.log(error)
  }
})

let totalTiles = 0
for (let z = minZoom + 1; z <= maxZoom + 1; z++) {
  totalTiles += z * z
}

const tiles = []
let completedTiles = 0
const zoomSpinner = ora({text: `${mapName}`, prefixText: '0.00%'})
for (let z = minZoom; z <= maxZoom; z++) {
  zoomSpinner.start(`${mapName} | z ${z}/${maxZoom}`)
  const scaledMap = sharp(
    inputImage
      .clone()
      .resize({
        width: (z + 1) * 256,
        height: (z + 1) * 256,
        fit: sharp.fit.contain,
        position: sharp.gravity.northwest,
        background: {r: 1, g: 0, b: 0, alpha: 0}
      })
      .toBuffer()
  )
  fs.mkdir(`output/${mapName}/${z}`).catch(error => {
    if (!error.code === 'EEXIST') {
      console.log(error)
    }
  })
  for (let x = 0; x <= z; x++) {
    fs.mkdir(`output/${mapName}/${z}/${x}`).catch(error => {
      if (!error.code === 'EEXIST') {
        console.log(error)
      }
    })
    for (let y = 0; y <= z; y++) {
      tiles.push(
        scaledMap
          .clone()
          .extract({
            left: x * 256,
            top: y * 256,
            width: 256,
            height: 256
          })
          .toFile(`output/${mapName}/${z}/${x}/${y}.png`)
          .then(() => {
            zoomSpinner.suffixText = `| x ${x}/${z} | y ${y}/${z}`
            completedTiles++
            zoomSpinner.prefixText = `${(
              Math.round((completedTiles / totalTiles) * 10000) / 100
            ).toFixed(2)}%`
          })
      )
    }
    if (tiles.length > 100) {
      Promise.all(tiles)
      tiles.length = 0
    }
  }
  zoomSpinner.suffixText = ''
  zoomSpinner.prefixText = ''
}
zoomSpinner.succeed()

import fs from 'fs/promises';
import path from 'path';

import sharp from 'sharp';
import ora from 'ora';
import dotenv from 'dotenv';

dotenv.config();

(async () => {
    const tileSize = isNaN(process.env.TILE_SIZE) ? 256 : parseInt(process.env.TILE_SIZE);
    const imagePath = process.env.IMAGE_PATH || process.argv[2];
    let inputImage = sharp(imagePath, {unlimited: true, limitInputPixels: false}).png();
    
    let metadata = await inputImage.metadata();
    
    let fullSize = Math.max(metadata.width, metadata.height);
    let extend = fullSize % tileSize;
    if (((fullSize + extend) / tileSize) % 2) {
        extend += tileSize;
    }
    fullSize += extend;

    if (extend) {
        console.log(`Padding source image from ${metadata.width}x${metadata.height} to ${fullSize}x${fullSize}`);
        inputImage = sharp(await inputImage.resize({
            width: fullSize,
            height: fullSize,
            fit: sharp.fit.contain,
            position: sharp.gravity.northwest,
            background: { r: 1, g: 0, b: 0, alpha: 0 },
        }).toBuffer());
    }
    
    let zoomLevels = 0;
    for (let imageWidth = fullSize; imageWidth >= tileSize; imageWidth /= 2) {
        zoomLevels++;
    }
    
    const maxZoom = Math.min(isNaN(process.env.MAX_ZOOM) ? zoomLevels : parseInt(process.env.MAX_ZOOM), zoomLevels - 1);
    const minZoom = process.env.MIN_ZOOM || 0;
    
    await fs.mkdir('output').catch(error => {
        if (!error.code === 'EEXIST') {
            console.log(error);
        }
    });
    
    const mapName = process.env.MAP_NAME || imagePath.substring(imagePath.lastIndexOf(path.sep)+1, imagePath.lastIndexOf('.'));
    await fs.mkdir(`output/${mapName}`).catch(error => {
        if (!error.code === 'EEXIST') {
            console.log(error);
        }
    });
    
    let totalTiles = 0;
    for (let z = minZoom; z <= maxZoom; z++) {
        totalTiles += Math.pow((tileSize * Math.pow(2,z)) / tileSize, 2);
    }
    
    const tiles = [];
    const tileCheck = async () => {
        if (tiles.length > 32) {
            await Promise.all(tiles);
            tiles.length = 0;
        }
    };
    let completedTiles = 0;
    const zoomSpinner = ora({text: mapName, prefixText: '0.00%'});
    for (let z = minZoom; z <= maxZoom; z++) {
        const scaledSize = tileSize * Math.pow(2,z);
        zoomSpinner.start(`${mapName} | z ${z}/${maxZoom}`);
        const scaledMap = sharp(await inputImage.clone().resize({
            width: scaledSize,
            height: scaledSize,
            fit: sharp.fit.contain,
            position: sharp.gravity.northwest,
            background: { r: 1, g: 0, b: 0, alpha: 0 },
        }).toBuffer(), {unlimited: true, limitInputPixels: false});
        await fs.mkdir(`output/${mapName}/${z}`).catch(error => {
            if (!error.code === 'EEXIST') {
                console.log(error);
            }
        });
        for (let x = 0; x < scaledSize / tileSize; x++) {
            await fs.mkdir(`output/${mapName}/${z}/${x}`).catch(error => {
                if (!error.code === 'EEXIST') {
                    console.log(error);
                }
            });
            for (let y = 0; y < scaledSize / tileSize; y++) {
                tiles.push(scaledMap.clone().extract({
                    left: x * tileSize,
                    top: y * tileSize,
                    width: tileSize,
                    height: tileSize,
                }).toFile(`output/${mapName}/${z}/${x}/${y}.png`).then(() => {
                    zoomSpinner.suffixText = `| x ${x}/${(scaledSize / tileSize) - 1} | y ${y}/${(scaledSize / tileSize) - 1}`;
                    completedTiles++;
                    zoomSpinner.prefixText = `${(Math.round((completedTiles / totalTiles) * 10000) / 100).toFixed(2)}%`;
                }));
                await tileCheck();
            }
        }
        zoomSpinner.suffixText = '';
        zoomSpinner.prefixText = '';
    }
    zoomSpinner.succeed(mapName);
})();

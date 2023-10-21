import { parentPort } from 'worker_threads';

import sharp from 'sharp';

parentPort.once('message', async (options) => {
    const mapName = options.mapName;
    const tileSize = parseInt(options.tileSize);
    const x = parseInt(options.x);
    const y = parseInt(options.y);
    const z = parseInt(options.z);
    const inputImage = sharp(options.image, {unlimited: true, limitInputPixels: false});
    const metadata = await inputImage.metadata();
    
    const scaledSize = tileSize * Math.pow(2, z);
    
    const filePath = `output/${mapName}/${z}/${x}/${y}.png`;
    
    if (scaledSize !== metadata.width || scaledSize !== metadata.height) {
        await inputImage.extract({
            left: x * tileSize,
            top: y * tileSize,
            width: tileSize,
            height: tileSize
        }).toFile(filePath);
    }
    
    parentPort.postMessage({message: 'complete'});
});

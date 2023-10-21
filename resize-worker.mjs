import { parentPort } from 'worker_threads';

import sharp from 'sharp';

parentPort.once('message', async (options) => {
    const tileSize = parseInt(options.tileSize);
    const z = parseInt(options.z);
    const inputImage = sharp(options.image, {unlimited: true, limitInputPixels: false});
    const metadata = await inputImage.metadata();
    
    const scaledSize = tileSize * Math.pow(2, z);
    
    if (scaledSize !== metadata.width || scaledSize !== metadata.height) {
        inputImage.resize({
            width: scaledSize,
            height: scaledSize,
            fit: sharp.fit.contain,
            position: sharp.gravity.northwest,
            background: {r: 1, g: 0, b: 0, alpha: 0}
        });
    }

    const imageBuffer = await inputImage.toBuffer();
    
    parentPort.postMessage({message: 'complete', image: imageBuffer.buffer});
});

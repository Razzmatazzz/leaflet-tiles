import fs from 'fs/promises';
import path from 'path';

import sharp from 'sharp';
import ora from 'ora';
import promptSync from 'prompt-sync';
import dotenv from 'dotenv';
import { DateTime } from 'luxon';

dotenv.config();
const prompt = promptSync();

(async () => {
    let imagePath = process.env.IMAGE_PATH || process.argv[2];
    if (!imagePath) {
        imagePath = '../tarkov-dev-src-maps/interactive';
        console.log(`IMAGE_PATH not set, defaulting to ${imagePath}`);
    }
    const minTileSize = process.env.MIN_TILE_SIZE || 100;
    const maxTileSize = process.env.MAX_TILE_SIZE || 400;
    const testOutput = Boolean(process.env.TEST_OUTPUT || false);
    if ((await fs.lstat(imagePath)).isDirectory()) {
        const imageExtensions = ['jpg', 'jpeg', 'png', 'webp'];
        const files = await fs
            .readdir(imagePath)
            .then(files =>
                files.filter(filename =>
                    imageExtensions.some(ext =>
                        filename.toLocaleLowerCase().endsWith(`.${ext}`)
                    )
                )
            );
        if (files.length < 1) {
            console.log(`The folder ${imagePath} does not contain any images`);
            return;
        }
        console.log('Select input image:');
        for (let i = 0; i < files.length; i++) {
            console.log(`${i + 1}. ${files[i]}`);
        }
        const index = prompt(`[1-${files.length}]: `);
        if (isNaN(index) || index < 1 || index > files.length) {
            console.log(`${index} is an invalid selection`);
            return;
        }
        imagePath = path.join(imagePath, files[parseInt(index - 1)]);
    }
    let inputImage = sharp(imagePath, {
        unlimited: true,
        limitInputPixels: false
    }).png();

    let mapName =
        process.env.MAP_NAME ||
        imagePath.substring(
            imagePath.lastIndexOf(path.sep) + 1,
            imagePath.lastIndexOf('.')
        );
    const newMapName = prompt(`Output folder (${mapName}): `, mapName);
    mapName = newMapName.replace(' ', '_');

    let metadata = await inputImage.metadata();
    console.log(`Image size: ${metadata.width}x${metadata.height}`);

    let rotation = prompt('Rotate image 90, 180, or 270 degrees (0): ', 0);
    if (rotation && !isNaN(rotation)) {
        rotation = parseInt(rotation);
        if (![90, 180, 270].includes(rotation)) {
            console.log(`${rotation} is not a valid rotation`);
        }
        const rotateSpinner = ora(`Rotating image ${rotation} degrees`);
        rotateSpinner.start();
        inputImage = sharp(await inputImage.rotate(rotation).toBuffer(), {
            unlimited: true,
            limitInputPixels: false
        });
        if (testOutput) {
            rotateSpinner.suffixText = 'saving test output...';
            await inputImage.toFile('./output/test_rotated.jpg');
            rotateSpinner.suffixText = '';
        }
        rotateSpinner.succeed();
        if (rotation === 90 || rotation === 270) {
            const h = metadata.height;
            metadata.height = metadata.width;
            metadata.width = h;
        }
    }

    let fullSize = Math.max(metadata.width, metadata.height);

    let tileSize = 0;
    let tileConfig = {difference: Number.MAX_SAFE_INTEGER};
    let tileResize = false;
    tileLoop: for (let i = minTileSize; i <= maxTileSize; i++) {
        for (let pow = 0; pow < 100; pow++) {
            if (i * Math.pow(2, pow) === fullSize) {
                tileConfig.size = i;
                tileConfig.pow = pow;
                tileConfig.difference = 0;
                tileSize = i;
                break tileLoop;
            }
        }
    }
    if (!tileSize) {
        tileResize = {
            grow: {difference: Number.MAX_SAFE_INTEGER},
            shrink: {difference: Number.MAX_SAFE_INTEGER}
        };
        for (let i = minTileSize; i <= maxTileSize; i++) {
            for (let pow = 0; pow < 100; pow++) {
                const resized = i * Math.pow(2, pow);
                let resizeType = tileResize.grow;
                if (resized < fullSize) {
                    resizeType = tileResize.shrink;
                }
                const diff = Math.abs(resized - fullSize);
                if (diff < resizeType.difference) {
                    resizeType.size = i;
                    resizeType.pow = pow;
                    resizeType.difference = diff;
                }
            }
        }
        if (tileResize.grow.difference <= tileResize.grow.size) {
            tileConfig = tileResize.grow;
        } else {
            tileConfig =
                tileResize.grow.difference <= tileResize.shrink.difference
                    ? tileResize.grow
                    : tileResize.shrink;
        }
        if (tileConfig.difference < Number.MAX_SAFE_INTEGER) {
            tileSize = tileConfig.size;
        } else {
            tileSize = isNaN(process.env.TILE_SIZE)
                ? 256
                : parseInt(process.env.TILE_SIZE);
        }
    }
    if (tileResize) {
        console.log(
            `Image must be resized. Closest grow and shrink sizes for tiles ${minTileSize}-${maxTileSize}px:`
        );
        console.log(
            `Grow: ${tileResize.grow.size}px tiles with ${
                tileResize.grow.size * Math.pow(2, tileResize.grow.pow)
            }px total size (+${
                tileResize.grow.size * Math.pow(2, tileResize.grow.pow) -
                fullSize
            }px padding)`
        );
        console.log(
            `Shrink: ${tileResize.shrink.size}px tiles with ${
                tileResize.shrink.size * Math.pow(2, tileResize.shrink.pow)
            }px total size (${
                tileResize.shrink.size * Math.pow(2, tileResize.shrink.pow) -
                fullSize
            }px)`
        );
    }
    const newTileSize = prompt(`Tile size (${tileSize}): `, tileSize);
    if (isNaN(newTileSize)) {
        console.log(`${newTileSize} is not a valid tile size`);
        return;
    }
    if (parseInt(newTileSize) !== tileConfig.size) {
        tileConfig.size = parseInt(newTileSize);
        tileConfig.difference = Number.MAX_SAFE_INTEGER;
        tileConfig.pow = 0;
        for (let pow = 0; pow < 100; pow++) {
            const diff = Math.abs(
                tileConfig.size * Math.pow(2, pow) - fullSize
            );
            if (diff < tileConfig.difference) {
                tileConfig.pow = pow;
                tileConfig.difference = diff;
            }
        }
    }

    tileSize = tileConfig.size;

    if (tileConfig.difference) {
        const resized = tileSize * Math.pow(2, tileConfig.pow);
        const resizeSpinner = ora();
        if (resized < fullSize) {
            resizeSpinner.start(
                `Shrinking source image to fit ${resized}x${resized}`
            );
            inputImage = sharp(
                await inputImage
                    .resize({
                        width: resized,
                        height: resized,
                        fit: sharp.fit.contain,
                        position: sharp.gravity.northwest,
                        background: {r: 1, g: 0, b: 0, alpha: 0}
                    })
                    .toBuffer()
            );
        } else {
            resizeSpinner.start(
                `Padding source image to fit ${resized}x${resized}`
            );
            const xPadding = resized - metadata.width;
            const yPadding = resized - metadata.height;
            const top = Math.ceil(yPadding / 2);
            const bottom = Math.floor(yPadding / 2);
            const left = Math.ceil(xPadding / 2);
            const right = Math.floor(xPadding / 2);
            inputImage = sharp(
                await inputImage
                    .extend({
                        top,
                        right,
                        bottom,
                        left,
                        background: {r: 1, g: 0, b: 0, alpha: 0}
                    })
                    .toBuffer(),
                {
                    unlimited: true,
                    limitInputPixels: false
                }
            );
        }
        if (testOutput) {
            resizeSpinner.suffixText = 'saving test output...';
            await inputImage.toFile('./output/test_resized.jpg');
            resizeSpinner.suffixText = '';
        }
        resizeSpinner.succeed();
        fullSize = resized;
    }

    let zoomLevels = 0;
    for (let imageWidth = fullSize; imageWidth >= tileSize; imageWidth /= 2) {
        zoomLevels++;
    }

    const maxZoom = Math.min(
        isNaN(process.env.MAX_ZOOM)
            ? zoomLevels
            : parseInt(process.env.MAX_ZOOM),
        zoomLevels - 1
    );
    const minZoom = process.env.MIN_ZOOM || 0;

    await fs.mkdir('output').catch(error => {
        if (!error.code === 'EEXIST') {
            console.log(error);
        }
    });

    await fs.mkdir(`output/${mapName}`).catch(error => {
        if (!error.code === 'EEXIST') {
            console.log(error);
        }
    });

    await fs.writeFile(
        `output/${mapName}/config.json`,
        JSON.stringify(
            {
                tileSize: tileSize,
                minZoom: minZoom,
                maxZoom: maxZoom
            },
            null,
            4
        )
    );

    let totalTiles = 0;
    for (let z = minZoom; z <= maxZoom; z++) {
        totalTiles += Math.pow((tileSize * Math.pow(2, z)) / tileSize, 2);
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
    zoomSpinner.start();
    const startTime = DateTime.now();
    for (let z = minZoom; z <= maxZoom; z++) {
        const scaledSize = tileSize * Math.pow(2, z);
        zoomSpinner.suffixText = `| z ${z}/${maxZoom} Resizing to ${scaledSize}`;
        const scaledMap = sharp(
            await inputImage
                .clone()
                .resize({
                    width: scaledSize,
                    height: scaledSize,
                    fit: sharp.fit.contain,
                    position: sharp.gravity.northwest,
                    background: {r: 1, g: 0, b: 0, alpha: 0}
                })
                .toBuffer(),
            {unlimited: true, limitInputPixels: false}
        );
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
                tiles.push(
                    scaledMap
                        .clone()
                        .extract({
                            left: x * tileSize,
                            top: y * tileSize,
                            width: tileSize,
                            height: tileSize
                        })
                        .toFile(`output/${mapName}/${z}/${x}/${y}.png`)
                        .then(() => {
                            zoomSpinner.suffixText = `| z ${z}/${maxZoom} | x ${x}/${
                                scaledSize / tileSize - 1
                            } | y ${y}/${scaledSize / tileSize - 1}`;
                            completedTiles++;
                            zoomSpinner.prefixText = `${(
                                Math.round(
                                    (completedTiles / totalTiles) * 10000
                                ) / 100
                            ).toFixed(2)}%`;
                        })
                );
                await tileCheck();
            }
        }
        zoomSpinner.suffixText = '';
        zoomSpinner.prefixText = '';
    }
    zoomSpinner.suffixText = `completed ${DateTime.now().toRelative({ base: startTime})}`;
    zoomSpinner.succeed();
})();

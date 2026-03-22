import { createCanvas, loadImage } from "@napi-rs/canvas";
import GIFEncoder from "gif-encoder-2";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function seededRandom(seed) {
  let s = seed >>> 0;
  return function () {
    s = Math.imul(1664525, s) + 1013904223 >>> 0;
    return s / 0x100000000;
  };
}

function drawLightningBolt(ctx, width, height, seed) {
  const rand = seededRandom(seed);
  const startX = width * (0.15 + rand() * 0.7);

  ctx.save();
  ctx.shadowColor = "#aaddff";
  ctx.shadowBlur = 16;

  for (let pass = 0; pass < 2; pass++) {
    ctx.strokeStyle = pass === 0
      ? "rgba(255, 255, 255, 0.85)"
      : "rgba(150, 210, 255, 0.6)";
    ctx.lineWidth = pass === 0 ? 1.5 : 3;
    ctx.beginPath();
    ctx.moveTo(startX, 0);

    let x = startX;
    let y = 0;
    const steps = 9 + Math.floor(rand() * 5);

    for (let i = 1; i <= steps; i++) {
      x += (rand() - 0.5) * 36;
      y = (height / steps) * i * (0.7 + rand() * 0.6);
      ctx.lineTo(x, Math.min(y, height));
      if (y >= height) break;
    }
    ctx.stroke();
  }
  ctx.restore();
}

async function generateThunderGif() {
  const srcImg = await loadImage(path.join(__dirname, "banner.png"));
  const width = srcImg.width;
  const height = srcImg.height;

  const encoder = new GIFEncoder(width, height, "neuquant", true);
  encoder.setDelay(70);
  encoder.setRepeat(0);
  encoder.setQuality(10);
  encoder.start();

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const FRAMES = 20;
  const BOLT_FRAMES = [0, 1, 7, 8, 14, 15];

  for (let f = 0; f < FRAMES; f++) {
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(srcImg, 0, 0, width, height);

    const isBolt = BOLT_FRAMES.includes(f);
    const isFlash = f === 0 || f === 7 || f === 14;

    if (isFlash) {
      ctx.fillStyle = "rgba(180, 220, 255, 0.22)";
      ctx.fillRect(0, 0, width, height);
    }

    if (isBolt) {
      drawLightningBolt(ctx, width, height, f * 1337 + 42);
    }

    const rimAlpha = isFlash ? 0.95 : isBolt ? 0.5 : 0.08 + 0.06 * Math.sin((f / FRAMES) * Math.PI * 4);
    ctx.strokeStyle = `rgba(100, 200, 255, ${rimAlpha})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(2, 2, width - 4, height - 4);

    const imageData = ctx.getImageData(0, 0, width, height);
    encoder.addFrame(imageData.data);
  }

  encoder.finish();
  const buffer = encoder.out.getData();
  fs.writeFileSync(path.join(__dirname, "banner-thunder.gif"), buffer);
  console.log("✅ Generated banner-thunder.gif");
}

generateThunderGif().catch(console.error);

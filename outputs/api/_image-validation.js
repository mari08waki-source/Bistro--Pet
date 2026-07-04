function validationError(message, code = "IMAGE_PROVIDER_INVALID_RESPONSE") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function hasPngSignature(buffer) {
  return buffer.length > 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47;
}

function hasJpegSignature(buffer) {
  return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[buffer.length - 2] === 0xff && buffer[buffer.length - 1] === 0xd9;
}

function hasWebpSignature(buffer) {
  return buffer.length > 12
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WEBP";
}

export function validateGeneratedImageBuffer(imageBuffer, { mode = process.env.IMAGE_GENERATION_MODE } = {}) {
  if (!Buffer.isBuffer(imageBuffer) || !imageBuffer.length) {
    throw validationError("Image provider returned an empty image.");
  }

  if (mode === "live" && imageBuffer.length < 1024) {
    throw validationError("Image provider returned an invalid tiny image.");
  }

  const hasKnownSignature = hasPngSignature(imageBuffer) || hasJpegSignature(imageBuffer) || hasWebpSignature(imageBuffer);
  if (!hasKnownSignature) {
    throw validationError("Image provider returned an unsupported image format.");
  }

  return imageBuffer;
}

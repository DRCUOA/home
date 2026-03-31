/* eslint-disable no-var */
var cvReady = false;
var cvLoadingPromise = null;

function ensureCV() {
  if (cvReady) return Promise.resolve();
  if (cvLoadingPromise) return cvLoadingPromise;

  cvLoadingPromise = new Promise(function (resolve, reject) {
    try {
      importScripts("https://docs.opencv.org/4.10.0/opencv.js");
    } catch (e) {
      cvLoadingPromise = null;
      reject(new Error("Failed to download OpenCV: " + e.message));
      return;
    }

    var elapsed = 0;
    var timer = setInterval(function () {
      elapsed += 100;
      if (typeof cv !== "undefined" && cv.Mat) {
        cvReady = true;
        clearInterval(timer);
        resolve();
      } else if (elapsed > 60000) {
        clearInterval(timer);
        cvLoadingPromise = null;
        reject(new Error("OpenCV WASM init timed out"));
      }
    }, 100);
  });

  return cvLoadingPromise;
}

function orderCorners(pts) {
  var sums = pts.map(function (p) {
    return p.x + p.y;
  });
  var diffs = pts.map(function (p) {
    return p.y - p.x;
  });
  return [
    pts[sums.indexOf(Math.min.apply(null, sums))],
    pts[diffs.indexOf(Math.min.apply(null, diffs))],
    pts[sums.indexOf(Math.max.apply(null, sums))],
    pts[diffs.indexOf(Math.max.apply(null, diffs))],
  ];
}

function detectDocument(buffer, width, height) {
  var src = new cv.Mat(height, width, cv.CV_8UC4);
  src.data.set(new Uint8Array(buffer));

  var gray = new cv.Mat();
  var blurred = new cv.Mat();
  var edges = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
  cv.Canny(blurred, edges, 50, 150);

  var kernel = cv.Mat.ones(3, 3, cv.CV_8U);
  cv.dilate(edges, edges, kernel);

  var contours = new cv.MatVector();
  var hierarchy = new cv.Mat();
  cv.findContours(
    edges,
    contours,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_SIMPLE
  );

  var imgArea = src.rows * src.cols;
  var maxArea = 0;
  var bestApprox = null;

  for (var i = 0; i < contours.size(); i++) {
    var contour = contours.get(i);
    var area = cv.contourArea(contour);
    if (area < imgArea * 0.05) continue;

    var peri = cv.arcLength(contour, true);
    var approx = new cv.Mat();
    cv.approxPolyDP(contour, approx, 0.02 * peri, true);

    if (approx.rows === 4 && area > maxArea) {
      if (bestApprox) bestApprox.delete();
      maxArea = area;
      bestApprox = approx;
    } else {
      approx.delete();
    }
  }

  src.delete();
  gray.delete();
  blurred.delete();
  edges.delete();
  kernel.delete();
  contours.delete();
  hierarchy.delete();

  if (!bestApprox) return null;

  var pts = [];
  for (var j = 0; j < 4; j++) {
    pts.push({
      x: bestApprox.data32S[j * 2],
      y: bestApprox.data32S[j * 2 + 1],
    });
  }
  bestApprox.delete();
  return orderCorners(pts);
}

function applyTransform(buffer, width, height, corners) {
  var src = new cv.Mat(height, width, cv.CV_8UC4);
  src.data.set(new Uint8Array(buffer));

  var tl = corners[0],
    tr = corners[1],
    br = corners[2],
    bl = corners[3];

  var widthTop = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  var widthBot = Math.hypot(br.x - bl.x, br.y - bl.y);
  var outW = Math.round(Math.max(widthTop, widthBot));

  var heightL = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  var heightR = Math.hypot(br.x - tr.x, br.y - tr.y);
  var outH = Math.round(Math.max(heightL, heightR));

  var srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y,
  ]);
  var dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0, outW, 0, outW, outH, 0, outH,
  ]);

  var M = cv.getPerspectiveTransform(srcPts, dstPts);
  var dst = new cv.Mat();
  cv.warpPerspective(src, dst, M, new cv.Size(outW, outH));

  var resultW = dst.cols;
  var resultH = dst.rows;
  var copy = new Uint8Array(dst.data.length);
  copy.set(dst.data);

  src.delete();
  dst.delete();
  M.delete();
  srcPts.delete();
  dstPts.delete();

  return { buffer: copy.buffer, width: resultW, height: resultH };
}

self.onmessage = function (e) {
  var msg = e.data;

  if (msg.type === "preload") {
    ensureCV()
      .then(function () {
        self.postMessage({ type: "preload-done", id: msg.id || 0 });
      })
      .catch(function (err) {
        self.postMessage({ type: "error", error: err.message, id: msg.id || 0 });
      });
    return;
  }

  ensureCV()
    .then(function () {
      if (msg.type === "detect") {
        var corners = detectDocument(msg.buffer, msg.width, msg.height);
        self.postMessage({ type: "detect-result", corners: corners, id: msg.id });
      } else if (msg.type === "transform") {
        var result = applyTransform(
          msg.buffer,
          msg.width,
          msg.height,
          msg.corners
        );
        self.postMessage(
          {
            type: "transform-result",
            buffer: result.buffer,
            width: result.width,
            height: result.height,
            id: msg.id,
          },
          [result.buffer]
        );
      }
    })
    .catch(function (err) {
      self.postMessage({ type: "error", error: err.message, id: msg.id });
    });
};

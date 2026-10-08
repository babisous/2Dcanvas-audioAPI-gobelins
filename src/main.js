import "./style.css";
import GUI from "lil-gui";

const canvas = document.querySelector("canvas");
const context = canvas.getContext("2d");

let width;
let height;
const pixelRatio = Math.min(window.devicePixelRatio, 2);

let frameRequest;
let time;
let delta = 0;
let elapsed = 0;
let frame = 0;
let stepTimer = 0;
let currentArc;

const audio = new Audio("/audio/son.mp3");
audio.loop = true;

let audioContext;
let analyser;
let frequencies;
let waveform;

const params = {
  color: "#ff9604",
  opacity: 1,
  lineWidth: 1,
  background: "#000000",
  minRadius: 10,
  maxRadius: 30,
  stepsPerSecond: 1,
  startFreq: 0,
  endFreq: 1024,
  volume: 1,
  sensitivity: 1,
  playPause: toggleAudio,
  clear: clearCanvas,
  recenter: recenterPen,
};

const pen = {
  x: 0,
  y: 0,
  direction: -Math.PI / 2,
};

window.addEventListener("resize", resize);
canvas.addEventListener("click", toggleAudio);

resize();
recenterPen();
initGUI();

function initGUI() {
  const gui = new GUI({ title: "AudioArt" });

  const trait = gui.addFolder("Trait");
  trait.addColor(params, "color").name("couleur");
  trait.add(params, "opacity", 0.01, 1, 0.01).name("opacité");
  trait.add(params, "lineWidth", 0.5, 10, 0.5).name("épaisseur");
  trait.addColor(params, "background").name("fond").onChange(updateBackground);

  const arcs = gui.addFolder("Arcs");
  arcs.add(params, "minRadius", 0, 50, 1).name("rayon min");
  arcs.add(params, "maxRadius", 1, 200, 1).name("rayon max");
  arcs.add(params, "stepsPerSecond", 0.1, 10, 0.1).name("Steps / Seconde");

  const son = gui.addFolder("Son");
  son.add(params, "volume", 0, 1, 0.01).onChange(function (value) {
    audio.volume = value;
  });
  son.add(params, "sensitivity", 0.1, 10, 0.1).name("sensibilité");
  son.add(params, "startFreq", 0, 1023, 1).name("fréquence début");
  son.add(params, "endFreq", 1, 1024, 1).name("fréquence fin");
  son.add(params, "playPause").name("lecture / pause");

  const actions = gui.addFolder("Actions");
  actions.add(params, "clear").name("effacer");
  actions.add(params, "recenter").name("recentrer le stylo");
}

function updateBackground() {
  document.body.style.background = params.background;
}

function clearCanvas() {
  context.clearRect(0, 0, width, height);
}

function recenterPen() {
  pen.x = width / 2;
  pen.y = height / 2;
  pen.direction = -Math.PI / 2;
  currentArc = undefined;
}

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;

  canvas.width = width * pixelRatio;
  canvas.height = height * pixelRatio;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function initAudio() {
  audioContext = new AudioContext();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;

  const source = audioContext.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(audioContext.destination);

  frequencies = new Uint8Array(analyser.frequencyBinCount);
  waveform = new Uint8Array(analyser.fftSize);
}

function toggleAudio() {
  if (audioContext === undefined) {
    initAudio();
  }

  if (audio.paused) {
    audioContext.resume();
    audio.play();
    play();
  } else {
    audio.pause();
    pause();
  }
}

function render() {
  const now = Date.now();
  delta = (now - time) / 1000;
  time = now;
  elapsed = elapsed + delta;
  frame = frame + 1;

  analyser.getByteFrequencyData(frequencies);
  analyser.getByteTimeDomainData(waveform);

  context.globalAlpha = params.opacity;
  context.lineWidth = params.lineWidth;
  context.strokeStyle = params.color;

  stepTimer = stepTimer + delta;

  const stepDuration = 1 / params.stepsPerSecond;

  if (currentArc === undefined) {
    currentArc = prepareArc(readSound());
  }

  let progress = stepTimer / stepDuration;
  if (progress > 1) {
    progress = 1;
  }

  drawArcPart(currentArc, currentArc.drawn, progress);
  currentArc.drawn = progress;

  if (stepTimer >= stepDuration) {
    stepTimer = stepTimer - stepDuration;
    movePen(currentArc);
    currentArc = undefined;
  }

  context.globalAlpha = 1;
}

function prepareArc(arc) {
  let side;
  if (arc.clockwise) {
    side = Math.PI / 2;
  } else {
    side = -Math.PI / 2;
  }

  arc.centerX = pen.x + Math.cos(pen.direction + side) * arc.radius;
  arc.centerY = pen.y + Math.sin(pen.direction + side) * arc.radius;

  arc.sweep = arc.quarters * (Math.PI / 2);

  arc.startAngle = pen.direction - side;
  if (arc.clockwise) {
    arc.endAngle = arc.startAngle + arc.sweep;
  } else {
    arc.endAngle = arc.startAngle - arc.sweep;
  }

  arc.drawn = 0;

  return arc;
}

function drawArcPart(arc, from, to) {
  const angleRange = arc.endAngle - arc.startAngle;
  const fromAngle = arc.startAngle + angleRange * from;
  const toAngle = arc.startAngle + angleRange * to;

  context.beginPath();
  context.arc(
    arc.centerX,
    arc.centerY,
    arc.radius,
    fromAngle,
    toAngle,
    !arc.clockwise,
  );
  context.stroke();
}

function movePen(arc) {
  pen.x = arc.centerX + Math.cos(arc.endAngle) * arc.radius;
  pen.y = arc.centerY + Math.sin(arc.endAngle) * arc.radius;

  if (arc.clockwise) {
    pen.direction = pen.direction + arc.sweep;
  } else {
    pen.direction = pen.direction - arc.sweep;
  }
}

function readSound() {
  let clockwise = false;
  if (waveform[0] > 128) {
    clockwise = true;
  }

  let start = params.startFreq;
  let end = params.endFreq;
  if (end <= start) {
    end = start + 1;
  }

  let total = 0;
  for (let i = start; i < end; i++) {
    total = total + frequencies[i];
  }
  const average = total / (end - start);

  let quarters;
  if (average < 64) {
    quarters = 1;
  } else if (average < 128) {
    quarters = 2;
  } else if (average < 192) {
    quarters = 3;
  } else {
    quarters = 4;
  }

  let gap = 0;
  for (let i = 0; i < waveform.length; i++) {
    gap = gap + Math.abs(waveform[i] - 128);
  }
  let volume = (gap / waveform.length / 128) * params.sensitivity;
  if (volume > 1) {
    volume = 1;
  }

  const radius =
    params.minRadius + volume * (params.maxRadius - params.minRadius);

  return { clockwise: clockwise, quarters: quarters, radius: radius };
}

function tick() {
  frameRequest = requestAnimationFrame(tick);
  render();
}

function play() {
  if (frameRequest === undefined) {
    time = Date.now();
    tick();
  }
}

function pause() {
  if (frameRequest !== undefined) {
    cancelAnimationFrame(frameRequest);
  }
  frameRequest = undefined;
}

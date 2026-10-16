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
let currentArc; // l'arc en train d'être dessiné

// la musique jouée + ce qu'on affiche dans le cadre
const music = {
  src: "/audio/son.mp3",
  title: "My Old Ways",
  artist: "Tame Impala",
};

const audio = new Audio(music.src);
audio.loop = true;

// éléments du cadre d'infos
const titleElement = document.querySelector(".musicTitle h2");
const artistElement = document.querySelector(".musicArtist p");
const playButton = document.querySelector(".playButton");
const slider = document.querySelector(".slider");
const sliderProgress = document.querySelector(".sliderProgress");
const timeElement = document.querySelector(".time");

let audioContext;
let analyser;
let frequencies;
let waveform;

const params = {
  color: "#ffffff",
  opacity: 0.5,
  lineWidth: 1,
  background: "#000000",
  baseRadius: 5,
  sizeLevels: 6,
  stepsPerSecond: 10,
  startFreq: 0,
  endFreq: 1024,
  volume: 1,
  sensitivity: 2,
  bounce: true,
  margin: 5,
  playPause: toggleAudio,
  clear: clearCanvas,
  recenter: recenterPen,
};

// position + direction du stylo
const pen = {
  x: 0,
  y: 0,
  direction: -Math.PI / 2, // vers le haut
};

window.addEventListener("resize", resize);
canvas.addEventListener("click", toggleAudio);
playButton.addEventListener("click", toggleAudio);
slider.addEventListener("click", seek);

// l'audio prévient quand le temps avance / quand il démarre ou s'arrête
audio.addEventListener("loadedmetadata", updateTime);
audio.addEventListener("timeupdate", updateTime);
audio.addEventListener("play", updatePlayButton);
audio.addEventListener("pause", updatePlayButton);

titleElement.textContent = music.title;
artistElement.textContent = music.artist;

resize();
recenterPen();
// initGUI();

function initGUI() {
  const gui = new GUI({ title: "AudioArt" });

  const trait = gui.addFolder("Trait");
  trait.addColor(params, "color").name("couleur");
  trait.add(params, "opacity", 0.01, 1, 0.01).name("opacité");
  trait.add(params, "lineWidth", 0.5, 10, 0.5).name("épaisseur");
  trait.addColor(params, "background").name("fond").onChange(updateBackground);

  const arcs = gui.addFolder("Arcs");
  arcs.add(params, "baseRadius", 1, 100, 1).name("rayon de base");
  arcs.add(params, "sizeLevels", 1, 10, 1).name("nb de tailles");
  arcs.add(params, "stepsPerSecond", 0.1, 20, 0.1).name("Steps / Seconde");

  const son = gui.addFolder("Son");
  son.add(params, "volume", 0, 1, 0.01).onChange(function (value) {
    audio.volume = value;
  });
  son.add(params, "sensitivity", 0.1, 10, 0.1).name("sensibilité");
  son.add(params, "startFreq", 0, 1023, 1).name("fréquence début");
  son.add(params, "endFreq", 1, 1024, 1).name("fréquence fin");
  son.add(params, "playPause").name("lecture / pause");

  const actions = gui.addFolder("Actions");
  actions.add(params, "bounce").name("rester dans l'écran");
  actions.add(params, "margin", 0, 300, 1).name("marge");
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

  // pour que ce soit net sur écran retina
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function formatTime(seconds) {
  if (isNaN(seconds)) {
    return "0:00";
  }
  const minutes = Math.floor(seconds / 60);
  let rest = Math.floor(seconds % 60);
  if (rest < 10) {
    rest = "0" + rest;
  }
  return minutes + ":" + rest;
}

function updateTime() {
  timeElement.textContent =
    formatTime(audio.currentTime) + " / " + formatTime(audio.duration);

  // largeur de la barre = pourcentage écoulé
  let percent = 0;
  if (audio.duration > 0) {
    percent = (audio.currentTime / audio.duration) * 100;
  }
  sliderProgress.style.width = percent + "%";
}

function updatePlayButton() {
  if (audio.paused) {
    playButton.textContent = "lecture";
  } else {
    playButton.textContent = "pause";
  }
}

// clic sur la barre -> on saute à cet endroit du morceau
function seek(event) {
  if (!(audio.duration > 0)) {
    return;
  }
  const rect = slider.getBoundingClientRect();
  const ratio = (event.clientX - rect.left) / rect.width;
  audio.currentTime = ratio * audio.duration;
}

function initAudio() {
  audioContext = new AudioContext();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;

  const source = audioContext.createMediaElementSource(audio);
  source.connect(analyser);
  analyser.connect(audioContext.destination);

  // tableaux remplis à chaque frame par l'analyser
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
  // durée d'un arc en secondes

  const stepDuration = 1 / params.stepsPerSecond;

  // nouvel arc si le précédent est fini
  if (currentArc === undefined) {
    currentArc = prepareArc(readSound());
    console.log(
      "step",
      "| sens:",
      currentArc.clockwise ? "horaire" : "anti-horaire",
      "| quarts:",
      currentArc.quarters,
      "| rayon:",
      currentArc.radius,
    );
  }

  // avancement de l'arc entre 0 et 1
  let progress = stepTimer / stepDuration;
  if (progress > 1) {
    progress = 1;
  }

  // on dessine juste le morceau depuis la dernière frame
  drawArcPart(currentArc, currentArc.drawn, progress);
  currentArc.drawn = progress;

  // arc terminé -> on déplace le stylo au bout
  if (stepTimer >= stepDuration) {
    stepTimer = stepTimer - stepDuration;
    movePen(currentArc);
    currentArc = undefined;
  }

  context.globalAlpha = 1;
}

// calcule le centre et les angles de l'arc à partir du stylo
function prepareArc(arc) {
  placeCenter(arc);

  if (params.bounce) {
    keepInside(arc);
  }

  // 1 quart = 90°
  arc.sweep = arc.quarters * (Math.PI / 2);

  arc.startAngle = pen.direction - arc.side;
  if (arc.clockwise) {
    arc.endAngle = arc.startAngle + arc.sweep;
  } else {
    arc.endAngle = arc.startAngle - arc.sweep;
  }

  arc.drawn = 0;

  return arc;
}

// le centre est à gauche ou à droite du stylo selon le sens
function placeCenter(arc) {
  if (arc.clockwise) {
    arc.side = Math.PI / 2;
  } else {
    arc.side = -Math.PI / 2;
  }

  arc.centerX = pen.x + Math.cos(pen.direction + arc.side) * arc.radius;
  arc.centerY = pen.y + Math.sin(pen.direction + arc.side) * arc.radius;
}

// vrai si le cercle de l'arc tient dans la zone autorisée
// la zone est un cercle autour du milieu de l'écran
function fitsInside(arc) {
  const limit = Math.min(width, height) / 2 - params.margin;
  const dx = arc.centerX - width / 2;
  const dy = arc.centerY - height / 2;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance + arc.radius <= limit;
}

// si l'arc sortirait, on essaie l'autre sens, puis on réduit le rayon
function keepInside(arc) {
  if (fitsInside(arc)) {
    return;
  }

  // 1. on tourne de l'autre côté
  arc.clockwise = !arc.clockwise;
  placeCenter(arc);

  // 2. toujours trop grand -> on divise le rayon par 2 jusqu'à ce que ça rentre
  while (!fitsInside(arc) && arc.radius > 1) {
    arc.radius = arc.radius / 2;
    placeCenter(arc);
  }
}

// dessine le bout d'arc entre from et to (entre 0 et 1)
function drawArcPart(arc, from, to) {
  // on convertit from / to (0 à 1) en vrais angles sur le cercle
  const angleRange = arc.endAngle - arc.startAngle;
  const fromAngle = arc.startAngle + angleRange * from;
  const toAngle = arc.startAngle + angleRange * to;

  strokeArc(arc, fromAngle, toAngle);
}

// le vrai tracé
function strokeArc(arc, fromAngle, toAngle) {
  context.beginPath();
  // arc(centreX, centreY, rayon, angle début, angle fin, antihoraire ?)
  context.arc(
    arc.centerX,
    arc.centerY,
    arc.radius,
    fromAngle,
    toAngle,
    !arc.clockwise,
  );
  context.stroke(); // c'est ici que ça s'affiche
}

// place le stylo à la fin de l'arc et le tourne
function movePen(arc) {
  pen.x = arc.centerX + Math.cos(arc.endAngle) * arc.radius;
  pen.y = arc.centerY + Math.sin(arc.endAngle) * arc.radius;

  if (arc.clockwise) {
    pen.direction = pen.direction + arc.sweep;
  } else {
    pen.direction = pen.direction - arc.sweep;
  }
}

// transforme le son en infos pour l'arc (sens, nb de quarts, rayon)
function readSound() {
  // sens : premier point de la forme d'onde au-dessus ou en dessous du milieu (128)
  let clockwise = false;
  if (waveform[0] > 128) {
    clockwise = true;
  }

  let start = params.startFreq;
  let end = params.endFreq;
  if (end <= start) {
    end = start + 1;
  }

  // moyenne des fréquences dans la plage choisie
  let total = 0;
  for (let i = start; i < end; i++) {
    total = total + frequencies[i];
  }
  const average = total / (end - start);

  // plus c'est fort, plus l'arc fait de quarts
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

  // volume = écart moyen de la forme d'onde par rapport au silence (128)
  let gap = 0;
  for (let i = 0; i < waveform.length; i++) {
    gap = gap + Math.abs(waveform[i] - 128);
  }
  let volume = (gap / waveform.length / 128) * params.sensitivity;
  if (volume > 1) {
    volume = 1;
  }

  // rayon qui double à chaque niveau
  let level = Math.floor(volume * params.sizeLevels);
  if (level > params.sizeLevels - 1) {
    level = params.sizeLevels - 1;
  }

  const multiplier = Math.pow(2, level);
  const radius = params.baseRadius * multiplier;

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

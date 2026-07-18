import * as THREE from '../three.module.min.js';
import OrbitControls from '../OrbitControls.js';

const RESOURCE_NAMES = ['food', 'energy', 'money'];
const RESOURCE_COLORS = {
  food: 0x0f910f,
  energy: 0x0d0d91,
  money: 0x910f0f,
};

const GRID_SIZE = 40;
const CELL_SIZE = 10;
const BOARD_WIDTH = GRID_SIZE * CELL_SIZE;
const BOARD_HEIGHT = GRID_SIZE * CELL_SIZE;
const PADDING = 10;
const H_CUT_RATE = 0.4;
const V_CUT_RATE = 0.4;
const H_CUT_COUNT = Math.round(GRID_SIZE * GRID_SIZE * H_CUT_RATE);
const V_CUT_COUNT = Math.round(GRID_SIZE * GRID_SIZE * V_CUT_RATE);
const MAX_SIM_STEPS_PER_FRAME = 6;
const REGION_COUNT = 4;
const AGENT_SIZE = 4.5;
const AGENT_MOVE_SPEED = 32;
const CHART_HISTORY_LIMIT = 160;
const BASE_SIM_TICKS_PER_SECOND = 20;
const CHART_UPDATE_INTERVAL_SECONDS = 1;

const controlsEl = {
  agentCountInput: document.getElementById('agentCountInput'),
  resetButton: document.getElementById('resetButton'),
  pauseSpeedButton: document.getElementById('pauseSpeedButton'),
  speedControl: document.getElementById('speedControl'),
  speedReadout: document.getElementById('speedReadout'),
  metricForm: document.getElementById('metricForm'),
  tooltip: document.getElementById('agentTooltip'),
  sceneHud: document.getElementById('sceneHud'),
  threeContainer: document.getElementById('threeContainer'),
};

const sceneState = {
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  raycaster: new THREE.Raycaster(),
  pointer: new THREE.Vector2(2, 2),
  pointerDirty: true,
  hoverProjection: new THREE.Vector3(),
  hoveredAgentId: null,
  hoverPathLine: null,
  hoverPathMaterial: null,
  animationHandle: 0,
};

const appState = {
  paused: false,
  simulationSpeedMultiplier: 1,
  movementSpeed: AGENT_MOVE_SPEED,
  simulationTicksPerSecond: BASE_SIM_TICKS_PER_SECOND,
  metric: 'price',
  agents: [],
  agentsById: {},
  agentMeshes: [],
  tradeQueue: [],
  tradeIdCounter: 0,
  regions: [],
  roads: null,
  regionResourcePrices: [],
  regionResourceQuantities: [],
  regionResourceSupplies: [],
  regionResourceDemands: [],
  tickCount: 0,
  accumulator: 0,
  chartAccumulator: 0,
  chartNeedsRender: true,
  latestMetricSnapshots: null,
  lastFrameTime: performance.now(),
  chartInstances: {},
};

function applySpeedControl() {
  const sliderValue = Number(controlsEl.speedControl.value);
  appState.simulationSpeedMultiplier = sliderValue;
  appState.movementSpeed = AGENT_MOVE_SPEED * sliderValue;
  appState.simulationTicksPerSecond = BASE_SIM_TICKS_PER_SECOND * sliderValue;
  controlsEl.speedReadout.textContent =
    sliderValue.toFixed(2) +
    'x speed | ' +
    appState.movementSpeed.toFixed(1) +
    ' move units/sec | ' +
    appState.simulationTicksPerSecond.toFixed(1) +
    ' ticks/sec';
  updateHud();
}

function findAdjacentEmptyVertex(position, excludedAgentIds) {
  const occupied = new Set();
  for (let i = 0; i < appState.agents.length; i++) {
    const agent = appState.agents[i];
    if (excludedAgentIds && excludedAgentIds.has(agent.id)) {
      continue;
    }
    occupied.add(agent.position.x + ',' + agent.position.y);
  }

  const neighbors = getNeighborAvailability(position.x, position.y);
  for (let i = 0; i < neighbors.length; i++) {
    const neighbor = neighbors[i];
    if (neighbor[2] === -1) {
      continue;
    }
    const key = neighbor[0] + ',' + neighbor[1];
    if (!occupied.has(key)) {
      return { x: neighbor[0], y: neighbor[1] };
    }
  }
  return null;
}

function getRandomRoutableVertex() {
  return {
    x: randrange(0, GRID_SIZE - 1),
    y: randrange(0, GRID_SIZE - 1),
  };
}

function displaceOverlappingAgents() {
  const agentsByPosition = new Map();
  for (let i = 0; i < appState.agents.length; i++) {
    const agent = appState.agents[i];
    const key = agent.position.x + ',' + agent.position.y;
    if (!agentsByPosition.has(key)) {
      agentsByPosition.set(key, []);
    }
    agentsByPosition.get(key).push(agent);
  }

  agentsByPosition.forEach(function (agentsAtPosition) {
    if (agentsAtPosition.length <= 1) {
      return;
    }

    agentsAtPosition.sort(function (left, right) {
      return left.id.localeCompare(right.id);
    });

    const keepAgent = agentsAtPosition[0];
    const temporarilyIgnored = new Set([keepAgent.id]);

    for (let i = 1; i < agentsAtPosition.length; i++) {
      const displacedAgent = agentsAtPosition[i];
      displacedAgent.path = [];
      displacedAgent.destination = null;
      displacedAgent.partnerTradeId = null;
      displacedAgent.plannedTrade = null;

      let adjacentTarget = findAdjacentEmptyVertex(
        displacedAgent.position,
        temporarilyIgnored,
      );

      if (!adjacentTarget) {
        for (let attempt = 0; attempt < 8; attempt++) {
          const randomVertex = getRandomRoutableVertex();
          const repositionPath = findPath(
            displacedAgent.position,
            randomVertex,
          );
          if (repositionPath.length > 1) {
            displacedAgent.path = repositionPath.slice(1);
            displacedAgent.destination = cloneGridPosition(
              repositionPath[repositionPath.length - 1],
            );
            displacedAgent.state = 'moving';
            break;
          }
        }
      } else {
        displacedAgent.path = [adjacentTarget];
        displacedAgent.destination = cloneGridPosition(adjacentTarget);
        displacedAgent.state = 'moving';
      }

      temporarilyIgnored.add(displacedAgent.id);
    }
  });
}

function randrange(min, max) {
  return Math.round(Math.random() * (max - min) + min);
}

function median(values) {
  if (!values.length) {
    return 0;
  }
  values.sort(function (left, right) {
    return left - right;
  });
  const mid = Math.floor(values.length / 2);
  if (values.length % 2 === 1) {
    return values[mid];
  }
  return (values[mid - 1] + values[mid]) / 2;
}

function summarizeNumericArray(values) {
  if (!values.length) {
    return { total: 0, average: 0, median: 0, min: 0, max: 0 };
  }
  let total = 0;
  let min = values[0];
  let max = values[0];
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    total += value;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return {
    total: total,
    average: total / values.length,
    median: median(values.slice(0)),
    min: min,
    max: max,
  };
}

function makeGuid() {
  return (
    Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
  );
}

function gridToScenePosition(gridPosition) {
  return new THREE.Vector3(
    -BOARD_WIDTH / 2 + gridPosition.x * CELL_SIZE,
    -BOARD_HEIGHT / 2 + gridPosition.y * CELL_SIZE,
    AGENT_SIZE,
  );
}

function sceneToGridPosition(vector) {
  return {
    x: Math.round((vector.x + BOARD_WIDTH / 2) / CELL_SIZE),
    y: Math.round((vector.y + BOARD_HEIGHT / 2) / CELL_SIZE),
  };
}

function cloneGridPosition(position) {
  return { x: position.x, y: position.y };
}

function getDominantResourceName(agent) {
  let maxName = RESOURCE_NAMES[0];
  let maxValue = agent.resources[maxName].quantity;
  for (let i = 1; i < RESOURCE_NAMES.length; i++) {
    const resourceName = RESOURCE_NAMES[i];
    const quantity = agent.resources[resourceName].quantity;
    if (quantity > maxValue) {
      maxValue = quantity;
      maxName = resourceName;
    }
  }
  return maxName;
}

function getScarcityResourceName(agent) {
  let minName = RESOURCE_NAMES[0];
  let minValue = agent.resources[minName].quantity;
  for (let i = 1; i < RESOURCE_NAMES.length; i++) {
    const resourceName = RESOURCE_NAMES[i];
    const quantity = agent.resources[resourceName].quantity;
    if (quantity < minValue) {
      minValue = quantity;
      minName = resourceName;
    }
  }
  return minName;
}

function createResource(resourceName) {
  return {
    name: resourceName,
    quantity: randrange(8, 92),
    highThreshold: randrange(80, 90),
    lowThreshold: randrange(10, 20),
  };
}

function createAgent(index) {
  const position = {
    x: randrange(0, GRID_SIZE - 1),
    y: randrange(0, GRID_SIZE - 1),
  };
  const resources = {};
  for (let i = 0; i < RESOURCE_NAMES.length; i++) {
    const resourceName = RESOURCE_NAMES[i];
    resources[resourceName] = createResource(resourceName);
  }

  return {
    id: 'agent-' + index + '-' + makeGuid(),
    position: cloneGridPosition(position),
    spawnPosition: cloneGridPosition(position),
    destination: null,
    path: [],
    state: 'idle',
    region: -1,
    mesh: null,
    resources: resources,
    plannedTrade: null,
    totalDistanceTraveled: 0,
    speed: AGENT_MOVE_SPEED,
    partnerTradeId: null,
  };
}

function createRegions() {
  const regionWidth = GRID_SIZE / 2;
  const regionHeight = GRID_SIZE / 2;
  appState.regions = [];
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      const region = {
        id: row * 2 + col,
        topLeft: { x: col * regionWidth, y: row * regionHeight },
        bottomRight: {
          x: (col + 1) * regionWidth - 1,
          y: (row + 1) * regionHeight - 1,
        },
        agentIds: [],
        resources: {
          food: { quantity: 0, supply: 0, demand: 0, price: 1 },
          energy: { quantity: 0, supply: 0, demand: 0, price: 1 },
          money: { quantity: 0, supply: 0, demand: 0, price: 1 },
        },
      };
      appState.regions.push(region);
    }
  }
}

function getRegionForPosition(position) {
  const col = position.x < GRID_SIZE / 2 ? 0 : 1;
  const row = position.y < GRID_SIZE / 2 ? 0 : 1;
  return row * 2 + col;
}

function generateRoadNetwork() {
  const hlines = [];
  const vlines = [];
  for (let x = 0; x <= GRID_SIZE; x++) {
    hlines[x] = [];
    vlines[x] = [];
    for (let y = 0; y <= GRID_SIZE; y++) {
      hlines[x][y] = [true, 0];
      vlines[x][y] = [true, 0];
    }
  }

  function getUDRLAvailability(x, y) {
    if (x < 0 || y < 0 || x >= GRID_SIZE || y >= GRID_SIZE) {
      return [];
    }
    const neighbors = [];
    neighbors.push(y > 0 ? [x, y - 1, vlines[x][y - 1][1]] : [x, y - 1, -1]);
    neighbors.push(
      y < GRID_SIZE - 1 ? [x, y + 1, vlines[x][y][1]] : [x, y + 1, -1],
    );
    neighbors.push(
      x < GRID_SIZE - 1 ? [x + 1, y, hlines[x][y][1]] : [x + 1, y, -1],
    );
    neighbors.push(x > 0 ? [x - 1, y, hlines[x - 1][y][1]] : [x - 1, y, -1]);
    return neighbors;
  }

  function pathExists(start, goal, maxDepth) {
    const open = [start];
    const visited = new Set([start.x + ',' + start.y]);

    while (open.length > 0) {
      const current = open.shift();
      if (current.x === goal.x && current.y === goal.y) {
        return true;
      }
      if (current.depth >= maxDepth) {
        continue;
      }
      const neighbors = getUDRLAvailability(current.x, current.y);
      for (let i = 0; i < neighbors.length; i++) {
        const neighbor = neighbors[i];
        if (neighbor[2] === -1) {
          continue;
        }
        const key = neighbor[0] + ',' + neighbor[1];
        if (visited.has(key)) {
          continue;
        }
        visited.add(key);
        open.push({ x: neighbor[0], y: neighbor[1], depth: current.depth + 1 });
      }
    }
    return false;
  }

  let killswitch = 0;
  for (let cutIndex = 0; cutIndex < H_CUT_COUNT; cutIndex++) {
    if (killswitch > 1000) {
      break;
    }
    let randx = Math.floor(Math.random() * GRID_SIZE);
    let randy = Math.floor(Math.random() * GRID_SIZE);
    while (hlines[randx][randy][0] === false) {
      randx = Math.floor(Math.random() * GRID_SIZE);
      randy = Math.floor(Math.random() * GRID_SIZE);
    }
    hlines[randx][randy][0] = false;
    hlines[randx][randy][1] = -1;
    if (
      !pathExists(
        { x: randx, y: randy, depth: 0 },
        { x: randx + 1, y: randy },
        GRID_SIZE * 2,
      )
    ) {
      hlines[randx][randy][0] = true;
      hlines[randx][randy][1] = 0;
      cutIndex--;
      killswitch++;
    }
  }

  killswitch = 0;
  for (let cutIndex = 0; cutIndex < V_CUT_COUNT; cutIndex++) {
    if (killswitch > 1000) {
      break;
    }
    let randx = Math.floor(Math.random() * GRID_SIZE);
    let randy = Math.floor(Math.random() * GRID_SIZE);
    while (vlines[randx][randy][0] === false) {
      randx = Math.floor(Math.random() * GRID_SIZE);
      randy = Math.floor(Math.random() * GRID_SIZE);
    }
    vlines[randx][randy][0] = false;
    vlines[randx][randy][1] = -1;
    if (
      !pathExists(
        { x: randx, y: randy, depth: 0 },
        { x: randx, y: randy + 1 },
        GRID_SIZE * 2,
      )
    ) {
      vlines[randx][randy][0] = true;
      vlines[randx][randy][1] = 0;
      cutIndex--;
      killswitch++;
    }
  }

  return { hlines: hlines, vlines: vlines };
}

function getNeighborAvailability(x, y) {
  const hlines = appState.roads.hlines;
  const vlines = appState.roads.vlines;
  const output = [];
  output.push(y > 0 ? [x, y - 1, vlines[x][y - 1][1]] : [x, y - 1, -1]);
  output.push(y < GRID_SIZE - 1 ? [x, y + 1, vlines[x][y][1]] : [x, y + 1, -1]);
  output.push(x < GRID_SIZE - 1 ? [x + 1, y, hlines[x][y][1]] : [x + 1, y, -1]);
  output.push(x > 0 ? [x - 1, y, hlines[x - 1][y][1]] : [x - 1, y, -1]);
  return output;
}

function findPath(startPosition, destinationPosition) {
  const open = [
    {
      x: startPosition.x,
      y: startPosition.y,
      g: 0,
      score: 0,
      parent: null,
    },
  ];
  const bestScores = new Map();
  const destinationKey = destinationPosition.x + ',' + destinationPosition.y;
  bestScores.set(startPosition.x + ',' + startPosition.y, 0);

  while (open.length > 0) {
    open.sort(function (left, right) {
      return left.score - right.score;
    });
    const current = open.shift();
    const currentKey = current.x + ',' + current.y;
    if (currentKey === destinationKey) {
      const path = [];
      let walker = current;
      while (walker) {
        path.unshift({ x: walker.x, y: walker.y });
        walker = walker.parent;
      }
      return path;
    }

    const neighbors = getNeighborAvailability(current.x, current.y);
    for (let i = 0; i < neighbors.length; i++) {
      const neighbor = neighbors[i];
      if (neighbor[2] === -1) {
        continue;
      }
      const nx = neighbor[0];
      const ny = neighbor[1];
      const key = nx + ',' + ny;
      const g = current.g + 1;
      const h =
        Math.abs(destinationPosition.x - nx) +
        Math.abs(destinationPosition.y - ny);
      if (bestScores.has(key) && bestScores.get(key) <= g) {
        continue;
      }
      bestScores.set(key, g);
      open.push({
        x: nx,
        y: ny,
        g: g,
        score: g + h,
        parent: current,
      });
    }
  }

  return [cloneGridPosition(startPosition)];
}

function createScene() {
  if (sceneState.renderer) {
    cancelAnimationFrame(sceneState.animationHandle);
    sceneState.controls.dispose();
    sceneState.renderer.dispose();
    controlsEl.threeContainer.innerHTML = '';
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0b0b);

  const width = controlsEl.threeContainer.clientWidth || 1200;
  const height = controlsEl.threeContainer.clientHeight || 700;
  const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 2000);
  camera.position.set(0, -40, 420);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height);
  controlsEl.threeContainer.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.update();

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.85);
  directionalLight.position.set(120, -120, 220);
  scene.add(directionalLight);

  const baseGeometry = new THREE.PlaneGeometry(
    BOARD_WIDTH + PADDING * 2,
    BOARD_HEIGHT + PADDING * 2,
  );
  const baseMaterial = new THREE.MeshStandardMaterial({
    color: 0xf5f2e8,
    side: THREE.DoubleSide,
  });
  const plane = new THREE.Mesh(baseGeometry, baseMaterial);
  plane.position.set(0, 0, 0);
  scene.add(plane);

  const roadMaterial = new THREE.MeshStandardMaterial({
    color: 0xcacaca,
    side: THREE.DoubleSide,
  });

  for (let x = 0; x <= BOARD_WIDTH; x += CELL_SIZE) {
    for (let cellY = 0; cellY < GRID_SIZE; cellY++) {
      if (appState.roads.vlines[Math.floor(x / CELL_SIZE)][cellY][0]) {
        const geometry = new THREE.PlaneGeometry(CELL_SIZE * 0.14, CELL_SIZE);
        const mesh = new THREE.Mesh(geometry, roadMaterial);
        const xpos = -BOARD_WIDTH / 2 + x;
        const ypos = -BOARD_HEIGHT / 2 + cellY * CELL_SIZE + CELL_SIZE / 2;
        mesh.position.set(xpos, ypos, 0.2);
        scene.add(mesh);
      }
    }
  }

  for (let y = 0; y <= BOARD_HEIGHT; y += CELL_SIZE) {
    for (let cellX = 0; cellX < GRID_SIZE; cellX++) {
      if (appState.roads.hlines[cellX][Math.floor(y / CELL_SIZE)][0]) {
        const geometry = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE * 0.14);
        const mesh = new THREE.Mesh(geometry, roadMaterial);
        const xpos = -BOARD_WIDTH / 2 + cellX * CELL_SIZE + CELL_SIZE / 2;
        const ypos = -BOARD_HEIGHT / 2 + y;
        mesh.position.set(xpos, ypos, 0.2);
        scene.add(mesh);
      }
    }
  }

  const regionLineMaterial = new THREE.LineBasicMaterial({
    color: 0x444444,
    transparent: true,
    opacity: 0.5,
  });
  const regionPoints = [
    new THREE.Vector3(0, -BOARD_HEIGHT / 2, 1),
    new THREE.Vector3(0, BOARD_HEIGHT / 2, 1),
    new THREE.Vector3(-BOARD_WIDTH / 2, 0, 1),
    new THREE.Vector3(BOARD_WIDTH / 2, 0, 1),
  ];
  scene.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(regionPoints.slice(0, 2)),
      regionLineMaterial,
    ),
  );
  scene.add(
    new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(regionPoints.slice(2, 4)),
      regionLineMaterial,
    ),
  );

  sceneState.hoverPathMaterial = new THREE.LineBasicMaterial({
    color: 0xf0c542,
    transparent: true,
    opacity: 1,
    linewidth: 4,
  });
  sceneState.hoverPathLine = new THREE.Line(
    new THREE.BufferGeometry(),
    sceneState.hoverPathMaterial,
  );
  sceneState.hoverPathLine.visible = false;
  scene.add(sceneState.hoverPathLine);

  sceneState.scene = scene;
  sceneState.camera = camera;
  sceneState.renderer = renderer;
  sceneState.controls = controls;

  renderer.domElement.addEventListener('mousemove', handlePointerMove);
  renderer.domElement.addEventListener('mouseleave', clearHoverState);
  window.addEventListener('resize', resizeRenderer);
}

function buildAgentMeshes() {
  appState.agentMeshes = [];
  const geometry = new THREE.CylinderGeometry(
    AGENT_SIZE * 0.55,
    AGENT_SIZE * 0.75,
    AGENT_SIZE * 1.8,
    12,
  );

  for (let i = 0; i < appState.agents.length; i++) {
    const agent = appState.agents[i];
    const color = RESOURCE_COLORS[getDominantResourceName(agent)];
    const material = new THREE.MeshStandardMaterial({
      color: color,
      emissive: 0x111111,
    });
    const mesh = new THREE.Mesh(geometry, material);
    const pos = gridToScenePosition(agent.position);
    mesh.position.copy(pos);
    mesh.userData.agentId = agent.id;
    agent.mesh = mesh;
    appState.agentMeshes.push(mesh);
    appState.agentsById[agent.id] = agent;
    sceneState.scene.add(mesh);
  }
}

function updateAgentVisuals() {
  for (let i = 0; i < appState.agents.length; i++) {
    const agent = appState.agents[i];
    if (!agent.mesh) {
      continue;
    }
    const dominant = getDominantResourceName(agent);
    agent.mesh.material.color.setHex(RESOURCE_COLORS[dominant]);
    agent.mesh.material.emissive.setHex(
      agent.id === sceneState.hoveredAgentId ? 0x353535 : 0x111111,
    );
  }
}

function initializeCharts() {
  appState.chartInstances = {};
}

function getSelectedMetricArrays() {
  if (appState.metric === 'price') {
    return appState.regionResourcePrices;
  }
  if (appState.metric === 'quantity') {
    return appState.regionResourceQuantities;
  }
  if (appState.metric === 'supply') {
    return appState.regionResourceSupplies;
  }
  return appState.regionResourceDemands;
}

function simplifySeries(series) {
  if (series.length < 2) {
    return series.slice(0);
  }
  const output = [];
  for (let i = 0; i < series.length - 1; i += 2) {
    output.push((series[i] + series[i + 1]) / 2);
  }
  return output;
}

function renderMetricChart(chartKey, canvasId, data, options) {
  if (
    appState.chartInstances[chartKey] &&
    appState.chartInstances[chartKey].destroy
  ) {
    appState.chartInstances[chartKey].destroy();
  }

  const existingCanvas = document.getElementById(canvasId);
  if (!existingCanvas || !existingCanvas.parentNode) {
    return;
  }

  const replacementCanvas = existingCanvas.cloneNode(false);
  existingCanvas.parentNode.replaceChild(replacementCanvas, existingCanvas);

  const ctx = replacementCanvas.getContext('2d');
  ctx.clearRect(0, 0, replacementCanvas.width, replacementCanvas.height);
  appState.chartInstances[chartKey] = new window.Chart(ctx).Line(data, options);
}

function updateCharts() {
  const metricLabel =
    appState.metric.charAt(0).toUpperCase() + appState.metric.slice(1);
  const sourceArrays = getSelectedMetricArrays();
  if (!sourceArrays.length || !sourceArrays[0] || !sourceArrays[0][0]) {
    return;
  }

  const chartValueArrays = [];
  for (let regionIndex = 0; regionIndex < REGION_COUNT; regionIndex++) {
    chartValueArrays[regionIndex] = [];
    for (
      let resourceIndex = 0;
      resourceIndex < RESOURCE_NAMES.length;
      resourceIndex++
    ) {
      chartValueArrays[regionIndex][resourceIndex] = simplifySeries(
        sourceArrays[regionIndex][resourceIndex] || [],
      );
    }
  }

  const labelCount = chartValueArrays[0][0].length;
  const labels = [];
  for (let labelIndex = 0; labelIndex < labelCount; labelIndex++) {
    labels.push((labelIndex * 2).toString());
  }

  function regionDatasets(regionIndex) {
    return [
      {
        label: 'Region ' + regionIndex + ' Food (' + metricLabel + ')',
        strokeColor: 'rgba(15,145,15,1)',
        pointColor: 'rgba(15,145,15,1)',
        pointStrokeColor: '#fff',
        pointHighlightFill: '#fff',
        pointHighlightStroke: 'rgba(15,145,15,1)',
        data: chartValueArrays[regionIndex][0],
      },
      {
        label: 'Region ' + regionIndex + ' Energy (' + metricLabel + ')',
        strokeColor: 'rgba(13,13,145,1)',
        pointColor: 'rgba(13,13,145,1)',
        pointStrokeColor: '#fff',
        pointHighlightFill: '#fff',
        pointHighlightStroke: 'rgba(13,13,145,1)',
        data: chartValueArrays[regionIndex][1],
      },
      {
        label: 'Region ' + regionIndex + ' Money (' + metricLabel + ')',
        strokeColor: 'rgba(145,15,15,1)',
        pointColor: 'rgba(145,15,15,1)',
        pointStrokeColor: '#fff',
        pointHighlightFill: '#fff',
        pointHighlightStroke: 'rgba(145,15,15,1)',
        data: chartValueArrays[regionIndex][2],
      },
    ];
  }

  const chartOptions = {
    animation: false,
    responsive: true,
    maintainAspectRatio: false,
    showTooltips: true,
    scaleShowLabels: true,
    scaleBeginAtZero: true,
    scaleIntegersOnly: false,
    bezierCurve: false,
    pointDot: false,
    datasetFill: false,
    datasetStrokeWidth: 2,
    tooltipTemplate: '<%if (label){%><%=label%>: <%}%><%= value %>',
    multiTooltipTemplate: '<%= value %>',
  };

  renderMetricChart(
    'region0',
    'region0Chart',
    { labels: labels, datasets: regionDatasets(0) },
    chartOptions,
  );
  renderMetricChart(
    'region1',
    'region1Chart',
    { labels: labels, datasets: regionDatasets(1) },
    chartOptions,
  );
  renderMetricChart(
    'region2',
    'region2Chart',
    { labels: labels, datasets: regionDatasets(2) },
    chartOptions,
  );
  renderMetricChart(
    'region3',
    'region3Chart',
    { labels: labels, datasets: regionDatasets(3) },
    chartOptions,
  );
  renderMetricChart(
    'food',
    'foodChart',
    {
      labels: labels,
      datasets: [
        {
          label: 'Region 0 Food (' + metricLabel + ')',
          strokeColor: 'rgba(15,145,15,1)',
          pointColor: 'rgba(15,145,15,1)',
          data: chartValueArrays[0][0],
        },
        {
          label: 'Region 1 Food (' + metricLabel + ')',
          strokeColor: 'rgba(13,13,145,1)',
          pointColor: 'rgba(13,13,145,1)',
          data: chartValueArrays[1][0],
        },
        {
          label: 'Region 2 Food (' + metricLabel + ')',
          strokeColor: 'rgba(145,15,15,1)',
          pointColor: 'rgba(145,15,15,1)',
          data: chartValueArrays[2][0],
        },
        {
          label: 'Region 3 Food (' + metricLabel + ')',
          strokeColor: 'rgba(158,118,227,1)',
          pointColor: 'rgba(158,118,227,1)',
          data: chartValueArrays[3][0],
        },
      ],
    },
    chartOptions,
  );
  renderMetricChart(
    'energy',
    'energyChart',
    {
      labels: labels,
      datasets: [
        {
          label: 'Region 0 Energy (' + metricLabel + ')',
          strokeColor: 'rgba(15,145,15,1)',
          pointColor: 'rgba(15,145,15,1)',
          data: chartValueArrays[0][1],
        },
        {
          label: 'Region 1 Energy (' + metricLabel + ')',
          strokeColor: 'rgba(13,13,145,1)',
          pointColor: 'rgba(13,13,145,1)',
          data: chartValueArrays[1][1],
        },
        {
          label: 'Region 2 Energy (' + metricLabel + ')',
          strokeColor: 'rgba(145,15,15,1)',
          pointColor: 'rgba(145,15,15,1)',
          data: chartValueArrays[2][1],
        },
        {
          label: 'Region 3 Energy (' + metricLabel + ')',
          strokeColor: 'rgba(158,118,227,1)',
          pointColor: 'rgba(158,118,227,1)',
          data: chartValueArrays[3][1],
        },
      ],
    },
    chartOptions,
  );
}

function recordMetricSeries(targetArrays, values) {
  while (targetArrays.length < REGION_COUNT) {
    targetArrays.push([[], [], []]);
  }
  for (let regionIndex = 0; regionIndex < REGION_COUNT; regionIndex++) {
    for (
      let resourceIndex = 0;
      resourceIndex < RESOURCE_NAMES.length;
      resourceIndex++
    ) {
      const series = targetArrays[regionIndex][resourceIndex];
      series.push(values[regionIndex][resourceIndex]);
      if (series.length > CHART_HISTORY_LIMIT) {
        series.splice(0, series.length - CHART_HISTORY_LIMIT);
      }
    }
  }
}

function captureLatestMetricsForCharts() {
  if (!appState.latestMetricSnapshots) {
    return;
  }
  recordMetricSeries(
    appState.regionResourcePrices,
    appState.latestMetricSnapshots.prices,
  );
  recordMetricSeries(
    appState.regionResourceQuantities,
    appState.latestMetricSnapshots.quantities,
  );
  recordMetricSeries(
    appState.regionResourceSupplies,
    appState.latestMetricSnapshots.supplies,
  );
  recordMetricSeries(
    appState.regionResourceDemands,
    appState.latestMetricSnapshots.demands,
  );
}

function updateRegionalState() {
  for (
    let regionIndex = 0;
    regionIndex < appState.regions.length;
    regionIndex++
  ) {
    const region = appState.regions[regionIndex];
    region.agentIds = [];
    for (
      let resourceIndex = 0;
      resourceIndex < RESOURCE_NAMES.length;
      resourceIndex++
    ) {
      const resourceName = RESOURCE_NAMES[resourceIndex];
      region.resources[resourceName].quantity = 0;
      region.resources[resourceName].supply = 0;
      region.resources[resourceName].demand = 0;
    }
  }

  for (let i = 0; i < appState.agents.length; i++) {
    const agent = appState.agents[i];
    const regionId = getRegionForPosition(agent.position);
    agent.region = regionId;
    appState.regions[regionId].agentIds.push(agent.id);
  }

  for (
    let regionIndex = 0;
    regionIndex < appState.regions.length;
    regionIndex++
  ) {
    const region = appState.regions[regionIndex];
    for (let idIndex = 0; idIndex < region.agentIds.length; idIndex++) {
      const agent = appState.agentsById[region.agentIds[idIndex]];
      for (
        let resourceIndex = 0;
        resourceIndex < RESOURCE_NAMES.length;
        resourceIndex++
      ) {
        const resourceName = RESOURCE_NAMES[resourceIndex];
        region.resources[resourceName].quantity +=
          agent.resources[resourceName].quantity;
      }

      region.resources[getDominantResourceName(agent)].supply += 1;
      region.resources[getScarcityResourceName(agent)].demand += 1;
    }
  }

  const pricesByRegion = [];
  const quantitiesByRegion = [];
  const supplyByRegion = [];
  const demandByRegion = [];

  for (
    let regionIndex = 0;
    regionIndex < appState.regions.length;
    regionIndex++
  ) {
    const region = appState.regions[regionIndex];
    let quantityOfNonMoney = 0;
    for (
      let resourceIndex = 0;
      resourceIndex < RESOURCE_NAMES.length;
      resourceIndex++
    ) {
      const resourceName = RESOURCE_NAMES[resourceIndex];
      if (resourceName !== 'money') {
        quantityOfNonMoney += region.resources[resourceName].quantity;
      }
    }
    quantityOfNonMoney = Math.max(quantityOfNonMoney, 0.0001);

    let nonMoneyValueMultiplier = 0;
    for (
      let resourceIndex = 0;
      resourceIndex < RESOURCE_NAMES.length;
      resourceIndex++
    ) {
      const resourceName = RESOURCE_NAMES[resourceIndex];
      if (resourceName !== 'money') {
        const quantity = Math.max(
          region.resources[resourceName].quantity,
          0.0001,
        );
        nonMoneyValueMultiplier += quantityOfNonMoney / quantity;
      }
    }
    nonMoneyValueMultiplier = Math.max(nonMoneyValueMultiplier, 0.0001);

    const moneyQuantity = Math.max(region.resources.money.quantity, 0.0001);
    region.resources.money.price = 1;

    pricesByRegion[regionIndex] = [];
    quantitiesByRegion[regionIndex] = [];
    supplyByRegion[regionIndex] = [];
    demandByRegion[regionIndex] = [];

    for (
      let resourceIndex = 0;
      resourceIndex < RESOURCE_NAMES.length;
      resourceIndex++
    ) {
      const resourceName = RESOURCE_NAMES[resourceIndex];
      const resource = region.resources[resourceName];
      if (resourceName !== 'money') {
        const safeQuantity = Math.max(resource.quantity, 0.0001);
        let demandPressure = (resource.demand + 1) / (resource.supply + 1);
        demandPressure = Math.max(0.5, Math.min(2.0, demandPressure));
        resource.price =
          ((moneyQuantity / nonMoneyValueMultiplier) *
            (quantityOfNonMoney / safeQuantity)) /
          safeQuantity;
        resource.price *= demandPressure;
      }
      pricesByRegion[regionIndex][resourceIndex] = resource.price;
      quantitiesByRegion[regionIndex][resourceIndex] = resource.quantity;
      supplyByRegion[regionIndex][resourceIndex] = resource.supply;
      demandByRegion[regionIndex][resourceIndex] = resource.demand;
    }
  }

  appState.latestMetricSnapshots = {
    prices: pricesByRegion,
    quantities: quantitiesByRegion,
    supplies: supplyByRegion,
    demands: demandByRegion,
  };
}

function getExchangeRateForAgent(agent, wantedResourceName) {
  const region = appState.regions[agent.region];
  const moneyPerFood = Math.max(region.resources.food.price, 0.0001);
  const energyPerMoney = 1 / Math.max(region.resources.energy.price, 0.0001);
  const foodPerEnergy =
    moneyPerFood / Math.max(region.resources.energy.price, 0.0001);
  if (wantedResourceName === 'food') {
    return { paymentResource: 'money', quantity: moneyPerFood };
  }
  if (wantedResourceName === 'energy') {
    return { paymentResource: 'food', quantity: foodPerEnergy };
  }
  return { paymentResource: 'energy', quantity: energyPerMoney };
}

function resolveNeed(agent) {
  const minResource = getScarcityResourceName(agent);
  if (minResource === 'food') {
    const foodRate = getExchangeRateForAgent(agent, 'food');
    const moneyBalance = agent.resources.money.quantity;
    if (moneyBalance >= foodRate.quantity) {
      return 'food';
    }
    const moneyRate = getExchangeRateForAgent(agent, 'money');
    if (agent.resources.energy.quantity >= moneyRate.quantity) {
      return 'money';
    }
    return 'food';
  }
  if (minResource === 'energy') {
    const energyRate = getExchangeRateForAgent(agent, 'energy');
    if (agent.resources.food.quantity >= energyRate.quantity) {
      return 'energy';
    }
    const foodRate = getExchangeRateForAgent(agent, 'food');
    if (agent.resources.money.quantity >= foodRate.quantity) {
      return 'food';
    }
    return 'energy';
  }
  const moneyRate = getExchangeRateForAgent(agent, 'money');
  if (agent.resources.energy.quantity >= moneyRate.quantity) {
    return 'money';
  }
  const energyRate = getExchangeRateForAgent(agent, 'energy');
  if (agent.resources.food.quantity >= energyRate.quantity) {
    return 'energy';
  }
  return 'money';
}

function canAfford(agent, paymentResource, amount) {
  return agent.resources[paymentResource].quantity >= amount;
}

function buildTradeCandidate(buyer, seller, wantedResource) {
  const paymentInfo = getExchangeRateForAgent(seller, wantedResource);
  if (!isFinite(paymentInfo.quantity) || paymentInfo.quantity <= 0) {
    return null;
  }
  if (seller.resources[wantedResource].quantity < 2) {
    return null;
  }
  if (!canAfford(buyer, paymentInfo.paymentResource, paymentInfo.quantity)) {
    return null;
  }
  const sellerNeed = getScarcityResourceName(seller);
  if (
    sellerNeed !== paymentInfo.paymentResource &&
    getDominantResourceName(buyer) !== paymentInfo.paymentResource
  ) {
    return null;
  }
  const buyerPath = findPath(buyer.position, seller.position);
  if (!buyerPath.length) {
    return null;
  }
  return {
    buyerId: buyer.id,
    sellerId: seller.id,
    wantedResource: wantedResource,
    paymentResource: paymentInfo.paymentResource,
    paymentQuantity: paymentInfo.quantity,
    buyerPath: buyerPath.slice(1),
    sellerPath: [],
    score: buyerPath.length,
  };
}

function assignTrades() {
  const busyAgents = new Set();
  for (let i = 0; i < appState.tradeQueue.length; i++) {
    const trade = appState.tradeQueue[i];
    if (trade.status !== 'completed') {
      busyAgents.add(trade.buyerId);
      busyAgents.add(trade.sellerId);
    }
  }

  const shuffled = appState.agents.slice(0);
  shuffled.sort(function () {
    return Math.random() - 0.5;
  });

  for (let i = 0; i < shuffled.length; i++) {
    const buyer = shuffled[i];
    if (busyAgents.has(buyer.id) || buyer.state !== 'idle') {
      continue;
    }
    const wantedResource = resolveNeed(buyer);
    let bestTrade = null;
    for (
      let candidateIndex = 0;
      candidateIndex < appState.agents.length;
      candidateIndex++
    ) {
      const seller = appState.agents[candidateIndex];
      if (seller.id === buyer.id || busyAgents.has(seller.id)) {
        continue;
      }
      const candidate = buildTradeCandidate(buyer, seller, wantedResource);
      if (!candidate) {
        continue;
      }
      if (!bestTrade || candidate.score < bestTrade.score) {
        bestTrade = candidate;
      }
    }

    if (bestTrade) {
      const tradeId = 'trade-' + appState.tradeIdCounter++;
      const buyerAgent = appState.agentsById[bestTrade.buyerId];
      const sellerAgent = appState.agentsById[bestTrade.sellerId];
      const trade = {
        id: tradeId,
        buyerId: bestTrade.buyerId,
        sellerId: bestTrade.sellerId,
        wantedResource: bestTrade.wantedResource,
        paymentResource: bestTrade.paymentResource,
        paymentQuantity: bestTrade.paymentQuantity,
        status: 'moving',
      };
      appState.tradeQueue.push(trade);
      busyAgents.add(bestTrade.buyerId);
      busyAgents.add(bestTrade.sellerId);

      buyerAgent.path = bestTrade.buyerPath;
      buyerAgent.destination = bestTrade.buyerPath.length
        ? cloneGridPosition(bestTrade.buyerPath[bestTrade.buyerPath.length - 1])
        : cloneGridPosition(sellerAgent.position);
      buyerAgent.state = buyerAgent.path.length ? 'moving' : 'idle';
      buyerAgent.partnerTradeId = tradeId;
      buyerAgent.plannedTrade = {
        tradeId: tradeId,
        role: 'buyer',
        giveResource: bestTrade.paymentResource,
        getResource: bestTrade.wantedResource,
        amount: bestTrade.paymentQuantity,
        partnerId: sellerAgent.id,
      };

      sellerAgent.path = [];
      sellerAgent.destination = cloneGridPosition(sellerAgent.position);
      sellerAgent.state = 'idle';
      sellerAgent.partnerTradeId = tradeId;
      sellerAgent.plannedTrade = {
        tradeId: tradeId,
        role: 'seller',
        giveResource: bestTrade.wantedResource,
        getResource: bestTrade.paymentResource,
        amount: bestTrade.paymentQuantity,
        partnerId: buyerAgent.id,
      };
    }
  }
}

function resolveTradesOnArrival() {
  let completedTrades = 0;
  for (let i = appState.tradeQueue.length - 1; i >= 0; i--) {
    const trade = appState.tradeQueue[i];
    if (trade.status === 'completed') {
      continue;
    }
    const buyer = appState.agentsById[trade.buyerId];
    const seller = appState.agentsById[trade.sellerId];
    if (buyer.state === 'moving') {
      continue;
    }
    if (seller.resources[trade.wantedResource].quantity < 1) {
      clearTradeForAgent(buyer);
      clearTradeForAgent(seller);
      trade.status = 'completed';
      continue;
    }
    if (!canAfford(buyer, trade.paymentResource, trade.paymentQuantity)) {
      clearTradeForAgent(buyer);
      clearTradeForAgent(seller);
      trade.status = 'completed';
      continue;
    }

    seller.resources[trade.wantedResource].quantity -= 1;
    buyer.resources[trade.wantedResource].quantity += 1;
    buyer.resources[trade.paymentResource].quantity -= trade.paymentQuantity;
    seller.resources[trade.paymentResource].quantity += trade.paymentQuantity;
    trade.status = 'completed';
    completedTrades += 1;
    clearTradeForAgent(buyer);
    clearTradeForAgent(seller);
  }

  appState.tradeQueue = appState.tradeQueue.filter(function (trade) {
    return trade.status !== 'completed';
  });

  if (completedTrades > 0) {
    displaceOverlappingAgents();
  }
}

function clearTradeForAgent(agent) {
  agent.path = [];
  agent.destination = null;
  agent.partnerTradeId = null;
  agent.plannedTrade = null;
  agent.state = 'idle';
}

function assignIdleAgentsToHome() {
  for (let i = 0; i < appState.agents.length; i++) {
    const agent = appState.agents[i];
    if (agent.partnerTradeId || agent.plannedTrade) {
      continue;
    }
    if (agent.path.length > 0 || agent.state === 'moving') {
      continue;
    }
    if (
      agent.position.x === agent.spawnPosition.x &&
      agent.position.y === agent.spawnPosition.y
    ) {
      continue;
    }

    const pathHome = findPath(agent.position, agent.spawnPosition);
    if (pathHome.length <= 1) {
      continue;
    }

    agent.path = pathHome.slice(1);
    agent.destination = cloneGridPosition(agent.spawnPosition);
    agent.state = 'moving';
  }
}

function stepSimulation() {
  appState.tickCount += 1;
  updateRegionalState();
  assignTrades();
  resolveTradesOnArrival();
  assignIdleAgentsToHome();
  updateAgentVisuals();
  appState.chartNeedsRender = true;
  updateHud();
}

function moveAgents(deltaSeconds) {
  for (let i = 0; i < appState.agents.length; i++) {
    const agent = appState.agents[i];
    if (!agent.mesh || agent.path.length === 0) {
      if (agent.state === 'moving') {
        agent.state = 'idle';
      }
      continue;
    }
    const nextWaypoint = agent.path[0];
    const targetPosition = gridToScenePosition(nextWaypoint);
    const direction = targetPosition.clone().sub(agent.mesh.position);
    const distance = direction.length();
    const maxDistance = appState.movementSpeed * deltaSeconds;
    if (distance <= maxDistance) {
      agent.mesh.position.copy(targetPosition);
      agent.position = cloneGridPosition(nextWaypoint);
      agent.path.shift();
      agent.totalDistanceTraveled += 1;
      if (agent.path.length === 0) {
        agent.state = 'idle';
      }
    } else {
      direction.normalize().multiplyScalar(maxDistance);
      agent.mesh.position.add(direction);
      agent.state = 'moving';
    }
  }
}

function updateHud() {
  const speedLabel =
    appState.paused || appState.simulationTicksPerSecond === 0
      ? 'paused'
      : appState.movementSpeed.toFixed(1) + ' move units/sec';
  const activeTrades = appState.tradeQueue.length;
  controlsEl.sceneHud.textContent =
    'Tick: ' +
    appState.tickCount +
    '\nActive trades: ' +
    activeTrades +
    '\nMovement: ' +
    speedLabel +
    '\nSim cadence: ' +
    appState.simulationTicksPerSecond.toFixed(1) +
    ' ticks/sec' +
    '\nSpeed multiplier: ' +
    appState.simulationSpeedMultiplier.toFixed(2) +
    'x' +
    '\nMetric: ' +
    appState.metric;
}

function handlePointerMove(event) {
  const rect = sceneState.renderer.domElement.getBoundingClientRect();
  sceneState.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  sceneState.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  sceneState.pointerDirty = true;
}

function clearHoverState() {
  sceneState.hoveredAgentId = null;
  sceneState.hoverPathLine.visible = false;
  controlsEl.tooltip.style.display = 'none';
}

function updateHoverInteraction() {
  if (sceneState.pointerDirty) {
    sceneState.raycaster.setFromCamera(sceneState.pointer, sceneState.camera);
    const intersects = sceneState.raycaster.intersectObjects(
      appState.agentMeshes,
      false,
    );
    sceneState.pointerDirty = false;

    if (!intersects.length) {
      clearHoverState();
      updateAgentVisuals();
      return;
    }

    const hoveredId = intersects[0].object.userData.agentId;
    if (sceneState.hoveredAgentId !== hoveredId) {
      sceneState.hoveredAgentId = hoveredId;
      updateAgentVisuals();
    }
  }

  if (!sceneState.hoveredAgentId) {
    return;
  }

  const agent = appState.agentsById[sceneState.hoveredAgentId];
  if (!agent || !agent.mesh) {
    clearHoverState();
    return;
  }
  const linePoints = [agent.mesh.position.clone()];
  for (let i = 0; i < agent.path.length; i++) {
    linePoints.push(gridToScenePosition(agent.path[i]));
  }
  sceneState.hoverPathLine.geometry.dispose();
  sceneState.hoverPathLine.geometry = new THREE.BufferGeometry().setFromPoints(
    linePoints,
  );
  sceneState.hoverPathLine.visible = linePoints.length > 1;

  sceneState.hoverProjection.copy(agent.mesh.position);
  sceneState.hoverProjection.project(sceneState.camera);
  const canvasRect = sceneState.renderer.domElement.getBoundingClientRect();
  const tooltipX = ((sceneState.hoverProjection.x + 1) / 2) * canvasRect.width;
  const tooltipY =
    ((-sceneState.hoverProjection.y + 1) / 2) * canvasRect.height;

  const tradeText = agent.plannedTrade
    ? 'Trading ' +
      agent.plannedTrade.giveResource +
      ' for ' +
      agent.plannedTrade.getResource
    : 'Idle';
  controlsEl.tooltip.textContent =
    'Agent: ' +
    agent.id.slice(0, 12) +
    '\nRegion: ' +
    agent.region +
    '\nFood: ' +
    agent.resources.food.quantity.toFixed(2) +
    '\nEnergy: ' +
    agent.resources.energy.quantity.toFixed(2) +
    '\nMoney: ' +
    agent.resources.money.quantity.toFixed(2) +
    '\nIntent: ' +
    tradeText;
  controlsEl.tooltip.style.left = tooltipX + 'px';
  controlsEl.tooltip.style.top = tooltipY + 'px';
  controlsEl.tooltip.style.display = 'block';
}

function resizeRenderer() {
  if (!sceneState.renderer) {
    return;
  }
  const width = controlsEl.threeContainer.clientWidth;
  const height = controlsEl.threeContainer.clientHeight;
  sceneState.camera.aspect = width / height;
  sceneState.camera.updateProjectionMatrix();
  sceneState.renderer.setSize(width, height);
}

function setPauseState(isPaused) {
  appState.paused = isPaused;
  controlsEl.pauseSpeedButton.textContent = appState.paused
    ? 'Resume'
    : 'Pause';

  if (appState.paused) {
    cancelAnimationFrame(sceneState.animationHandle);
    sceneState.animationHandle = 0;
  } else if (!sceneState.animationHandle) {
    appState.lastFrameTime = performance.now();
    sceneState.animationHandle = requestAnimationFrame(animationLoop);
  }

  updateHud();
}

function animationLoop(now) {
  const deltaSeconds = Math.min(0.1, (now - appState.lastFrameTime) / 1000);
  appState.lastFrameTime = now;
  moveAgents(deltaSeconds);

  if (!appState.paused && appState.simulationTicksPerSecond > 0) {
    appState.accumulator += deltaSeconds;
    const stepDuration = 1 / appState.simulationTicksPerSecond;
    let stepCount = 0;
    while (
      appState.accumulator >= stepDuration &&
      stepCount < MAX_SIM_STEPS_PER_FRAME
    ) {
      stepSimulation();
      appState.accumulator -= stepDuration;
      stepCount += 1;
    }
  }

  appState.chartAccumulator += deltaSeconds;
  if (appState.chartAccumulator >= CHART_UPDATE_INTERVAL_SECONDS) {
    appState.chartAccumulator -= CHART_UPDATE_INTERVAL_SECONDS;
    if (appState.chartNeedsRender) {
      captureLatestMetricsForCharts();
      updateCharts();
      appState.chartNeedsRender = false;
    }
  }

  updateHoverInteraction();
  sceneState.controls.update();
  sceneState.renderer.render(sceneState.scene, sceneState.camera);
  if (appState.paused) {
    sceneState.animationHandle = 0;
    return;
  }
  sceneState.animationHandle = requestAnimationFrame(animationLoop);
}

function attachUiEvents() {
  controlsEl.pauseSpeedButton.addEventListener('click', function () {
    setPauseState(!appState.paused);
  });

  controlsEl.resetButton.addEventListener('click', function () {
    initializeWorld();
  });

  controlsEl.speedControl.addEventListener('input', function () {
    applySpeedControl();
  });

  controlsEl.metricForm.addEventListener('change', function (event) {
    if (event.target && event.target.name === 'metric') {
      appState.metric = event.target.value;
      updateCharts();
      appState.chartNeedsRender = false;
      updateHud();
    }
  });
}

function initializeWorld() {
  appState.accumulator = 0;
  appState.tickCount = 0;
  appState.tradeQueue = [];
  appState.tradeIdCounter = 0;
  appState.chartAccumulator = 0;
  appState.chartNeedsRender = true;
  appState.regionResourcePrices = [];
  appState.regionResourceQuantities = [];
  appState.regionResourceSupplies = [];
  appState.regionResourceDemands = [];
  appState.latestMetricSnapshots = null;
  appState.agents = [];
  appState.agentsById = {};
  appState.roads = generateRoadNetwork();
  createRegions();

  const requestedAgentCount = Math.max(
    20,
    Math.min(300, Number(controlsEl.agentCountInput.value) || 120),
  );
  controlsEl.agentCountInput.value = requestedAgentCount;

  for (let index = 0; index < requestedAgentCount; index++) {
    appState.agents.push(createAgent(index));
  }

  createScene();
  buildAgentMeshes();
  initializeCharts();
  applySpeedControl();
  updateRegionalState();
  captureLatestMetricsForCharts();
  updateCharts();
  appState.chartNeedsRender = false;
  updateAgentVisuals();
  clearHoverState();

  cancelAnimationFrame(sceneState.animationHandle);
  sceneState.animationHandle = 0;
  setPauseState(appState.paused);
}

attachUiEvents();
initializeWorld();

import * as THREE from './three.module.min.js';

// --- State Configurations ---
const STATES = {
  NONE: -1,
  ROTATE: 0,
  DOLLY: 1,
  PAN: 2,
};

export class OrbitControls extends THREE.EventDispatcher {
  constructor(object, domElement = document.body) {
    super();
    this.object = object;
    this.domElement = domElement;
    this.enabled = true;
    this.target = new THREE.Vector3();
    this.enableDamping = false;
    this.dampingFactor = 0.05;
    this.minDistance = 0;
    this.maxDistance = Infinity;
    this.minPolarAngle = 0;
    this.maxPolarAngle = Math.PI;
    this.minAzimuthAngle = -Infinity;
    this.maxAzimuthAngle = Infinity;
    this.rotateSpeed = 1.0;
    this.zoomSpeed = 1.0;
    this.panSpeed = 1.0;

    this.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.PAN,
    };

    this.keys = {
      LEFT: 'ArrowLeft',
      UP: 'ArrowUp',
      RIGHT: 'ArrowRight',
      BOTTOM: 'ArrowDown',
    };

    this._state = STATES.NONE;
    this._rotateStart = new THREE.Vector2();
    this._rotateEnd = new THREE.Vector2();
    this._rotateDelta = new THREE.Vector2();
    this._panStart = new THREE.Vector2();
    this._panEnd = new THREE.Vector2();
    this._panDelta = new THREE.Vector2();
    this._dollyStart = new THREE.Vector2();
    this._dollyEnd = new THREE.Vector2();
    this._dollyDelta = new THREE.Vector2();
    this._thetaDelta = 0;
    this._phiDelta = 0;
    this._scale = 1;
    this._panOffset = new THREE.Vector3();
    this._lastPosition = new THREE.Vector3();
    this._lastQuaternion = new THREE.Quaternion();

    this._changeEvent = { type: 'change' };
    this._startEvent = { type: 'start' };
    this._endEvent = { type: 'end' };

    this._bindEvents();
    this.update();
  }

  // --- Core Transform Calculations ---
  update = () => {
    const offset = this.object.position.clone().sub(this.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);

    spherical.theta += this._thetaDelta;
    spherical.phi += this._phiDelta;

    spherical.phi = Math.max(
      this.minPolarAngle,
      Math.min(this.maxPolarAngle, spherical.phi),
    );
    spherical.theta = Math.max(
      this.minAzimuthAngle,
      Math.min(this.maxAzimuthAngle, spherical.theta),
    );

    spherical.radius = Math.max(
      this.minDistance,
      Math.min(this.maxDistance, spherical.radius * this._scale),
    );

    const position = new THREE.Vector3()
      .setFromSpherical(spherical)
      .add(this.target)
      .add(this._panOffset);

    this.object.position.copy(position);
    this.object.lookAt(this.target);

    this._thetaDelta = 0;
    this._phiDelta = 0;
    this._scale = 1;
    this._panOffset.set(0, 0, 0);

    if (
      this._lastPosition.distanceToSquared(this.object.position) > 1e-12 ||
      8 * (1 - this._lastQuaternion.dot(this.object.quaternion)) > 1e-12
    ) {
      this.dispatchEvent(this._changeEvent);
      this._lastPosition.copy(this.object.position);
      this._lastQuaternion.copy(this.object.quaternion);
    }
  };

  dispose = () => {
    this.domElement?.removeEventListener('contextmenu', this._onContextMenu);
    this.domElement?.removeEventListener('mousedown', this._onMouseDown);
    this.domElement?.removeEventListener('wheel', this._onMouseWheel);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('keydown', this._onKeyDown);
  };

  // --- Positional Modifiers ---
  rotateLeft = (angle) => {
    this._thetaDelta -= angle;
  };

  rotateUp = (angle) => {
    this._phiDelta -= angle;
  };

  pan = (deltaX, deltaY) => {
    const distance = this.object.position.distanceTo(this.target);
    const panDistance = distance * 0.0015;
    this._panOffset.add(
      new THREE.Vector3(
        -deltaX * panDistance * this.panSpeed,
        deltaY * panDistance * this.panSpeed,
        0,
      ),
    );
  };

  dollyIn = (scale) => {
    this._scale /= scale;
  };

  dollyOut = (scale) => {
    this._scale *= scale;
  };

  // --- Internal Event Pipeline & Event Binding ---
  _bindEvents = () => {
    this._onContextMenu = (event) => event.preventDefault();
    this._onMouseDown = (event) => this._handleMouseDown(event);
    this._onMouseMove = (event) => this._handleMouseMove(event);
    this._onMouseUp = () => this._handleMouseUp();
    this._onMouseWheel = (event) => this._handleMouseWheel(event);
    this._onKeyDown = (event) => this._handleKeyDown(event);

    this.domElement?.addEventListener(
      'contextmenu',
      this._onContextMenu,
      false,
    );
    this.domElement?.addEventListener('mousedown', this._onMouseDown, false);
    this.domElement?.addEventListener('wheel', this._onMouseWheel, false);
    window.addEventListener('mousemove', this._onMouseMove, false);
    window.addEventListener('mouseup', this._onMouseUp, false);
    window.addEventListener('keydown', this._onKeyDown, false);
  };

  _handleMouseDown = (event) => {
    if (!this.enabled) return;
    event.preventDefault();

    if (event.button === this.mouseButtons.LEFT) {
      this._state = STATES.ROTATE;
      this._rotateStart.set(event.clientX, event.clientY);
    } else if (event.button === this.mouseButtons.MIDDLE) {
      this._state = STATES.DOLLY;
      this._dollyStart.set(event.clientX, event.clientY);
    } else if (event.button === this.mouseButtons.RIGHT) {
      this._state = STATES.PAN;
      this._panStart.set(event.clientX, event.clientY);
    }

    this.dispatchEvent(this._startEvent);
  };

  _handleMouseMove = (event) => {
    if (!this.enabled) return;
    event.preventDefault();

    const element =
      this.domElement === document ? this.domElement.body : this.domElement;
    if (!element) return;

    if (this._state === STATES.ROTATE) {
      this._rotateEnd.set(event.clientX, event.clientY);
      this._rotateDelta.subVectors(this._rotateEnd, this._rotateStart);
      this.rotateLeft(
        ((2 * Math.PI * this._rotateDelta.x) / element.clientWidth) *
          this.rotateSpeed,
      );
      this.rotateUp(
        ((2 * Math.PI * this._rotateDelta.y) / element.clientHeight) *
          this.rotateSpeed,
      );
      this._rotateStart.copy(this._rotateEnd);
    } else if (this._state === STATES.DOLLY) {
      this._dollyEnd.set(event.clientX, event.clientY);
      this._dollyDelta.subVectors(this._dollyEnd, this._dollyStart);
      if (this._dollyDelta.y > 0) {
        this.dollyIn(this._getZoomScale());
      } else if (this._dollyDelta.y < 0) {
        this.dollyOut(this._getZoomScale());
      }
      this._dollyStart.copy(this._dollyEnd);
    } else if (this._state === STATES.PAN) {
      this._panEnd.set(event.clientX, event.clientY);
      this._panDelta.subVectors(this._panEnd, this._panStart);
      this.pan(this._panDelta.x, this._panDelta.y);
      this._panStart.copy(this._panEnd);
    }
  };

  _handleMouseUp = () => {
    if (!this.enabled) return;
    this._state = STATES.NONE;
    this.dispatchEvent(this._endEvent);
  };

  _handleMouseWheel = (event) => {
    if (!this.enabled) return;
    event.preventDefault();
    if (event.deltaY > 0) {
      this.dollyOut(this._getZoomScale());
    } else {
      this.dollyIn(this._getZoomScale());
    }
  };

  _handleKeyDown = (event) => {
    if (!this.enabled) return;
    switch (event.key) {
      case this.keys.UP:
        this.pan(0, this.panSpeed);
        break;
      case this.keys.BOTTOM:
        this.pan(0, -this.panSpeed);
        break;
      case this.keys.LEFT:
        this.pan(-this.panSpeed, 0);
        break;
      case this.keys.RIGHT:
        this.pan(this.panSpeed, 0);
        break;
    }
  };

  _getZoomScale = () => Math.pow(0.95, this.zoomSpeed);
}

export default OrbitControls;

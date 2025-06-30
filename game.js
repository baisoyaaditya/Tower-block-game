console.clear();

class Stage {
  constructor() {
    this.container = document.getElementById("game");
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setClearColor("#D0CBC7", 1);
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    const aspect = window.innerWidth / window.innerHeight;
    const d = 20;
    this.camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, -100, 1000);
    this.camera.position.set(2, 2, 2);
    this.camera.lookAt(new THREE.Vector3(0, 0, 0));

    this.light = new THREE.DirectionalLight(0xffffff, 0.5);
    this.light.position.set(0, 499, 0);
    this.scene.add(this.light);

    this.softLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(this.softLight);

    window.addEventListener("resize", () => this.onResize());
    this.onResize();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  add(elem) {
    this.scene.add(elem);
  }

  remove(elem) {
    this.scene.remove(elem);
  }

  setCamera(y, speed = 0.3) {
    gsap.to(this.camera.position, { y: y + 4, duration: speed, ease: "power1.inOut" });
  }

  onResize() {
    const viewSize = 30;
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.left = window.innerWidth / -viewSize;
    this.camera.right = window.innerWidth / viewSize;
    this.camera.top = window.innerHeight / viewSize;
    this.camera.bottom = window.innerHeight / -viewSize;
    this.camera.updateProjectionMatrix();
  }
}

class Block {
  constructor(targetBlock) {
    this.STATES = { ACTIVE: "active", STOPPED: "stopped", MISSED: "missed" };
    this.MOVE_AMOUNT = 12;
    this.targetBlock = targetBlock;
    this.index = (targetBlock ? targetBlock.index : 0) + 1;
    this.workingPlane = this.index % 2 ? "x" : "z";
    this.workingDimension = this.index % 2 ? "width" : "depth";

    this.dimension = {
      width: targetBlock ? targetBlock.dimension.width : 10,
      height: targetBlock ? targetBlock.dimension.height : 2,
      depth: targetBlock ? targetBlock.dimension.depth : 10,
    };

    this.position = {
      x: targetBlock ? targetBlock.position.x : 0,
      y: this.dimension.height * this.index,
      z: targetBlock ? targetBlock.position.z : 0,
    };

    this.colorOffset = targetBlock ? targetBlock.colorOffset : Math.round(Math.random() * 100);

    if (!targetBlock) {
      this.color = new THREE.Color(0x333344);
    } else {
      const offset = this.index + this.colorOffset;
      const r = Math.sin(0.3 * offset) * 55 + 200;
      const g = Math.sin(0.3 * offset + 2) * 55 + 200;
      const b = Math.sin(0.3 * offset + 4) * 55 + 200;
      this.color = new THREE.Color(r / 255, g / 255, b / 255);
    }

    this.state = this.index > 1 ? this.STATES.ACTIVE : this.STATES.STOPPED;
    this.speed = -0.1 - this.index * 0.005;
    this.direction = this.MOVE_AMOUNT;

    const geometry = new THREE.BoxGeometry(this.dimension.width, this.dimension.height, this.dimension.depth);
    const material = new THREE.MeshLambertMaterial({ color: this.color });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.set(this.position.x, this.position.y, this.position.z);
    this.material = material;
  }

  reverseDirection() {
    this.direction = -this.direction;
  }

  place() {
    this.state = this.STATES.STOPPED;
    const delta = this.position[this.workingPlane] - this.targetBlock.position[this.workingPlane];
    const overlap = this.dimension[this.workingDimension] - Math.abs(delta);

    if (overlap <= 0) {
      this.state = this.STATES.MISSED;
      return;
    }

    const choppedDimension = Object.assign({}, this.dimension);
    choppedDimension[this.workingDimension] -= overlap;
    this.dimension[this.workingDimension] = overlap;

    const placedGeometry = new THREE.BoxGeometry(this.dimension.width, this.dimension.height, this.dimension.depth);
    const placedMesh = new THREE.Mesh(placedGeometry, this.material);
    placedMesh.position.copy(this.mesh.position);

    const choppedGeometry = new THREE.BoxGeometry(choppedDimension.width, choppedDimension.height, choppedDimension.depth);
    const choppedMesh = new THREE.Mesh(choppedGeometry, this.material);
    choppedMesh.position.copy(this.mesh.position);
    choppedMesh.position[this.workingPlane] += delta > 0 ? overlap : -overlap;

    return { placed: placedMesh, chopped: choppedMesh, plane: this.workingPlane, direction: this.direction };
  }

  tick() {
    if (this.state === this.STATES.ACTIVE) {
      this.position[this.workingPlane] += this.direction * 0.1;
      if (Math.abs(this.position[this.workingPlane]) > this.MOVE_AMOUNT) this.reverseDirection();
      this.mesh.position[this.workingPlane] = this.position[this.workingPlane];
    }
  }
}

class Game {
  constructor() {
    this.STATES = { LOADING: "loading", PLAYING: "playing", READY: "ready", ENDED: "ended", RESETTING: "resetting" };
    this.blocks = [];
    this.state = this.STATES.LOADING;
    this.stage = new Stage();

    this.mainContainer = document.getElementById("container");
    this.scoreContainer = document.getElementById("score");
    this.instructions = document.getElementById("instructions");

    this.newBlocks = new THREE.Group();
    this.placedBlocks = new THREE.Group();
    this.choppedBlocks = new THREE.Group();
    this.stage.add(this.newBlocks);
    this.stage.add(this.placedBlocks);
    this.stage.add(this.choppedBlocks);

    this.updateState(this.STATES.READY);
    this.addBlock();
    this.tick();

    document.addEventListener("keydown", (e) => e.code === "Space" && this.onAction());
    document.addEventListener("click", () => this.onAction());
  }

  updateState(newState) {
    for (const key in this.STATES) this.mainContainer.classList.remove(this.STATES[key]);
    this.mainContainer.classList.add(newState);
    this.state = newState;
  }

  onAction() {
    switch (this.state) {
      case this.STATES.READY:
        this.startGame();
        break;
      case this.STATES.PLAYING:
        this.placeBlock();
        break;
      case this.STATES.ENDED:
        this.restartGame();
        break;
    }
  }

  startGame() {
    if (this.state !== this.STATES.PLAYING) {
      this.scoreContainer.innerHTML = "0";
      this.updateState(this.STATES.PLAYING);
      this.addBlock();
    }
  }

  restartGame() {
    this.updateState(this.STATES.RESETTING);
    this.blocks = [];
    this.placedBlocks.clear();
    this.newBlocks.clear();
    this.choppedBlocks.clear();
    this.addBlock();
    this.updateState(this.STATES.READY);
  }

  placeBlock() {
    const currentBlock = this.blocks[this.blocks.length - 1];
    const newPieces = currentBlock.place();

    if (!newPieces) {
      return this.endGame();
    }

    this.newBlocks.remove(currentBlock.mesh);
    this.placedBlocks.add(newPieces.placed);
    this.choppedBlocks.add(newPieces.chopped);

    this.addBlock();
  }

  addBlock() {
    const lastBlock = this.blocks[this.blocks.length - 1];
    if (lastBlock && lastBlock.state === lastBlock.STATES.MISSED) {
      return this.endGame();
    }

    this.scoreContainer.innerHTML = String(this.blocks.length);
    const newBlock = new Block(lastBlock);
    this.newBlocks.add(newBlock.mesh);
    this.blocks.push(newBlock);
    this.stage.setCamera(this.blocks.length * 2);
    if (this.blocks.length >= 5) this.instructions.classList.add("hide");
  }

  endGame() {
    this.updateState(this.STATES.ENDED);
  }

  tick() {
    if (this.blocks.length > 0) {
      const lastBlock = this.blocks[this.blocks.length - 1];
      lastBlock.tick();
    }
    this.stage.render();
    requestAnimationFrame(() => this.tick());
  }
}

window.addEventListener("load", () => {
  if (typeof THREE === "undefined" || typeof gsap === "undefined") {
    alert("Missing THREE.js or GSAP. Make sure the libraries are loaded via CDN.");
  } else {
    new Game();
  }
});

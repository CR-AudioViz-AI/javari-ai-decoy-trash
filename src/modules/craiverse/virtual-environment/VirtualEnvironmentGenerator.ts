```typescript
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Environment preset configuration interface
 */
interface EnvironmentPreset {
  id: string;
  name: string;
  skybox: string[];
  lighting: {
    ambient: { color: string; intensity: number };
    directional: { color: string; intensity: number; position: [number, number, number] };
    fog?: { color: string; near: number; far: number };
  };
  terrain?: {
    type: 'plane' | 'heightmap' | 'custom';
    texture: string;
    scale: [number, number, number];
  };
  objects: Array<{
    type: string;
    position: [number, number, number];
    rotation?: [number, number, number];
    scale?: [number, number, number];
    material?: string;
  }>;
  physics: {
    gravity: [number, number, number];
    materials: Record<string, { friction: number; restitution: number }>;
  };
  particles?: Array<{
    type: 'snow' | 'rain' | 'dust' | 'sparks';
    count: number;
    area: [number, number, number];
  }>;
  audio?: {
    ambient?: string;
    spatialSources?: Array<{
      url: string;
      position: [number, number, number];
      volume: number;
    }>;
  };
}

/**
 * Interactive element configuration
 */
interface InteractiveElement {
  id: string;
  mesh: THREE.Mesh;
  body?: CANNON.Body;
  interactions: {
    hover?: { scale?: number; color?: string; emission?: string };
    click?: { action: string; params?: Record<string, any> };
    collision?: { action: string; params?: Record<string, any> };
  };
  audioSource?: {
    buffer: AudioBuffer;
    source?: AudioBufferSourceNode;
    panner?: PannerNode;
  };
}

/**
 * Performance optimization settings
 */
interface PerformanceSettings {
  enableLOD: boolean;
  enableFrustumCulling: boolean;
  maxDrawCalls: number;
  shadowMapSize: number;
  antialias: boolean;
  pixelRatio: number;
}

/**
 * Virtual Environment Generator for CRAIverse
 * Creates immersive 3D environments with physics, interactions, and audio
 */
export class VirtualEnvironmentGenerator {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private world: CANNON.World;
  private audioContext: AudioContext;
  private audioListener: THREE.AudioListener;
  private supabase: SupabaseClient;
  private container: HTMLElement;
  
  private interactiveElements: Map<string, InteractiveElement> = new Map();
  private particleSystems: THREE.Group[] = [];
  private materials: Map<string, THREE.Material> = new Map();
  private textures: Map<string, THREE.Texture> = new Map();
  private animationFrameId: number | null = null;
  private clock: THREE.Clock = new THREE.Clock();
  
  private raycaster: THREE.Raycaster = new THREE.Raycaster();
  private mouse: THREE.Vector2 = new THREE.Vector2();
  private hoveredElement: InteractiveElement | null = null;
  
  private performanceSettings: PerformanceSettings = {
    enableLOD: true,
    enableFrustumCulling: true,
    maxDrawCalls: 1000,
    shadowMapSize: 2048,
    antialias: true,
    pixelRatio: Math.min(window.devicePixelRatio, 2)
  };

  /**
   * Creates a new Virtual Environment Generator instance
   */
  constructor(
    container: HTMLElement,
    supabaseUrl: string,
    supabaseKey: string
  ) {
    this.container = container;
    this.supabase = createClient(supabaseUrl, supabaseKey);
    
    this.initializeRenderer();
    this.initializeScene();
    this.initializePhysics();
    this.initializeAudio();
    this.initializeMaterials();
    this.setupEventListeners();
  }

  /**
   * Initialize the Three.js renderer
   */
  private initializeRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.performanceSettings.antialias,
      alpha: true,
      powerPreference: 'high-performance'
    });
    
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(this.performanceSettings.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.setSize(this.performanceSettings.shadowMapSize, this.performanceSettings.shadowMapSize);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    
    this.container.appendChild(this.renderer.domElement);
  }

  /**
   * Initialize the Three.js scene and camera
   */
  private initializeScene(): void {
    this.scene = new THREE.Scene();
    
    this.camera = new THREE.PerspectiveCamera(
      75,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      10000
    );
    this.camera.position.set(0, 5, 10);
    
    // Add basic lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.4);
    this.scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 10, 5);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.setScalar(this.performanceSettings.shadowMapSize);
    directionalLight.shadow.camera.near = 0.1;
    directionalLight.shadow.camera.far = 500;
    directionalLight.shadow.camera.left = -50;
    directionalLight.shadow.camera.right = 50;
    directionalLight.shadow.camera.top = 50;
    directionalLight.shadow.camera.bottom = -50;
    this.scene.add(directionalLight);
  }

  /**
   * Initialize the physics engine
   */
  private initializePhysics(): void {
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0)
    });
    
    this.world.broadphase = new CANNON.NaiveBroadphase();
    this.world.solver.iterations = 10;
    
    // Default contact materials
    const groundMaterial = new CANNON.Material('ground');
    const defaultMaterial = new CANNON.Material('default');
    
    const contactMaterial = new CANNON.ContactMaterial(
      groundMaterial,
      defaultMaterial,
      {
        friction: 0.4,
        restitution: 0.3
      }
    );
    
    this.world.addContactMaterial(contactMaterial);
  }

  /**
   * Initialize spatial audio system
   */
  private initializeAudio(): void {
    try {
      this.audioContext = new AudioContext();
      this.audioListener = new THREE.AudioListener();
      this.camera.add(this.audioListener);
    } catch (error) {
      console.warn('Audio initialization failed:', error);
    }
  }

  /**
   * Initialize material library
   */
  private initializeMaterials(): void {
    // PBR Materials
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: 0x888888,
      metalness: 0.8,
      roughness: 0.2
    });
    this.materials.set('metal', metalMaterial);
    
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.05,
      transmission: 0.9,
      transparent: true
    });
    this.materials.set('glass', glassMaterial);
    
    const woodMaterial = new THREE.MeshStandardMaterial({
      color: 0x8B4513,
      metalness: 0.0,
      roughness: 0.8
    });
    this.materials.set('wood', woodMaterial);
    
    const stoneMaterial = new THREE.MeshStandardMaterial({
      color: 0x666666,
      metalness: 0.0,
      roughness: 0.9
    });
    this.materials.set('stone', stoneMaterial);
  }

  /**
   * Setup event listeners for interactions
   */
  private setupEventListeners(): void {
    const canvas = this.renderer.domElement;
    
    canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
    canvas.addEventListener('click', this.onMouseClick.bind(this));
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    
    window.addEventListener('resize', this.onWindowResize.bind(this));
  }

  /**
   * Handle mouse movement for hover interactions
   */
  private onMouseMove(event: MouseEvent): void {
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    this.updateHoverInteractions();
  }

  /**
   * Handle mouse clicks for element interactions
   */
  private onMouseClick(event: MouseEvent): void {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const interactableMeshes = Array.from(this.interactiveElements.values()).map(el => el.mesh);
    const intersects = this.raycaster.intersectObjects(interactableMeshes);
    
    if (intersects.length > 0) {
      const clickedMesh = intersects[0].object as THREE.Mesh;
      const element = Array.from(this.interactiveElements.values()).find(el => el.mesh === clickedMesh);
      
      if (element?.interactions.click) {
        this.executeInteraction(element, 'click');
      }
    }
  }

  /**
   * Update hover interactions
   */
  private updateHoverInteractions(): void {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const interactableMeshes = Array.from(this.interactiveElements.values()).map(el => el.mesh);
    const intersects = this.raycaster.intersectObjects(interactableMeshes);
    
    // Reset previous hover state
    if (this.hoveredElement) {
      this.resetElementState(this.hoveredElement);
      this.hoveredElement = null;
    }
    
    // Apply new hover state
    if (intersects.length > 0) {
      const hoveredMesh = intersects[0].object as THREE.Mesh;
      const element = Array.from(this.interactiveElements.values()).find(el => el.mesh === hoveredMesh);
      
      if (element?.interactions.hover) {
        this.hoveredElement = element;
        this.applyHoverState(element);
      }
    }
  }

  /**
   * Apply hover state to element
   */
  private applyHoverState(element: InteractiveElement): void {
    const hover = element.interactions.hover;
    if (!hover) return;
    
    if (hover.scale) {
      element.mesh.scale.multiplyScalar(hover.scale);
    }
    
    if (hover.color && element.mesh.material instanceof THREE.MeshStandardMaterial) {
      element.mesh.material.color.setHex(parseInt(hover.color.replace('#', '0x')));
    }
    
    if (hover.emission && element.mesh.material instanceof THREE.MeshStandardMaterial) {
      element.mesh.material.emissive.setHex(parseInt(hover.emission.replace('#', '0x')));
    }
    
    this.container.style.cursor = 'pointer';
  }

  /**
   * Reset element to original state
   */
  private resetElementState(element: InteractiveElement): void {
    element.mesh.scale.set(1, 1, 1);
    
    if (element.mesh.material instanceof THREE.MeshStandardMaterial) {
      element.mesh.material.color.setHex(0xffffff);
      element.mesh.material.emissive.setHex(0x000000);
    }
    
    this.container.style.cursor = 'default';
  }

  /**
   * Execute interaction action
   */
  private executeInteraction(element: InteractiveElement, type: string): void {
    const interaction = element.interactions[type as keyof typeof element.interactions];
    if (!interaction || typeof interaction !== 'object' || !('action' in interaction)) return;
    
    // Play audio if available
    if (element.audioSource && this.audioContext) {
      this.playElementAudio(element);
    }
    
    // Execute custom action
    switch (interaction.action) {
      case 'teleport':
        if (interaction.params?.position) {
          this.camera.position.fromArray(interaction.params.position);
        }
        break;
      case 'animate':
        this.animateElement(element, interaction.params);
        break;
      case 'spawn':
        this.spawnObject(interaction.params);
        break;
      default:
        console.log(`Interaction: ${interaction.action}`, interaction.params);
    }
  }

  /**
   * Play audio for interactive element
   */
  private playElementAudio(element: InteractiveElement): void {
    if (!element.audioSource?.buffer || !this.audioContext) return;
    
    try {
      const source = this.audioContext.createBufferSource();
      source.buffer = element.audioSource.buffer;
      
      if (element.audioSource.panner) {
        source.connect(element.audioSource.panner);
        element.audioSource.panner.connect(this.audioContext.destination);
      } else {
        source.connect(this.audioContext.destination);
      }
      
      source.start();
    } catch (error) {
      console.warn('Audio playback failed:', error);
    }
  }

  /**
   * Animate interactive element
   */
  private animateElement(element: InteractiveElement, params: any): void {
    if (!params) return;
    
    const duration = params.duration || 1000;
    const startTime = Date.now();
    const startPosition = element.mesh.position.clone();
    const startRotation = element.mesh.rotation.clone();
    const startScale = element.mesh.scale.clone();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = this.easeInOutCubic(progress);
      
      if (params.position) {
        element.mesh.position.lerpVectors(startPosition, new THREE.Vector3().fromArray(params.position), eased);
      }
      
      if (params.rotation) {
        element.mesh.rotation.setFromVector3(
          new THREE.Vector3().lerpVectors(
            new THREE.Vector3(startRotation.x, startRotation.y, startRotation.z),
            new THREE.Vector3().fromArray(params.rotation),
            eased
          )
        );
      }
      
      if (params.scale) {
        element.mesh.scale.lerpVectors(startScale, new THREE.Vector3().fromArray(params.scale), eased);
      }
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    
    animate();
  }

  /**
   * Easing function for animations
   */
  private easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * Spawn new object in the scene
   */
  private spawnObject(params: any): void {
    if (!params?.type) return;
    
    let geometry: THREE.BufferGeometry;
    
    switch (params.type) {
      case 'cube':
        geometry = new THREE.BoxGeometry(1, 1, 1);
        break;
      case 'sphere':
        geometry = new THREE.SphereGeometry(0.5, 32, 32);
        break;
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
        break;
      default:
        return;
    }
    
    const material = this.materials.get(params.material || 'metal') || new THREE.MeshStandardMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    
    if (params.position) {
      mesh.position.fromArray(params.position);
    }
    
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    this.scene.add(mesh);
    
    // Add physics body if needed
    if (params.physics) {
      this.addPhysicsBody(mesh, params.type);
    }
  }

  /**
   * Add physics body to mesh
   */
  private addPhysicsBody(mesh: THREE.Mesh, type: string): CANNON.Body {
    let shape: CANNON.Shape;
    
    switch (type) {
      case 'cube':
        shape = new CANNON.Sphere(0.5);
        break;
      case 'sphere':
        shape = new CANNON.Sphere(0.5);
        break;
      case 'cylinder':
        shape = new CANNON.Cylinder(0.5, 0.5, 1, 8);
        break;
      default:
        shape = new CANNON.Sphere(0.5);
    }
    
    const body = new CANNON.Body({ mass: 1 });
    body.addShape(shape);
    body.position.copy(mesh.position as any);
    
    this.world.addBody(body);
    return body;
  }

  /**
   * Handle window resize
   */
  private onWindowResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    
    this.renderer.setSize(width, height);
  }

  /**
   * Load environment preset
   */
  public async loadEnvironmentPreset(presetId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('environment_presets')
        .select('*')
        .eq('id', presetId)
        .single();
      
      if (error) throw error;
      
      const preset = data as EnvironmentPreset;
      await this.applyEnvironmentPreset(preset);
    } catch (error) {
      console.error('Failed to load environment preset:', error);
      throw error;
    }
  }

  /**
   * Apply environment preset to scene
   */
  private async applyEnvironmentPreset(preset: EnvironmentPreset): Promise<void> {
    // Clear existing scene
    this.clearScene();
    
    // Apply skybox
    if (preset.skybox && preset.skybox.length === 6) {
      const loader = new THREE.CubeTextureLoader();
      const skyboxTexture = loader.load(preset.skybox);
      this.scene.background = skyboxTexture;
    }
    
    // Apply lighting
    this.applyLighting(preset.lighting);
    
    // Apply physics settings
    this.world.gravity.set(...preset.physics.gravity);
    
    // Add terrain
    if (preset.terrain) {
      await this.addTerrain(preset.terrain);
    }
    
    // Add objects
    for (const obj of preset.objects) {
      await this.addPresetObject(obj);
    }
    
    // Add particle systems
    if (preset.particles) {
      for (const particle of preset.particles) {
        this.addParticleSystem(particle);
      }
    }
    
    // Setup spatial audio
    if (preset.audio) {
      await this.setupSpatialAudio(preset.audio);
    }
  }

  /**
   * Clear existing scene objects
   */
  private clearScene(): void {
    // Remove all objects except lights and camera
    const objectsToRemove: THREE.Object3D[] = [];
    
    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Group) {
        if (child.parent === this.scene) {
          objectsToRemove.push(child);
        }
      }
    });
    
    objectsToRemove.forEach(obj => {
      this.scene.remove(obj);
    });
    
    // Clear interactive elements
    this.interactiveElements.clear();
    
    // Clear particle systems
    this.particleSystems.forEach(system => this.scene.remove(system));
    this.particleSystems = [];
    
    // Clear physics bodies
    this.world.bodies.forEach(body => this.world.removeBody(body));
  }

  /**
   * Apply lighting configuration
   */
  private applyLighting(lighting: EnvironmentPreset['lighting']): void {
    // Remove existing lights
    const lightsToRemove: THREE.Light[] = [];
    this.scene.traverse((child) => {
      if (child instanceof THREE.Light) {
        lightsToRemove.push(child);
      }
    });
    lightsToRemove.forEach(light => this.scene.remove(light));
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(
      parseInt(lighting.ambient.color.replace('#', '0x')),
      lighting.ambient.intensity
    );
    this.scene.add(ambientLight);
    
    // Add directional light
    const directionalLight = new THREE.DirectionalLight(
      parseInt(lighting.directional.color.replace('#', '0x')),
      lighting.directional.intensity
    );
    directionalLight.position.set(...lighting.directional.position);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.setScalar(this.performanceSettings.shadowMapSize);
    this.scene.add(directionalLight);
    
    // Add fog if specified
    if (lighting.fog) {
      this.scene.fog = new THREE.Fog
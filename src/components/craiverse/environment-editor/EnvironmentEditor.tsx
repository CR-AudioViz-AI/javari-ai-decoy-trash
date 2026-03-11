```tsx
'use client';

import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { 
  OrbitControls, 
  Grid, 
  TransformControls, 
  GizmoHelper, 
  GizmoViewport,
  useHelper,
  Plane
} from '@react-three/drei';
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  DragStartEvent,
  DragEndEvent,
  closestCenter
} from '@dnd-kit/core';
import { 
  restrictToWindowEdges,
  snapCenterToCursor 
} from '@dnd-kit/modifiers';
import * as THREE from 'three';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

// UI Components
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// Icons
import {
  Save,
  Upload,
  Download,
  RotateCcw,
  Eye,
  EyeOff,
  Move,
  RotateCw,
  Scale,
  Grid3x3,
  Layers,
  Settings,
  Box,
  Sphere,
  Cylinder,
  Cone,
  Trash2,
  Copy,
  Play,
  Pause
} from 'lucide-react';

// Types
interface Vector3 {
  x: number;
  y: number;
  z: number;
}

interface EnvironmentObject {
  id: string;
  type: 'cube' | 'sphere' | 'cylinder' | 'cone' | 'plane' | 'custom';
  position: Vector3;
  rotation: Vector3;
  scale: Vector3;
  material: {
    color: string;
    roughness: number;
    metalness: number;
    transparent: boolean;
    opacity: number;
  };
  physics: {
    enabled: boolean;
    mass: number;
    friction: number;
    restitution: number;
    isStatic: boolean;
  };
  visible: boolean;
  layer: string;
  name: string;
}

interface TerrainData {
  heightMap: Float32Array;
  width: number;
  height: number;
  scale: number;
  texture: string;
}

interface EnvironmentState {
  objects: EnvironmentObject[];
  terrain: TerrainData | null;
  selectedObjectId: string | null;
  layers: Array<{ id: string; name: string; visible: boolean }>;
  gridEnabled: boolean;
  gridSize: number;
  physicsEnabled: boolean;
  transformMode: 'translate' | 'rotate' | 'scale';
}

// Store
interface EnvironmentStore extends EnvironmentState {
  addObject: (object: Omit<EnvironmentObject, 'id'>) => void;
  updateObject: (id: string, updates: Partial<EnvironmentObject>) => void;
  removeObject: (id: string) => void;
  selectObject: (id: string | null) => void;
  setTransformMode: (mode: 'translate' | 'rotate' | 'scale') => void;
  toggleGrid: () => void;
  setGridSize: (size: number) => void;
  togglePhysics: () => void;
  addLayer: (name: string) => void;
  toggleLayerVisibility: (id: string) => void;
  setTerrain: (terrain: TerrainData | null) => void;
  reset: () => void;
}

const useEnvironmentStore = create<EnvironmentStore>()(
  subscribeWithSelector((set, get) => ({
    objects: [],
    terrain: null,
    selectedObjectId: null,
    layers: [
      { id: 'default', name: 'Default Layer', visible: true },
      { id: 'terrain', name: 'Terrain', visible: true },
      { id: 'props', name: 'Props', visible: true }
    ],
    gridEnabled: true,
    gridSize: 1,
    physicsEnabled: false,
    transformMode: 'translate',

    addObject: (object) => {
      const newObject: EnvironmentObject = {
        ...object,
        id: `obj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      };
      set((state) => ({
        objects: [...state.objects, newObject],
        selectedObjectId: newObject.id
      }));
    },

    updateObject: (id, updates) => {
      set((state) => ({
        objects: state.objects.map(obj => 
          obj.id === id ? { ...obj, ...updates } : obj
        )
      }));
    },

    removeObject: (id) => {
      set((state) => ({
        objects: state.objects.filter(obj => obj.id !== id),
        selectedObjectId: state.selectedObjectId === id ? null : state.selectedObjectId
      }));
    },

    selectObject: (id) => {
      set({ selectedObjectId: id });
    },

    setTransformMode: (mode) => {
      set({ transformMode: mode });
    },

    toggleGrid: () => {
      set((state) => ({ gridEnabled: !state.gridEnabled }));
    },

    setGridSize: (size) => {
      set({ gridSize: size });
    },

    togglePhysics: () => {
      set((state) => ({ physicsEnabled: !state.physicsEnabled }));
    },

    addLayer: (name) => {
      const newLayer = {
        id: `layer_${Date.now()}`,
        name,
        visible: true
      };
      set((state) => ({
        layers: [...state.layers, newLayer]
      }));
    },

    toggleLayerVisibility: (id) => {
      set((state) => ({
        layers: state.layers.map(layer =>
          layer.id === id ? { ...layer, visible: !layer.visible } : layer
        )
      }));
    },

    setTerrain: (terrain) => {
      set({ terrain });
    },

    reset: () => {
      set({
        objects: [],
        terrain: null,
        selectedObjectId: null,
        gridEnabled: true,
        gridSize: 1,
        physicsEnabled: false,
        transformMode: 'translate'
      });
    }
  }))
);

// Object Templates
const objectTemplates = [
  {
    type: 'cube' as const,
    name: 'Cube',
    icon: Box,
    defaultProps: {
      position: { x: 0, y: 0.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      material: {
        color: '#8b5cf6',
        roughness: 0.4,
        metalness: 0.2,
        transparent: false,
        opacity: 1
      },
      physics: {
        enabled: true,
        mass: 1,
        friction: 0.3,
        restitution: 0.3,
        isStatic: false
      },
      visible: true,
      layer: 'default',
      name: 'Cube'
    }
  },
  {
    type: 'sphere' as const,
    name: 'Sphere',
    icon: Sphere,
    defaultProps: {
      position: { x: 0, y: 0.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      material: {
        color: '#06b6d4',
        roughness: 0.1,
        metalness: 0.8,
        transparent: false,
        opacity: 1
      },
      physics: {
        enabled: true,
        mass: 1,
        friction: 0.3,
        restitution: 0.8,
        isStatic: false
      },
      visible: true,
      layer: 'default',
      name: 'Sphere'
    }
  },
  {
    type: 'cylinder' as const,
    name: 'Cylinder',
    icon: Cylinder,
    defaultProps: {
      position: { x: 0, y: 0.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      material: {
        color: '#10b981',
        roughness: 0.6,
        metalness: 0.1,
        transparent: false,
        opacity: 1
      },
      physics: {
        enabled: true,
        mass: 1,
        friction: 0.4,
        restitution: 0.2,
        isStatic: false
      },
      visible: true,
      layer: 'default',
      name: 'Cylinder'
    }
  }
];

// 3D Scene Components
const SceneObject: React.FC<{ object: EnvironmentObject }> = ({ object }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { selectedObjectId, selectObject } = useEnvironmentStore();
  const isSelected = selectedObjectId === object.id;

  const geometry = useMemo(() => {
    switch (object.type) {
      case 'cube':
        return new THREE.BoxGeometry(1, 1, 1);
      case 'sphere':
        return new THREE.SphereGeometry(0.5, 32, 32);
      case 'cylinder':
        return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
      case 'cone':
        return new THREE.ConeGeometry(0.5, 1, 32);
      case 'plane':
        return new THREE.PlaneGeometry(1, 1);
      default:
        return new THREE.BoxGeometry(1, 1, 1);
    }
  }, [object.type]);

  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: object.material.color,
      roughness: object.material.roughness,
      metalness: object.material.metalness,
      transparent: object.material.transparent,
      opacity: object.material.opacity
    });
  }, [object.material]);

  if (!object.visible) return null;

  return (
    <mesh
      ref={meshRef}
      geometry={geometry}
      material={material}
      position={[object.position.x, object.position.y, object.position.z]}
      rotation={[object.rotation.x, object.rotation.y, object.rotation.z]}
      scale={[object.scale.x, object.scale.y, object.scale.z]}
      onClick={(e) => {
        e.stopPropagation();
        selectObject(object.id);
      }}
      userData={{ objectId: object.id }}
    >
      {isSelected && (
        <meshBasicMaterial
          color="#ff6b6b"
          transparent
          opacity={0.1}
          wireframe
        />
      )}
    </mesh>
  );
};

const TransformGizmo: React.FC = () => {
  const { selectedObjectId, transformMode, updateObject, objects } = useEnvironmentStore();
  const selectedObject = objects.find(obj => obj.id === selectedObjectId);

  if (!selectedObject) return null;

  return (
    <TransformControls
      mode={transformMode}
      position={[selectedObject.position.x, selectedObject.position.y, selectedObject.position.z]}
      rotation={[selectedObject.rotation.x, selectedObject.rotation.y, selectedObject.rotation.z]}
      scale={[selectedObject.scale.x, selectedObject.scale.y, selectedObject.scale.z]}
      onObjectChange={(e) => {
        if (!e?.target) return;
        
        const matrix = e.target.matrix;
        const position = new THREE.Vector3();
        const rotation = new THREE.Euler();
        const scale = new THREE.Vector3();
        
        matrix.decompose(position, new THREE.Quaternion().setFromEuler(rotation), scale);
        
        updateObject(selectedObjectId!, {
          position: { x: position.x, y: position.y, z: position.z },
          rotation: { x: rotation.x, y: rotation.y, z: rotation.z },
          scale: { x: scale.x, y: scale.y, z: scale.z }
        });
      }}
    />
  );
};

const SceneGrid: React.FC = () => {
  const { gridEnabled, gridSize } = useEnvironmentStore();

  if (!gridEnabled) return null;

  return (
    <Grid
      args={[50, 50]}
      cellSize={gridSize}
      cellThickness={0.5}
      cellColor="#6b7280"
      sectionSize={5}
      sectionThickness={1}
      sectionColor="#9ca3af"
      fadeDistance={100}
      fadeStrength={1}
      followCamera={false}
      infiniteGrid
    />
  );
};

const PreviewViewport: React.FC = () => {
  const { objects } = useEnvironmentStore();

  return (
    <div className="w-full h-full bg-slate-900 rounded-lg overflow-hidden">
      <Canvas
        camera={{ position: [10, 10, 10], fov: 50 }}
        shadows
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[10, 10, 5]}
          intensity={1}
          shadow-mapSize={[2048, 2048]}
          castShadow
        />
        
        <SceneGrid />
        
        {objects.map((object) => (
          <SceneObject key={object.id} object={object} />
        ))}
        
        <TransformGizmo />
        
        <OrbitControls
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          dampingFactor={0.05}
          minDistance={1}
          maxDistance={100}
        />
        
        <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
          <GizmoViewport
            axisColors={['#9d4b4b', '#2f7f32', '#3b5b9d']}
            labelColor="white"
          />
        </GizmoHelper>
      </Canvas>
    </div>
  );
};

// UI Panels
const ObjectPalette: React.FC = () => {
  const { addObject } = useEnvironmentStore();

  const handleObjectAdd = (template: typeof objectTemplates[0]) => {
    addObject({
      ...template.defaultProps,
      type: template.type
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Object Palette</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {objectTemplates.map((template) => {
          const IconComponent = template.icon;
          return (
            <Button
              key={template.type}
              variant="ghost"
              className="w-full justify-start gap-2"
              onClick={() => handleObjectAdd(template)}
            >
              <IconComponent className="h-4 w-4" />
              {template.name}
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
};

const PropertyInspector: React.FC = () => {
  const { selectedObjectId, objects, updateObject } = useEnvironmentStore();
  const selectedObject = objects.find(obj => obj.id === selectedObjectId);

  if (!selectedObject) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Properties</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Select an object to edit its properties
          </p>
        </CardContent>
      </Card>
    );
  }

  const handlePropertyChange = (path: string, value: any) => {
    const pathArray = path.split('.');
    const updates: any = {};
    
    if (pathArray.length === 1) {
      updates[pathArray[0]] = value;
    } else if (pathArray.length === 2) {
      updates[pathArray[0]] = {
        ...selectedObject[pathArray[0] as keyof EnvironmentObject],
        [pathArray[1]]: value
      };
    }
    
    updateObject(selectedObject.id, updates);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Properties</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          <div className="space-y-4">
            {/* Basic Properties */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Name</Label>
              <Input
                value={selectedObject.name}
                onChange={(e) => handlePropertyChange('name', e.target.value)}
                className="h-8"
              />
            </div>

            {/* Transform */}
            <Separator />
            <div className="space-y-3">
              <Label className="text-xs font-medium">Transform</Label>
              
              {/* Position */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Position</Label>
                <div className="grid grid-cols-3 gap-1">
                  {['x', 'y', 'z'].map((axis) => (
                    <Input
                      key={axis}
                      type="number"
                      step="0.1"
                      value={selectedObject.position[axis as keyof Vector3]}
                      onChange={(e) => 
                        handlePropertyChange('position', {
                          ...selectedObject.position,
                          [axis]: parseFloat(e.target.value) || 0
                        })
                      }
                      className="h-8 text-xs"
                      placeholder={axis.toUpperCase()}
                    />
                  ))}
                </div>
              </div>

              {/* Rotation */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Rotation</Label>
                <div className="grid grid-cols-3 gap-1">
                  {['x', 'y', 'z'].map((axis) => (
                    <Input
                      key={axis}
                      type="number"
                      step="0.1"
                      value={THREE.MathUtils.radToDeg(selectedObject.rotation[axis as keyof Vector3])}
                      onChange={(e) => 
                        handlePropertyChange('rotation', {
                          ...selectedObject.rotation,
                          [axis]: THREE.MathUtils.degToRad(parseFloat(e.target.value) || 0)
                        })
                      }
                      className="h-8 text-xs"
                      placeholder={axis.toUpperCase()}
                    />
                  ))}
                </div>
              </div>

              {/* Scale */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Scale</Label>
                <div className="grid grid-cols-3 gap-1">
                  {['x', 'y', 'z'].map((axis) => (
                    <Input
                      key={axis}
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={selectedObject.scale[axis as keyof Vector3]}
                      onChange={(e) => 
                        handlePropertyChange('scale', {
                          ...selectedObject.scale,
                          [axis]: Math.max(0.1, parseFloat(e.target.value) || 1)
                        })
                      }
                      className="h-8 text-xs"
                      placeholder={axis.toUpperCase()}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Material */}
            <Separator />
            <div className="space-y-3">
              <Label className="text-xs font-medium">Material</Label>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Color</Label>
                  <Input
                    type="color"
                    value={selectedObject.material.color}
                    onChange={(e) => handlePropertyChange('material.color', e.target.value)}
                    className="w-12 h-8 p-0 border-0"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Roughness</Label>
                  <Slider
                    value={[selectedObject.material.roughness]}
                    onValueChange={([value]) => handlePropertyChange('material.roughness', value)}
                    min={0}
                    max={1}
                    step={0.1}
                    className="py-2"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Metalness</Label>
                  <Slider
                    value={[selectedObject.material.metalness]}
                    onValueChange={([value]) => handlePropertyChange('material.metalness', value)}
                    min={0}
                    max={1}
                    step={0.1}
                    className="py-2"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Transparent</Label>
                  <Switch
                    checked={selectedObject.material.transparent}
                    onCheckedChange={(checked) => handlePropertyChange('material.transparent', checked)}
                  />
                </div>

                {selectedObject.material.transparent && (
                  <div className="space-y-1">
                    <Label className="text
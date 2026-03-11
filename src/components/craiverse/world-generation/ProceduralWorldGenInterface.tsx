```tsx
'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay, useDraggable, useDroppable } from '@dnd-kit/core';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { 
  Mountain, 
  Trees, 
  Waves, 
  Sun, 
  Cloud, 
  Eye, 
  EyeOff,
  Play, 
  Pause, 
  RotateCcw, 
  Save, 
  Upload,
  Download,
  Plus,
  Minus,
  Settings2,
  Layers,
  MapPin,
  Zap,
  Palette,
  Grid3X3
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface WorldObject {
  id: string;
  type: string;
  name: string;
  icon: React.ReactNode;
  position: { x: number; y: number };
  scale: number;
  rotation: number;
  properties: Record<string, any>;
}

interface TerrainSettings {
  seed: number;
  scale: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
  heightMultiplier: number;
  waterLevel: number;
}

interface BiomeRule {
  id: string;
  name: string;
  heightRange: [number, number];
  moistureRange: [number, number];
  temperatureRange: [number, number];
  color: string;
  objects: string[];
}

interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  type: 'terrain' | 'objects' | 'lighting' | 'weather' | 'collision';
}

interface ProceduralWorldGenInterfaceProps {
  className?: string;
  onSave?: (worldData: any) => void;
  onLoad?: (worldId: string) => void;
  collaborative?: boolean;
  maxCanvasSize?: { width: number; height: number };
  availableObjects?: WorldObject[];
  defaultBiomes?: BiomeRule[];
  onPreview?: (worldData: any) => void;
}

const ProceduralWorldGenInterface: React.FC<ProceduralWorldGenInterfaceProps> = ({
  className,
  onSave,
  onLoad,
  collaborative = false,
  maxCanvasSize = { width: 2048, height: 2048 },
  availableObjects = [],
  defaultBiomes = [],
  onPreview
}) => {
  // State management
  const [activeTab, setActiveTab] = useState('terrain');
  const [draggedItem, setDraggedItem] = useState<WorldObject | null>(null);
  const [placedObjects, setPlacedObjects] = useState<WorldObject[]>([]);
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [previewMode, setPreviewMode] = useState<'2d' | '3d'>('2d');
  
  // Canvas and viewport
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1024, height: 1024 });
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  
  // Terrain settings
  const [terrainSettings, setTerrainSettings] = useState<TerrainSettings>({
    seed: Math.floor(Math.random() * 10000),
    scale: 100,
    octaves: 4,
    persistence: 0.5,
    lacunarity: 2.0,
    heightMultiplier: 50,
    waterLevel: 20
  });
  
  // Biomes and rules
  const [biomes, setBiomes] = useState<BiomeRule[]>(defaultBiomes);
  const [activeBiome, setActiveBiome] = useState<string | null>(null);
  
  // Layers
  const [layers, setLayers] = useState<Layer[]>([
    { id: 'terrain', name: 'Terrain', visible: true, locked: false, opacity: 1, type: 'terrain' },
    { id: 'objects', name: 'Objects', visible: true, locked: false, opacity: 1, type: 'objects' },
    { id: 'lighting', name: 'Lighting', visible: true, locked: false, opacity: 0.8, type: 'lighting' },
    { id: 'weather', name: 'Weather', visible: true, locked: false, opacity: 0.6, type: 'weather' },
    { id: 'collision', name: 'Collision', visible: false, locked: false, opacity: 0.5, type: 'collision' }
  ]);
  
  // Lighting and weather
  const [lightingSettings, setLightingSettings] = useState({
    sunPosition: { x: 0.5, y: 0.8 },
    sunIntensity: 1.0,
    ambientLight: 0.3,
    shadowQuality: 'medium'
  });
  
  const [weatherSettings, setWeatherSettings] = useState({
    enabled: false,
    type: 'clear',
    intensity: 0.5,
    windDirection: 0,
    windSpeed: 1.0
  });

  // Default available objects
  const defaultObjects: WorldObject[] = [
    {
      id: 'tree-oak',
      type: 'vegetation',
      name: 'Oak Tree',
      icon: <Trees className="w-4 h-4" />,
      position: { x: 0, y: 0 },
      scale: 1,
      rotation: 0,
      properties: { health: 100, growthRate: 1.0 }
    },
    {
      id: 'rock-large',
      type: 'terrain',
      name: 'Large Rock',
      icon: <Mountain className="w-4 h-4" />,
      position: { x: 0, y: 0 },
      scale: 1,
      rotation: 0,
      properties: { hardness: 10, breakable: false }
    },
    {
      id: 'water-source',
      type: 'water',
      name: 'Water Source',
      icon: <Waves className="w-4 h-4" />,
      position: { x: 0, y: 0 },
      scale: 1,
      rotation: 0,
      properties: { flowRate: 1.0, depth: 5 }
    },
    {
      id: 'spawn-point',
      type: 'system',
      name: 'Spawn Point',
      icon: <MapPin className="w-4 h-4" />,
      position: { x: 0, y: 0 },
      scale: 1,
      rotation: 0,
      properties: { priority: 1, teamId: null }
    }
  ];

  const objectLibrary = availableObjects.length > 0 ? availableObjects : defaultObjects;

  // Drag and drop handlers
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const draggedObject = objectLibrary.find(obj => obj.id === event.active.id);
    if (draggedObject) {
      setDraggedItem(draggedObject);
    }
  }, [objectLibrary]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && over.id === 'canvas-drop-zone') {
      const draggedObject = objectLibrary.find(obj => obj.id === active.id);
      if (draggedObject) {
        const canvasRect = canvasRef.current?.getBoundingClientRect();
        if (canvasRect) {
          const newObject: WorldObject = {
            ...draggedObject,
            id: `${draggedObject.id}-${Date.now()}`,
            position: {
              x: Math.random() * canvasSize.width,
              y: Math.random() * canvasSize.height
            }
          };
          setPlacedObjects(prev => [...prev, newObject]);
        }
      }
    }
    
    setDraggedItem(null);
  }, [objectLibrary, canvasSize]);

  // Terrain generation
  const generateTerrain = useCallback(async () => {
    setIsGenerating(true);
    setGenerationProgress(0);
    
    try {
      // Simulate terrain generation progress
      for (let i = 0; i <= 100; i += 10) {
        setGenerationProgress(i);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // Generate heightmap using canvas
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          const imageData = ctx.createImageData(canvasSize.width, canvasSize.height);
          
          // Simple noise generation for demonstration
          for (let x = 0; x < canvasSize.width; x++) {
            for (let y = 0; y < canvasSize.height; y++) {
              const noise = Math.random() * 255;
              const index = (y * canvasSize.width + x) * 4;
              imageData.data[index] = noise;     // R
              imageData.data[index + 1] = noise; // G
              imageData.data[index + 2] = noise; // B
              imageData.data[index + 3] = 255;   // A
            }
          }
          
          ctx.putImageData(imageData, 0, 0);
        }
      }
    } catch (error) {
      console.error('Terrain generation failed:', error);
    } finally {
      setIsGenerating(false);
      setGenerationProgress(0);
    }
  }, [terrainSettings, canvasSize]);

  // Layer management
  const toggleLayerVisibility = useCallback((layerId: string) => {
    setLayers(prev => prev.map(layer => 
      layer.id === layerId 
        ? { ...layer, visible: !layer.visible }
        : layer
    ));
  }, []);

  const updateLayerOpacity = useCallback((layerId: string, opacity: number) => {
    setLayers(prev => prev.map(layer => 
      layer.id === layerId 
        ? { ...layer, opacity: opacity / 100 }
        : layer
    ));
  }, []);

  // Save/Load functionality
  const handleSave = useCallback(() => {
    const worldData = {
      terrainSettings,
      placedObjects,
      biomes,
      layers,
      lightingSettings,
      weatherSettings,
      canvasSize,
      timestamp: Date.now()
    };
    
    onSave?.(worldData);
  }, [terrainSettings, placedObjects, biomes, layers, lightingSettings, weatherSettings, canvasSize, onSave]);

  const handlePreview = useCallback(() => {
    const worldData = {
      terrainSettings,
      placedObjects,
      biomes,
      layers,
      lightingSettings,
      weatherSettings,
      canvasSize
    };
    
    onPreview?.(worldData);
  }, [terrainSettings, placedObjects, biomes, layers, lightingSettings, weatherSettings, canvasSize, onPreview]);

  // Draggable object component
  const DraggableObject: React.FC<{ object: WorldObject }> = ({ object }) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
      id: object.id
    });

    return (
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        className={cn(
          "flex items-center gap-2 p-2 rounded-md border bg-card cursor-grab hover:bg-accent transition-colors",
          isDragging && "opacity-50"
        )}
        role="button"
        tabIndex={0}
        aria-label={`Drag ${object.name} to canvas`}
      >
        {object.icon}
        <span className="text-sm font-medium">{object.name}</span>
      </div>
    );
  };

  // Canvas drop zone
  const CanvasDropZone: React.FC = () => {
    const { setNodeRef, isOver } = useDroppable({
      id: 'canvas-drop-zone'
    });

    return (
      <div
        ref={setNodeRef}
        className={cn(
          "relative w-full h-full border-2 border-dashed border-border rounded-lg overflow-hidden",
          isOver && "border-primary bg-primary/5"
        )}
      >
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="w-full h-full object-contain bg-background"
          style={{ transform: `scale(${viewport.zoom})` }}
          aria-label="World generation canvas"
        />
        
        {/* Placed objects overlay */}
        <div className="absolute inset-0 pointer-events-none">
          {placedObjects.map(object => (
            <div
              key={object.id}
              className="absolute pointer-events-auto cursor-pointer hover:scale-110 transition-transform"
              style={{
                left: `${(object.position.x / canvasSize.width) * 100}%`,
                top: `${(object.position.y / canvasSize.height) * 100}%`,
                transform: `translate(-50%, -50%) scale(${object.scale}) rotate(${object.rotation}deg)`
              }}
              onClick={() => setSelectedObject(selectedObject === object.id ? null : object.id)}
              role="button"
              tabIndex={0}
              aria-label={`Select ${object.name}`}
            >
              <div className={cn(
                "p-2 rounded-md bg-background/80 border shadow-sm",
                selectedObject === object.id && "ring-2 ring-primary"
              )}>
                {object.icon}
              </div>
            </div>
          ))}
        </div>
        
        {/* Grid overlay */}
        {layers.find(l => l.id === 'terrain')?.visible && (
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <Grid3X3 className="w-full h-full text-muted-foreground" />
          </div>
        )}
      </div>
    );
  };

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className={cn("flex h-screen bg-background", className)}>
        {/* Left Sidebar - Tools */}
        <Card className="w-80 rounded-none border-r">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="w-5 h-5" />
              World Generation Tools
            </CardTitle>
          </CardHeader>
          
          <CardContent className="p-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
              <TabsList className="grid w-full grid-cols-4 mx-3">
                <TabsTrigger value="terrain" className="text-xs">
                  <Mountain className="w-3 h-3" />
                </TabsTrigger>
                <TabsTrigger value="objects" className="text-xs">
                  <Trees className="w-3 h-3" />
                </TabsTrigger>
                <TabsTrigger value="biomes" className="text-xs">
                  <Palette className="w-3 h-3" />
                </TabsTrigger>
                <TabsTrigger value="lighting" className="text-xs">
                  <Sun className="w-3 h-3" />
                </TabsTrigger>
              </TabsList>
              
              <ScrollArea className="h-[calc(100vh-200px)]">
                <div className="p-3 space-y-4">
                  <TabsContent value="terrain" className="mt-0">
                    <div className="space-y-4">
                      <div>
                        <Label>Seed</Label>
                        <Input
                          type="number"
                          value={terrainSettings.seed}
                          onChange={(e) => setTerrainSettings(prev => ({
                            ...prev,
                            seed: parseInt(e.target.value) || 0
                          }))}
                        />
                      </div>
                      
                      <div>
                        <Label>Scale: {terrainSettings.scale}</Label>
                        <Slider
                          value={[terrainSettings.scale]}
                          onValueChange={([value]) => setTerrainSettings(prev => ({
                            ...prev,
                            scale: value
                          }))}
                          min={10}
                          max={500}
                          step={10}
                        />
                      </div>
                      
                      <div>
                        <Label>Octaves: {terrainSettings.octaves}</Label>
                        <Slider
                          value={[terrainSettings.octaves]}
                          onValueChange={([value]) => setTerrainSettings(prev => ({
                            ...prev,
                            octaves: value
                          }))}
                          min={1}
                          max={8}
                          step={1}
                        />
                      </div>
                      
                      <div>
                        <Label>Height Multiplier: {terrainSettings.heightMultiplier}</Label>
                        <Slider
                          value={[terrainSettings.heightMultiplier]}
                          onValueChange={([value]) => setTerrainSettings(prev => ({
                            ...prev,
                            heightMultiplier: value
                          }))}
                          min={1}
                          max={100}
                          step={1}
                        />
                      </div>
                      
                      <Button 
                        onClick={generateTerrain}
                        disabled={isGenerating}
                        className="w-full"
                      >
                        {isGenerating ? (
                          <>
                            <div className="animate-spin w-4 h-4 border-2 border-current border-t-transparent rounded-full mr-2" />
                            Generating...
                          </>
                        ) : (
                          'Generate Terrain'
                        )}
                      </Button>
                      
                      {isGenerating && (
                        <Progress value={generationProgress} className="w-full" />
                      )}
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="objects" className="mt-0">
                    <div className="space-y-3">
                      <Label>Object Library</Label>
                      {objectLibrary.map(object => (
                        <DraggableObject key={object.id} object={object} />
                      ))}
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="biomes" className="mt-0">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label>Biomes</Label>
                        <Button size="sm" variant="outline">
                          <Plus className="w-3 h-3 mr-1" />
                          Add
                        </Button>
                      </div>
                      
                      {biomes.map(biome => (
                        <Card key={biome.id} className="p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">{biome.name}</span>
                            <div
                              className="w-4 h-4 rounded-full border"
                              style={{ backgroundColor: biome.color }}
                            />
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Height: {biome.heightRange[0]}-{biome.heightRange[1]}
                          </div>
                        </Card>
                      ))}
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="lighting" className="mt-0">
                    <div className="space-y-4">
                      <div>
                        <Label>Sun Intensity: {lightingSettings.sunIntensity}</Label>
                        <Slider
                          value={[lightingSettings.sunIntensity * 100]}
                          onValueChange={([value]) => setLightingSettings(prev => ({
                            ...prev,
                            sunIntensity: value / 100
                          }))}
                          min={0}
                          max={200}
                          step={5}
                        />
                      </div>
                      
                      <div>
                        <Label>Ambient Light: {lightingSettings.ambientLight}</Label>
                        <Slider
                          value={[lightingSettings.ambientLight * 100]}
                          onValueChange={([value]) => setLightingSettings(prev => ({
                            ...prev,
                            ambientLight: value / 100
                          }))}
                          min={0}
                          max={100}
                          step={5}
                        />
                      </div>
                      
                      <Separator />
                      
                      <div className="flex items-center justify-between">
                        <Label>Weather System</Label>
                        <Switch
                          checked={weatherSettings.enabled}
                          onCheckedChange={(checked) => setWeatherSettings(prev => ({
                            ...prev,
                            enabled: checked
                          }))}
                        />
                      </div>
                      
                      {weatherSettings.enabled && (
                        <Select
                          value={weatherSettings.type}
                          onValueChange={(value) => setWeatherSettings(prev => ({
                            ...prev,
                            type: value
                          }))}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Weather type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="clear">Clear</SelectItem>
                            <SelectItem value="rain">Rain</SelectItem>
                            <SelectItem value="snow">Snow</SelectItem>
                            <SelectItem value="fog">Fog</SelectItem>
                            <SelectItem value="storm">Storm</SelectItem
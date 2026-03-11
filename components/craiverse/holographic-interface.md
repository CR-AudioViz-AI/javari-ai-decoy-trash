# Create Holographic Interface Component

# Holographic Interface Component Documentation

## Purpose

The Holographic Interface Component enables the creation of immersive holographic UI elements within a 3D environment using React and Three.js. It supports gesture interactions, adaptive transparency, and customizable lighting, offering an engaging user experience for applications in augmented or virtual reality.

## Usage

To use the Holographic Interface Component, import it into your React application and wrap your UI elements with it. You can also utilize the various sub-components it provides, including menus, buttons, panels, and text.

```tsx
import HolographicInterface from 'components/craiverse/holographic-interface';

const MyApp = () => {
  return (
    <HolographicInterface 
      className="my-holographic-interface" 
      environmentLighting={0.5} 
      gestureEnabled={true}
      particleCount={100}
    >
      {/* Your content here */}
    </HolographicInterface>
  );
};
```

## Parameters/Props

### HolographicInterfaceProps

- `children` (React.ReactNode): Child elements to render within the interface.
- `className` (string): Optional custom class name for styling.
- `environmentLighting` (number): Controls the lighting intensity of the environment (0 to 1).
- `gestureEnabled` (boolean): Enables gesture-based interactions if set to true.
- `adaptiveTransparency` (boolean): If true, adjusts the transparency based on user interaction.
- `particleCount` (number): Number of particles in the holographic display.
- `onGesture` (function): Callback function triggered on gesture detection.
- `onEnvironmentChange` (function): Callback when the environment lighting changes.
- `aria-label` (string): Accessible label for screen readers.

### HolographicMenuProps

- `items` (MenuItem[]): Array of menu items.
- `position` ([number, number, number]): Menu position in 3D space.
- `rotation` ([number, number, number]): Rotation of the menu.
- `onItemSelect` (function): Callback when a menu item is selected.
- `className` (string): Optional custom class for styling.
- `isOpen` (boolean): Controls the visibility of the menu.

### HolographicButtonProps

- `children` (React.ReactNode): Content of the button.
- `onClick` (function): Callback function when button is clicked.
- `variant` ('primary' | 'secondary' | 'ghost'): Style variant of the button.
- `size` ('sm' | 'md' | 'lg'): Size of the button.
- `glowIntensity` (number): Intensity of the button's glow effect.
- `className` (string): Optional custom class for styling.
- `disabled` (boolean): Disables the button if true.
- `aria-label` (string): Accessible label for the button.

### HolographicPanelProps

- `children` (React.ReactNode): Content inside the panel.
- `width` (number): Width of the panel.
- `height` (number): Height of the panel.
- `opacity` (number): Opacity of the panel.
- `edgeLighting` (boolean): Enables edge lighting effects.
- `className` (string): Optional custom class for styling.
- `aria-labelledby` (string): References the label for the panel.

### HolographicTextProps

- `children` (string): Text content to be displayed.
- `size` (number): Size of the text.
- `color` (string): Color of the text.
- `glowIntensity` (number): Intensity of the text glow effect.
- `depth` (number): Depth for text rendering effects.
- `className` (string): Optional custom class for styling.

## Return Values

The component returns a rendered 3D holographic interface with interactive elements based on the defined props. The interface responds to gestures and environmental changes as configured through the provided callbacks.

## Examples

### Basic Holographic Interface

```tsx
<HolographicInterface 
  environmentLighting={0.8} 
  gestureEnabled={true} 
  onGesture={(gesture) => console.log('Gesture detected: ', gesture)} 
>
  <HolographicMenu 
    items={[
      { id: '1', label: 'Option 1', action: () => console.log('Selected Option 1') },
      { id: '2', label: 'Option 2', action: () => console.log('Selected Option 2') },
    ]}
  />
</HolographicInterface>
```

This code snippet demonstrates how to create a holographic interface with a menu, allowing for gesture interactions and logging selected options to the console.
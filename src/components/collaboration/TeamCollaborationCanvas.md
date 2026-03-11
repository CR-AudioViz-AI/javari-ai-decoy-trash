# Create Team Collaboration Canvas Component

# Team Collaboration Canvas Component

## Purpose
The `TeamCollaborationCanvas` component provides a collaborative interface for teams to visualize and manage workflows. It utilizes the React Flow library to create interactive nodes and edges representing tasks and their relationships within a workflow. This component supports real-time updates for collaborators, allowing users to design, modify, and track tasks effectively.

## Usage
To use the `TeamCollaborationCanvas`, import it into your React component and provide the necessary props. It can be integrated into any application that requires team collaboration on workflows.

```tsx
import TeamCollaborationCanvas from './src/components/collaboration/TeamCollaborationCanvas';

const MyComponent = () => {
  return (
    <TeamCollaborationCanvas
      workspaceId="YOUR_WORKSPACE_ID"
      userId="YOUR_USER_ID"
      onWorkflowUpdate={handleWorkflowUpdate}
      onCollaboratorJoin={handleCollaboratorJoin}
      className="custom-class"
    />
  );
};
```

## Parameters/Props

| Prop                   | Type                     | Description                                                                 |
|------------------------|--------------------------|-----------------------------------------------------------------------------|
| `workspaceId`          | `string`                 | The unique ID of the workspace.                                             |
| `userId`               | `string`                 | The unique ID of the user interacting with the canvas.                     |
| `onWorkflowUpdate`     | `(workflow: WorkflowData) => void` | Callback triggered when the workflow is updated.                           |
| `onCollaboratorJoin`   | `(collaborator: Collaborator) => void` | Callback triggered when a new collaborator joins the workspace.            |
| `className`            | `string` (optional)      | Additional CSS class names for custom styling.                             |

## Return Values
This component does not return any values directly. It provides callbacks to handle workflow updates and collaborator events, allowing parent components to respond to changes and updates in real-time.

## Examples

```tsx
const handleWorkflowUpdate = (workflow) => {
  console.log("Updated Workflow:", workflow);
};

const handleCollaboratorJoin = (collaborator) => {
  console.log("New Collaborator Joined:", collaborator);
};

// Implementation in the main component
<TeamCollaborationCanvas
  workspaceId="12345"
  userId="67890"
  onWorkflowUpdate={handleWorkflowUpdate}
  onCollaboratorJoin={handleCollaboratorJoin}
  className="team-canvas"
/>
```

## Notes
- Uses React Flow for rendering the canvas and enabling interactive features like dragging and connecting nodes.
- Integrates DnD (Drag and Drop) capabilities for a seamless user experience.
- Customize UI elements using provided UI components like Button, Input, and Dialog from the UI library. 

This component is designed for modern applications requiring complex workflow management while allowing team collaboration in real-time.
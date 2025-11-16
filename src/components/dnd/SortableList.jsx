import React from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";

export default function SortableList({ 
  items, 
  onReorder, 
  renderItem,
  droppableId = "sortable-list",
  isLoading = false
}) {
  const handleDragEnd = (result) => {
    if (!result.destination || isLoading) return;
    
    const { source, destination } = result;
    if (source.index === destination.index) return;

    const reorderedItems = Array.from(items);
    const [removed] = reorderedItems.splice(source.index, 1);
    reorderedItems.splice(destination.index, 0, removed);

    // Update sort_order for all affected items
    const updates = reorderedItems.map((item, index) => ({
      ...item,
      sort_order: index
    }));

    onReorder(updates);
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId={droppableId}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`space-y-2 ${snapshot.isDraggingOver ? 'bg-gray-900/20 rounded-lg p-2' : ''}`}
          >
            {items.map((item, index) => (
              <Draggable
                key={item.id}
                draggableId={item.id}
                index={index}
                isDragDisabled={isLoading}
              >
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                    className={`${
                      snapshot.isDragging ? 'opacity-50 rotate-2' : ''
                    } transition-all`}
                  >
                    {renderItem(item, index)}
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
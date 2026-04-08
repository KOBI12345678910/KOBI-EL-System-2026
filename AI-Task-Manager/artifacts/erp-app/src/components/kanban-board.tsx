import React, { useState } from "react";
import { GripVertical, Plus, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface KanbanCard {
  id: string | number;
  title: string;
  description?: string;
  status: string;
  priority?: "low" | "medium" | "high" | "critical";
  assignee?: string;
  dueDate?: string;
  metadata?: Record<string, any>;
}

interface KanbanColumn {
  status: string;
  title: string;
  color: string;
}

interface KanbanBoardProps {
  cards: KanbanCard[];
  columns: KanbanColumn[];
  onCardMove?: (cardId: string | number, fromStatus: string, toStatus: string) => void;
  onCardClick?: (card: KanbanCard) => void;
  readOnly?: boolean;
  className?: string;
}

const priorityColors = {
  critical: "border-l-4 border-red-500",
  high: "border-l-4 border-orange-500",
  medium: "border-l-4 border-blue-500",
  low: "border-l-4 border-gray-400"
};

export default function KanbanBoard({
  cards,
  columns,
  onCardMove,
  onCardClick,
  readOnly = false,
  className = ""
}: KanbanBoardProps) {
  const [draggedCard, setDraggedCard] = useState<KanbanCard | null>(null);
  const [draggedFrom, setDraggedFrom] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, card: KanbanCard) => {
    if (readOnly) return;
    setDraggedCard(card);
    setDraggedFrom(card.status);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, toStatus: string) => {
    e.preventDefault();
    if (draggedCard && draggedFrom && draggedFrom !== toStatus && onCardMove) {
      onCardMove(draggedCard.id, draggedFrom, toStatus);
      setDraggedCard(null);
      setDraggedFrom(null);
    }
  };

  const getCardsByStatus = (status: string) => {
    return cards.filter(card => card.status === status);
  };

  return (
    <div className={`flex gap-4 overflow-x-auto p-4 bg-muted/20 rounded-lg ${className}`}>
      {columns.map(column => {
        const columnCards = getCardsByStatus(column.status);
        return (
          <div
            key={column.status}
            className="flex-shrink-0 w-80 flex flex-col gap-3"
          >
            {/* Column Header */}
            <div className={`${column.color} rounded-lg p-3 text-foreground`}>
              <h3 className="font-bold text-sm">{column.title}</h3>
              <p className="text-xs opacity-80">{columnCards.length} הוראה</p>
            </div>

            {/* Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, column.status)}
              className={`flex-1 rounded-lg border-2 border-dashed gap-2 flex flex-col p-2 min-h-96 transition-colors ${
                draggedFrom === column.status && draggedCard
                  ? "border-blue-400 bg-blue-50 dark:bg-blue-950/20"
                  : "border-border bg-card/50"
              }`}
            >
              <AnimatePresence>
                {columnCards.map((card, idx) => (
                  <motion.div
                    key={card.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    draggable={!readOnly}
                    onDragStart={(e) => handleDragStart(e, card)}
                    onClick={() => onCardClick?.(card)}
                    className={`p-3 rounded-lg bg-card border shadow-sm cursor-move hover:shadow-md transition-all group ${
                      priorityColors[card.priority || "low"] || ""
                    }`}
                  >
                    <div className="flex gap-2 items-start">
                      {!readOnly && (
                        <GripVertical
                          size={16}
                          className="text-muted-foreground opacity-0 group-hover:opacity-100 flex-shrink-0 mt-0.5"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm truncate text-foreground">
                          {card.title}
                        </h4>
                        {card.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                            {card.description}
                          </p>
                        )}
                        {(card.assignee || card.dueDate) && (
                          <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
                            {card.assignee && <span>👤 {card.assignee}</span>}
                            {card.dueDate && <span>📅 {card.dueDate}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {columnCards.length === 0 && (
                <div className="flex items-center justify-center h-96 text-muted-foreground text-sm">
                  {draggedFrom !== column.status ? "אין הוראות" : "שחרור כאן"}
                </div>
              )}
            </div>

            {!readOnly && (
              <button className="px-3 py-2 rounded-lg border border-border hover:bg-muted/50 text-sm font-medium flex items-center gap-2 justify-center">
                <Plus size={16} />
                הוסף הוראה
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

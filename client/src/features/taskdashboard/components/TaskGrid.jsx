// src/features/taskdashboard/components/TaskGrid.jsx
import { Link } from "react-router-dom";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";


const TASK_DESCRIPTIONS = {
  Receiving: "Record and manage incoming shipments and inventory stock.",
  Packing: "Assemble and pack food boxes for distribution.",
  Decanting: "Unpack bulk supplies and transfer to processing areas.",
  Dispatch: "Schedule and manage outbound deliveries to recipient sites.",
};

export function TaskGrid({ tasks, reducedMovement }) {
  return (
    <TooltipProvider>
      <div className="task-grid">
        {tasks.map((task) => (
          <Tooltip key={task.to}>
            <TooltipTrigger asChild>
              <Link to={task.to} className="task-card">
                {!reducedMovement && task.icon && (
                  <img
                    src={task.icon}
                    alt=""
                    className="task-card__icon"
                  />
                )}
                <span className="task-card__title">{task.title}</span>
              </Link>
            </TooltipTrigger>
            <TooltipContent>
              <p>{TASK_DESCRIPTIONS[task.title] ?? `Navigate to ${task.title}`}</p>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
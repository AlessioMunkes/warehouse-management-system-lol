
// src/pages/Home.jsx
import { useState } from "react";
import { TopNavbar } from "../features/taskdashboard/components/TopNavBar";
import { Greeting } from "../features/taskdashboard/components/Greeting";
import { TaskGrid } from "../features/taskdashboard/components/TaskGrid";
import { useAuth } from "@/context/AuthContext";
import { STAFF, PACKING } from "../routes/paths";


import receivingIcon from "./../../public/icons/receiving-icon.svg";
import packingIcon from "./../../public/icons/packing-icon.svg";
import decantingIcon from "./../../public/icons/decanting-icon.svg";
import dispatchIcon from "./../../public/icons/dispatch-icon.svg";

export default function Home() {
  const { user } = useAuth();
  const firstName = user?.name?.split(" ")[0] ?? "";
  const [reducedMovement, setReducedMovement] = useState(false);

  const tasks = [
    { to: STAFF.receiving, icon: receivingIcon, title: "Receiving" },
    { to: PACKING.board, icon: packingIcon, title: "Packing" },
    { to: STAFF.decanting, icon: decantingIcon, title: "Decanting" },
    { to: STAFF.dispatch, icon: dispatchIcon, title: "Dispatch" },
  ];

  return (
    <>
      <TopNavbar
        reducedMovement={reducedMovement}
        onToggleMovement={setReducedMovement}
      />
      <main className="px-6 py-6 max-w-3xl mx-auto">
        <Greeting name={firstName} />
        <TaskGrid tasks={tasks} reducedMovement={reducedMovement} />
      </main>
    </>
  );
}
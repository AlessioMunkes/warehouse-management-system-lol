
// src/pages/Home.jsx
import { useState } from "react";
import { TopNavbar } from "../features/taskdashboard/components/TopNavBar";
import { Greeting } from "../features/taskdashboard/components/Greeting";
import { TaskGrid } from "../features/taskdashboard/components/TaskGrid";
import { useAuth } from "@/context/AuthContext";

import receivingIcon from "./../../public/icons/receiving-icon.svg";
import packingIcon from "./../../public/icons/packing-icon.svg";
import decantingIcon from "./../../public/icons/decanting-icon.svg";
import dispatchIcon from "./../../public/icons/dispatch-icon.svg";

export default function Home() {
  const { user } = useAuth();
  const firstName = user?.name?.split(" ")[0] ?? "";
  const [reducedMovement, setReducedMovement] = useState(false);

  const tasks = [
    { to: "/receiving", icon: receivingIcon, title: "Receiving" },
    { to: "/noc/packing", icon: packingIcon, title: "Packing" },
    { to: "/decanting", icon: decantingIcon, title: "Decanting" },
    { to: "/dispatch", icon: dispatchIcon, title: "Dispatch" },
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

// src/pages/Home.jsx
import { useState } from "react";
import { TopNavbar } from "../features/taskdashboard/components/TopNavBar";
import { Greeting } from "../features/taskdashboard/components/Greeting";
import { TaskGrid } from "../features/taskdashboard/components/TaskGrid";
import { useAuth } from "./../context/AuthContext";
import { STAFF, PACKING } from "../routes/paths";


import donationIcon from "./../../public/icons/donation-Icon.svg.jpg";
import receivingIcon from "./../../public/icons/receiving-icon.svg";
import packingIcon from "./../../public/icons/packing-icon.svg";
import decantingIcon from "./../../public/icons/decanting-icon.svg";
import dispatchIcon from "./../../public/icons/dispatch-icon.svg";

export default function Home() {
  const { user } = useAuth();
  const firstName = user?.firstName ?? "";
  const [reducedMovement, setReducedMovement] = useState(false);

  const tasks = [
    { to: STAFF.receiving, icon: receivingIcon, title: "Receiving" },
    { to: PACKING.board, icon: packingIcon, title: "Packing" },
    { to: STAFF.decanting, icon: decantingIcon, title: "Decanting" },
    { to: STAFF.dispatch, icon: dispatchIcon, title: "Dispatch" },
    { to: STAFF.donation, icon: donationIcon, title: "Donation" },
    // Receipts is manager-only and deliberately absent here. The tile and the
    // route guard in App.jsx have to agree — a hidden tile on an open route is
    // not access control, it is just a tidier way to lose track of one.

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

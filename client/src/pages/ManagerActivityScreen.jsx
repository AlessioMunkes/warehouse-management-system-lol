// src/pages/ManagerActivityScreen.jsx
import { useNavigate } from "react-router-dom";
import PageHeader from "../features/programmeSelection/components/PageHeader";
import ManagerActivitySelect from "../features/ManagerActivitySelection/ManagerSelection";
import { useAuth } from "../context/AuthContext";

export default function ManagerActivityScreen() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <>
      <PageHeader status="" onLogout={handleLogout} showBack={true} />
      <ManagerActivitySelect />
    </>
  );
}
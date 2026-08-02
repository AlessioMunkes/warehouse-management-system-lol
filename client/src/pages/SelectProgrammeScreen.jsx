import { useNavigate } from "react-router-dom";
import PageHeader from "../features/programmeSelection/components/PageHeader";
import ProgrammeSelect from "../features/programmeSelection/components/ProgrammeSelect";
import { useAuth } from "../context/AuthContext";

export default function SelectProgrammeScreen() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <>
      <PageHeader status="SYS OK" onLogout={handleLogout} showBack={false} />
      <ProgrammeSelect />
    </>
  );
}
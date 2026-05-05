import { StudioShell } from "./components/layout/StudioShell";
import { useStudioData } from "./hooks/useStudioData";

export default function App() {
  const studio = useStudioData();

  return <StudioShell studio={studio} />;
}

import KickAndSnare from "./KickAndSnare.tsx";
import ErrorBoundary from "./components/ErrorBoundary";

export default function App() {
  return (
    <ErrorBoundary>
      <KickAndSnare />
    </ErrorBoundary>
  );
}

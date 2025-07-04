//App.tsx
import React from "react";
import Calendar from "./Calendar";
import ErrorBoundary from "./ErrorBoundary";

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <div className="App">
        <Calendar />
      </div>
    </ErrorBoundary>
  );
};

export default App;

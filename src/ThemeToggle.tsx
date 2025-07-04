import React from 'react';
import { useTheme } from './ThemeContext';

const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle"
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      <span className="theme-icon" aria-hidden="true">
        {theme === 'light' ? '🌙' : '☀️'}
      </span>
    </button>
  );
};

export default ThemeToggle; 
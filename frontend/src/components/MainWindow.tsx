import { theme } from '../theme';
import React from 'react';

interface MainWindowProps {
  children: React.ReactNode;
  headerContent?: React.ReactNode;
}

const MainWindow: React.FC<MainWindowProps> = ({ children, headerContent }) => {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: theme.colors.white,
      position: 'relative',
      margin: 0,
    }}>
      {/* Header with model management and other controls */}
      {headerContent && (
        <div style={{
          padding: '12px 24px',
          borderBottom: '1px solid theme.colors.text.quaternary',
          backgroundColor: 'theme.colors.highlight.quaternary',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '12px',
        }}>
          {headerContent}
        </div>
      )}

      {/* Main content area */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  );
};

export default MainWindow;

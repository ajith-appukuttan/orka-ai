import { useCallback, useEffect, useRef, useState } from 'react';
import { Box } from '@mantine/core';

interface ResizeHandleProps {
  onResize: (deltaX: number) => void;
}

export function ResizeHandle({ onResize }: ResizeHandleProps) {
  const [isDragging, setIsDragging] = useState(false);
  const lastX = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    lastX.current = e.clientX;
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - lastX.current;
      lastX.current = e.clientX;
      onResize(delta);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, onResize]);

  return (
    <Box
      onMouseDown={handleMouseDown}
      style={{
        width: 6,
        cursor: 'col-resize',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: isDragging ? 'none' : 'background 150ms ease',
        background: isDragging ? 'var(--mantine-color-blue-5)' : 'transparent',
        position: 'relative',
        zIndex: 10,
      }}
      onMouseEnter={(e) => {
        if (!isDragging) {
          (e.currentTarget as HTMLElement).style.background = 'var(--mantine-color-gray-4)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isDragging) {
          (e.currentTarget as HTMLElement).style.background = 'transparent';
        }
      }}
    >
      {/* Grip dots */}
      <Box
        style={{
          width: 4,
          height: 32,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          opacity: isDragging ? 1 : 0.4,
        }}
      >
        <Box
          style={{
            width: 2,
            height: 2,
            borderRadius: '50%',
            background: 'var(--mantine-color-gray-5)',
          }}
        />
        <Box
          style={{
            width: 2,
            height: 2,
            borderRadius: '50%',
            background: 'var(--mantine-color-gray-5)',
          }}
        />
        <Box
          style={{
            width: 2,
            height: 2,
            borderRadius: '50%',
            background: 'var(--mantine-color-gray-5)',
          }}
        />
      </Box>
    </Box>
  );
}

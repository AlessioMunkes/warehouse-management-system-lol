import React, { useRef, useState, useEffect } from 'react';
import { RotateCcw } from 'lucide-react';

const SignatureCanvas = ({ onSave, onClear }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  }, []);

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();

    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();

    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    if (isDrawing && hasSignature) {
      const canvas = canvasRef.current;
      const signatureData = canvas.toDataURL('image/png');
      onSave(signatureData);
    }
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onClear();
  };

  return (
    <div>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '8px',
      }}>
        <label style={{
          fontSize: '15px',
          fontWeight: 600,
          color: 'rgba(255,255,255,0.85)',
        }}>
          Driver Signature <span style={{ color: '#ef4444' }}>*</span>
        </label>

        <button
          type="button"
          onClick={clearCanvas}
          disabled={!hasSignature}
          style={{
            padding: '6px 12px',
            background: hasSignature ? 'rgba(220,38,38,0.2)' : 'rgba(255,255,255,0.05)',
            border: hasSignature ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.1)',
            borderRadius: '8px',
            color: hasSignature ? '#fca5a5' : 'rgba(255,255,255,0.3)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: hasSignature ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'background 0.2s',
          }}
        >
          <RotateCcw size={14} />
          Clear
        </button>
      </div>

      <canvas
        ref={canvasRef}
        width={450}
        height={200}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        style={{
          width: '100%',
          height: '200px',
          background: '#fff',
          borderRadius: '10px',
          border: '1px solid rgba(255,255,255,0.18)',
          cursor: 'crosshair',
          touchAction: 'none',
        }}
      />

      <p style={{
        fontSize: '12px',
        color: 'rgba(255,255,255,0.55)',
        marginTop: '6px',
        textAlign: 'center',
      }}>
        Sign above with mouse or touch
      </p>
    </div>
  );
};

export default SignatureCanvas;
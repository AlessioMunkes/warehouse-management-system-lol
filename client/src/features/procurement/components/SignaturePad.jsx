// ─────────────────────────────────────────────────────────────
// client/src/features/procurement/components/SignaturePad.jsx
//
// THE BUG THIS FIXES
// The canvas had a fixed bitmap of 800x220 and CSS sizing it to
// `width: 100%; height: 170px`. Pointer positions were taken in CSS
// pixels (clientX - rect.left) and handed straight to the 2D context,
// which draws in BITMAP pixels. In a 280px-wide column that is a
// horizontal scale of 800/280, so a stroke landed almost three times
// further right than the pen — far enough that the only way to sign
// inside the box was to move the cursor outside it.
//
// The fix is to stop having two coordinate systems. The bitmap is
// sized to the element's own box (times devicePixelRatio, so it is
// not blurry on a retina tablet) and the context is scaled once, so
// everything below can work in plain CSS pixels.
//
// Resizing a canvas clears it, and the element resizes whenever the
// two-pane layout crosses its breakpoint — so the drawing is snapshot
// and repainted around every resize. Losing a driver's signature
// because someone rotated a tablet is not an acceptable trade.
// ─────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';

const SignaturePad = ({
  onChange,
  canvasClassName = 'signature-canvas',
  clearButtonClassName = 'btn-link',
}) => {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const inked = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

  const applyStrokeStyle = (ctx) => {
    ctx.strokeStyle = '#201F1E';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  // Match the bitmap to the box, then scale the context so one unit of
  // drawing is one CSS pixel. Called on mount and on every resize.
  const fitToBox = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const ratio = window.devicePixelRatio || 1;
    const next = { w: Math.round(rect.width * ratio), h: Math.round(rect.height * ratio) };
    if (canvas.width === next.w && canvas.height === next.h) return;

    // Snapshot first — setting width/height wipes the bitmap.
    let snapshot = null;
    if (inked.current && canvas.width > 0 && canvas.height > 0) {
      try { snapshot = canvas.toDataURL('image/png'); } catch { snapshot = null; }
    }

    canvas.width  = next.w;
    canvas.height = next.h;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    applyStrokeStyle(ctx);

    if (snapshot) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = snapshot;
    }
  }, []);

  useEffect(() => {
    fitToBox();
    // jsdom has no ResizeObserver, and the test environment is exactly
    // where an unguarded `new ResizeObserver` throws an unhandled error
    // into an otherwise passing suite.
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(fitToBox);
    if (canvasRef.current) observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, [fitToBox]);

  // CSS pixels relative to the element. The context is already scaled,
  // so no bitmap conversion belongs here.
  const getPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const point = e.touches && e.touches.length ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    applyStrokeStyle(ctx);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // A dot is a mark. The old version only counted a signature once
    // the pointer MOVED, so a single tap drew a dot that was never
    // saved and left the finish button disabled with no explanation.
    ctx.lineTo(x, y);
    ctx.stroke();
    drawing.current = true;
    inked.current = true;
  };

  const draw = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (!inked.current) return;
    setHasSignature(true);
    onChange?.(canvasRef.current.toDataURL('image/png'));
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width || canvas.width, rect.height || canvas.height);
    inked.current = false;
    setHasSignature(false);
    onChange?.(null);
  };

  return (
    <div>
      {/* No width/height attributes: fitToBox owns the bitmap, and a
          hard-coded pair here is what put the two coordinate systems
          out of step in the first place. */}
      <canvas
        ref={canvasRef}
        className={canvasClassName}
        aria-label="Signature area"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />
      <div className="signature-actions">
        <button
          type="button"
          className={clearButtonClassName}
          onClick={clearSignature}
          disabled={!hasSignature}
        >
          Clear signature
        </button>
      </div>
    </div>
  );
};

export default SignaturePad;

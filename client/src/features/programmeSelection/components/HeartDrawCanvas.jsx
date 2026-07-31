// HeartDrawCanvas.jsx
// Drawing surface for the "draw a heart to continue" gesture.
// Renders a maroon stroke with a neon accent glow while the
// worker draws, runs a lenient shape check on release, and plays
// a small celebratory burst before calling onUnlocked. A tap-to-skip
// link is always available so the gesture never hard-blocks access.

import { useRef, useState, useCallback } from "react";

// Lenient heart-shape check. Doesn't try to match a heart
// precisely — just checks that the worker drew something
// substantial, roughly square-ish in bounding box (hearts aren't
// long thin scribbles), and with at least one dip/rise
// suggesting two lobes and a bottom point. Errs toward accepting.
function looksHeartIsh(points) {
  if (points.length < 12) return false;

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);

  if (width < 40 || height < 40) return false;

  const ratio = width / height;
  if (ratio < 0.5 || ratio > 2) return false;

  let directionChanges = 0;
  let lastDirection = 0;
  for (let i = 1; i < points.length; i++) {
    const dy = points[i].y - points[i - 1].y;
    const direction = dy > 1 ? 1 : dy < -1 ? -1 : 0;
    if (direction !== 0 && lastDirection !== 0 && direction !== lastDirection) {
      directionChanges++;
    }
    if (direction !== 0) lastDirection = direction;
  }

  return directionChanges >= 1;
}

export default function HeartDrawCanvas({ onUnlocked }) {
  const canvasRef = useRef(null);
  const pointsRef = useRef([]);
  const drawingRef = useRef(false);

  const [hint, setHint] = useState(null); // null | "retry"
  const [celebrating, setCelebrating] = useState(false);

  const getCanvasPoint = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDraw = (e) => {
    e.preventDefault();
    drawingRef.current = true;
    pointsRef.current = [getCanvasPoint(e)];
    setHint(null);
  };

  const moveDraw = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const point = getCanvasPoint(e);
    pointsRef.current.push(point);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const points = pointsRef.current;
    if (points.length < 2) return;

    const prev = points[points.length - 2];

    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    ctx.shadowColor = "rgba(227, 30, 36, 0.6)";
    ctx.shadowBlur = 12;
    ctx.strokeStyle = "rgba(227, 30, 36, 0.35)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#7A1A1A";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pointsRef.current = [];
  }, []);

  const endDraw = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;

    if (looksHeartIsh(pointsRef.current)) {
      setCelebrating(true);
      setTimeout(() => {
        onUnlocked();
      }, 650);
    } else {
      setHint("retry");
      setTimeout(() => {
        clearCanvas();
        setHint(null);
      }, 900);
    }
  };

  return (
    <div>
      <div className={`step-card heart-canvas-card ${celebrating ? "heart-canvas-celebrate" : ""}`}>
        <span aria-hidden="true" className="heart-float heart-float-1">♥</span>
        <span aria-hidden="true" className="heart-float heart-float-2">♥</span>
        <span aria-hidden="true" className="heart-float heart-float-3">♥</span>
        <span aria-hidden="true" className="heart-float heart-float-4">♥</span>

        <canvas
          ref={canvasRef}
          width={640}
          height={280}
          className="heart-canvas"
          onMouseDown={startDraw}
          onMouseMove={moveDraw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={moveDraw}
          onTouchEnd={endDraw}
        />

        {celebrating && (
          <div className="heart-burst-layer">
            <span className="heart-burst" aria-hidden="true">♥</span>
          </div>
        )}
      </div>

      <p className="heart-prompt">
        <span aria-hidden="true">♥</span>{" "}
        {hint === "retry" ? "Give it another go" : "Draw a heart to continue"}
      </p>

      <button type="button" className="btn-link mt-1" onClick={onUnlocked}>
        Skip
      </button>
    </div>
  );
}
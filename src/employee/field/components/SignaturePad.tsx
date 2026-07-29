import { useRef, useState, useEffect, useCallback } from 'react';
import { Eraser, Check, X } from 'lucide-react';

interface SignaturePadProps {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}

export function SignaturePad({ onSave, onCancel }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hasStrokes, setHasStrokes] = useState(false);
  let drawing = false;
  let lastX = 0;
  let lastY = 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1e293b';
  }, []);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawing = true;
    const p = getPos(e);
    lastX = p.x;
    lastY = p.y;
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastX = p.x;
    lastY = p.y;
    setHasStrokes(true);
  };

  const endDraw = () => { drawing = false; };

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  }, []);

  const save = () => {
    if (!hasStrokes) return;
    const canvas = canvasRef.current!;
    onSave(canvas.toDataURL('image/png'));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-5 space-y-4">
        <div>
          <h3 className="text-base font-bold text-slate-900">Customer Signature</h3>
          <p className="text-xs text-slate-400">Have the customer sign below to confirm the work is complete.</p>
        </div>
        <div className="border-2 border-dashed border-slate-300 rounded-xl overflow-hidden bg-slate-50">
          <canvas
            ref={canvasRef}
            className="w-full h-48 touch-none cursor-crosshair"
            onPointerDown={startDraw}
            onPointerMove={draw}
            onPointerUp={endDraw}
            onPointerCancel={endDraw}
            onPointerLeave={endDraw}
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={clear}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-200 transition-colors"
          >
            <Eraser className="w-4 h-4" /> Clear
          </button>
          <button
            onClick={onCancel}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50 transition-colors"
          >
            <X className="w-4 h-4" /> Cancel
          </button>
          <button
            onClick={save}
            disabled={!hasStrokes}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            <Check className="w-4 h-4" /> Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

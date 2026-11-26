import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react"
import {
  moveCrop,
  resizeCrop,
  type CropHandle,
  type CropRect,
} from "./imageEditing"

interface ImageCropEditorProps {
  image: HTMLImageElement
  crop: CropRect
  aspect: number | null
  onChange: (crop: CropRect) => void
  label?: string
}

type DragState = {
  pointerId: number
  startX: number
  startY: number
  crop: CropRect
  handle: CropHandle | "move"
}

const HANDLES: { id: CropHandle; label: string; position: string; cursor: string }[] = [
  { id: "nw", label: "top left", position: "left-0 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "nwse-resize" },
  { id: "n", label: "top", position: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2", cursor: "ns-resize" },
  { id: "ne", label: "top right", position: "right-0 top-0 translate-x-1/2 -translate-y-1/2", cursor: "nesw-resize" },
  { id: "e", label: "right", position: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2", cursor: "ew-resize" },
  { id: "se", label: "bottom right", position: "bottom-0 right-0 translate-x-1/2 translate-y-1/2", cursor: "nwse-resize" },
  { id: "s", label: "bottom", position: "bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2", cursor: "ns-resize" },
  { id: "sw", label: "bottom left", position: "bottom-0 left-0 -translate-x-1/2 translate-y-1/2", cursor: "nesw-resize" },
  { id: "w", label: "left", position: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2", cursor: "ew-resize" },
]

export default function ImageCropEditor({
  image,
  crop,
  aspect,
  onChange,
  label = "Image crop editor",
}: ImageCropEditorProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [bounds, setBounds] = useState({ width: 0, height: 0 })
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return
    const update = () => {
      const rect = surface.getBoundingClientRect()
      setBounds({ width: rect.width, height: rect.height })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(surface)
    return () => observer.disconnect()
  }, [])

  const scale = Math.min(
    bounds.width / image.naturalWidth,
    bounds.height / image.naturalHeight,
  )
  const imageWidth = image.naturalWidth * scale
  const imageHeight = image.naturalHeight * scale
  const imageLeft = (bounds.width - imageWidth) / 2
  const imageTop = (bounds.height - imageHeight) / 2

  function toSourcePoint(clientX: number, clientY: number) {
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return {
      x: ((clientX - rect.left - imageLeft) / imageWidth) * image.naturalWidth,
      y: ((clientY - rect.top - imageTop) / imageHeight) * image.naturalHeight,
    }
  }

  function beginDrag(event: PointerEvent, handle: CropHandle | "move") {
    if (event.button !== 0 || !surfaceRef.current) return
    event.preventDefault()
    event.stopPropagation()
    surfaceRef.current.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      crop,
      handle,
    }
    setDragging(true)
  }

  function updateDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (drag.handle === "move") {
      const start = toSourcePoint(drag.startX, drag.startY)
      const current = toSourcePoint(event.clientX, event.clientY)
      onChange(
        moveCrop(
          drag.crop,
          current.x - start.x,
          current.y - start.y,
          image.naturalWidth,
          image.naturalHeight,
        ),
      )
      return
    }
    const point = toSourcePoint(event.clientX, event.clientY)
    onChange(
      resizeCrop(
        drag.crop,
        drag.handle,
        point.x,
        point.y,
        image.naturalWidth,
        image.naturalHeight,
        aspect,
      ),
    )
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setDragging(false)
    if (surfaceRef.current?.hasPointerCapture(event.pointerId)) {
      surfaceRef.current.releasePointerCapture(event.pointerId)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    const direction = directions[event.key]
    if (!direction) return
    event.preventDefault()
    const step = event.shiftKey ? 10 : 1
    onChange(
      moveCrop(
        crop,
        direction[0] * step,
        direction[1] * step,
        image.naturalWidth,
        image.naturalHeight,
      ),
    )
  }

  const cropLeft = (crop.x / image.naturalWidth) * 100
  const cropTop = (crop.y / image.naturalHeight) * 100
  const cropWidth = (crop.width / image.naturalWidth) * 100
  const cropHeight = (crop.height / image.naturalHeight) * 100

  return (
    <div
      ref={surfaceRef}
      className="relative h-[390px] touch-none overflow-hidden rounded-2xl border border-slate-300 bg-slate-950 sm:h-[520px]"
      onPointerMove={updateDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      aria-label={label}
    >
      {bounds.width > 0 && (
        <img
          src={image.src}
          alt="Source image for cropping"
          draggable={false}
          className="pointer-events-none absolute select-none"
          style={{ left: imageLeft, top: imageTop, width: imageWidth, height: imageHeight }}
        />
      )}
      {bounds.width > 0 && (
        <div
          role="group"
          tabIndex={0}
          aria-label={`Crop selection, ${Math.round(crop.width)} by ${Math.round(crop.height)} source pixels. Use arrow keys to move; hold Shift for 10 pixels.`}
          className="absolute cursor-move border-2 border-white outline-none ring-1 ring-blue-400 focus-visible:ring-4 focus-visible:ring-blue-300"
          style={{
            left: imageLeft + (crop.x / image.naturalWidth) * imageWidth,
            top: imageTop + (crop.y / image.naturalHeight) * imageHeight,
            width: (crop.width / image.naturalWidth) * imageWidth,
            height: (crop.height / image.naturalHeight) * imageHeight,
            boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.62)",
            cursor: dragging ? "grabbing" : "move",
          }}
          onPointerDown={(event) => beginDrag(event, "move")}
          onKeyDown={handleKeyDown}
        >
          <span className="pointer-events-none absolute inset-y-0 left-1/3 border-l border-white/50" />
          <span className="pointer-events-none absolute inset-y-0 left-2/3 border-l border-white/50" />
          <span className="pointer-events-none absolute inset-x-0 top-1/3 border-t border-white/50" />
          <span className="pointer-events-none absolute inset-x-0 top-2/3 border-t border-white/50" />
          {HANDLES.map((handle) => (
            <button
              key={handle.id}
              type="button"
              aria-label={`Resize crop from ${handle.label}`}
              className={`absolute z-10 h-5 w-5 rounded-full border-2 border-white bg-blue-500 shadow-md outline-none hover:scale-110 focus-visible:ring-4 focus-visible:ring-blue-300 ${handle.position}`}
              style={{ cursor: handle.cursor, touchAction: "none" }}
              onPointerDown={(event) => beginDrag(event, handle.id)}
            />
          ))}
          <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md bg-slate-950/80 px-2 py-1 text-xs font-semibold text-white">
            {Math.round(crop.width)} × {Math.round(crop.height)}
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 left-1/2 z-20 max-w-[90%] -translate-x-1/2 rounded-lg bg-slate-950/85 px-3 py-2 text-center text-xs leading-5 text-white backdrop-blur-sm">
        Drag inside the frame to move. Pull a handle to resize. Arrow keys move by 1 source pixel.
      </div>
      <span className="sr-only" style={{ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight }} />
    </div>
  )
}

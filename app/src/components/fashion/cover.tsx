"use client";
import { useRef, useState } from "react";
import { fashionImage } from "@/modules/catalog/fashion-image";

type Scene = { photo: string; object?: string };
const identity = (scene: Scene) => JSON.stringify([scene.photo, scene.object]);
export function Cover({
  photo,
  fallback,
  object,
}: {
  photo: string | null;
  fallback: string | null;
  object?: string;
}) {
  const [failed, setFailed] = useState<string[]>([]);
  const [layers, setLayers] = useState<{
    front: Scene | null;
    back: Scene | null;
  }>({ front: null, back: null });
  const shown = layers.front;
  const preferred =
    photo && !failed.includes(photo) && !(object && failed.includes(object));
  const candidate = preferred
    ? { photo, object }
    : fallback && !failed.includes(fallback)
      ? { photo: fallback }
      : null;
  const desired = candidate && identity(candidate);
  const first = useRef(desired);
  const requested = useRef(desired);
  requested.current = desired;
  const loaded = useRef(new Set<string>());
  const underlay = shown && identity(shown) !== desired ? shown : layers.back;
  const scenes = candidate
    ? [
        ...(underlay && identity(underlay) !== desired ? [underlay] : []),
        candidate,
      ]
    : shown
      ? [shown]
      : [];
  async function ready(img: HTMLImageElement, scene: Scene) {
    const key = identity(scene);
    try {
      await img.decode();
    } catch {
      if (!img.naturalWidth) return;
    }
    if (key !== requested.current) return;
    loaded.current.add(img.dataset.layer!);
    if (
      loaded.current.has(scene.photo) &&
      (!scene.object || loaded.current.has(scene.object))
    ) {
      setLayers((last) =>
        last.front && identity(last.front) === key
          ? last
          : {
              front: scene,
              back: matchMedia("(prefers-reduced-motion: reduce)").matches
                ? null
                : last.front,
            },
      );
      loaded.current = new Set([
        scene.photo,
        ...(scene.object ? [scene.object] : []),
      ]);
    }
  }
  function error(url: string) {
    setFailed((last) => [...last.slice(-7), url]);
  }
  return (
    <div className="fashion-cover" aria-hidden="true">
      {scenes.map((scene) => {
        const key = identity(scene);
        const pending = key === desired && !!shown && key !== identity(shown);
        return (
          <div
            key={key}
            onAnimationEnd={() => {
              if (key === requested.current)
                setLayers((last) => ({ ...last, back: null }));
            }}
            className={
              "fashion-scene" +
              (pending ? " waiting" : key === first.current ? "" : " revealed")
            }
          >
            {/* Native responsive images expose the first hero in the server HTML. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              {...fashionImage(scene.photo, true)}
              className="fashion-photo"
              alt=""
              data-layer={scene.photo}
              loading="eager"
              fetchPriority={key === first.current ? "high" : "auto"}
              draggable={false}
              onLoad={(e) => void ready(e.currentTarget, scene)}
              onError={() => error(scene.photo)}
            />
            {scene.object && (
              <div className="fashion-object">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  {...fashionImage(scene.object, true)}
                  alt=""
                  data-layer={scene.object}
                  draggable={false}
                  onLoad={(e) => void ready(e.currentTarget, scene)}
                  onError={() => error(scene.object!)}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

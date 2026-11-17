"use client";
import { useEffect, useRef, useState } from "react";
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
  const desiredLayer = useRef<HTMLDivElement>(null);
  const scenePhoto = candidate?.photo;
  const sceneObject = candidate?.object;
  const underlay = shown && identity(shown) !== desired ? shown : layers.back;
  const scenes = candidate
    ? [
        ...(underlay && identity(underlay) !== desired ? [underlay] : []),
        candidate,
      ]
    : shown
      ? [shown]
      : [];
  // A reverse drag can reuse the outgoing DOM image. It is already loaded,
  // so observe the desired scene itself instead of waiting for a new load event.
  useEffect(() => {
    if (!scenePhoto || !desiredLayer.current) return;
    let cancelled = false;
    const images = Array.from(desiredLayer.current.querySelectorAll("img"));
    const scene = { photo: scenePhoto, object: sceneObject };
    async function reveal() {
      const decoded = await Promise.all(images.map(async (img) => {
        try {
          await img.decode();
          return true;
        } catch {
          return img.complete && img.naturalWidth > 0;
        }
      }));
      if (cancelled || !decoded.every(Boolean)) return;
      setLayers((last) =>
        last.front && identity(last.front) === identity(scene) ? last : {
          front: scene,
          back: matchMedia("(prefers-reduced-motion: reduce)").matches ? null : last.front,
        },
      );
    }
    void reveal();
    return () => { cancelled = true; };
  }, [scenePhoto, sceneObject]);
  function error(url: string) {
    setFailed((last) => [...last.slice(-7), url]);
  }
  return (
    <div className="fashion-cover" aria-hidden="true">
      {scenes.map((scene) => {
        const key = identity(scene);
        const pending = key === desired && !!shown && key !== identity(shown);
        const revealing = key === desired && !pending && !!layers.back;
        return (
          <div
            key={key}
            ref={key === desired ? desiredLayer : undefined}
            onAnimationEnd={() => {
              if (key === desired)
                setLayers((last) => ({ ...last, back: null }));
            }}
            className={
              "fashion-scene" +
              (pending ? " waiting" : revealing ? " revealed" : "")
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

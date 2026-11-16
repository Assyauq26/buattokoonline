// The sandbox has an opaque origin. Only the editor performs authenticated reads.
export function previewRead<T>(
  request:
    | { type: "fashion-position"; id: string; pos: number }
    | { type: "fashion-asset"; id: string },
) {
  return new Promise<T>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => {
      channel.port1.close();
      reject(Error("Preview tidak merespons"));
    }, 15000);
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      channel.port1.close();
      if (e.data?.ok) resolve(e.data.value as T);
      else reject(Error("Preview gagal dimuat"));
    };
    parent.postMessage(
      { ...request, nonce: location.hash.slice(1) },
      new URL(location.href).origin,
      [channel.port2],
    );
  });
}

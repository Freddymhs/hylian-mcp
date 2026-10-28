export function lazy<T>(factory: () => T): () => T {
  const holder: { current?: { value: T } } = {};
  return () => {
    holder.current ??= { value: factory() };
    return holder.current.value;
  };
}

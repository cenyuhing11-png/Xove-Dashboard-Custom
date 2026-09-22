/** Test harness only: never assign this app to a user's renderer. */
export function fixtureOnlyApp<T extends { vault: any }>(app: T, allowed: ReadonlySet<string>): T {
 const vault = new Proxy(app.vault, { get(target, key) {
  if (key === 'getMarkdownFiles') return () => target.getMarkdownFiles().filter((file: { path: string }) => allowed.has(file.path));
  if (key === 'read' || key === 'cachedRead') return (file: { path: string }) => {
   if (!allowed.has(file.path)) throw new Error('Blocked non-fixture read');
   return target[key](file);
  };
  const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value;
 }});
 return new Proxy(app, { get(target, key) { return key === 'vault' ? vault : Reflect.get(target, key); } });
}

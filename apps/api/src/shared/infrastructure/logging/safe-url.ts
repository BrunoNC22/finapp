/** URL para o log: o caminho e só os nomes dos parâmetros. Valores podem ser buscas (descrições) ou quantias. */
export function safeUrl(url: string): string {
  const [path = '', query = ''] = url.split('?', 2);
  const names = query
    .split('&')
    .map((pair) => pair.split('=')[0] ?? '')
    .filter(Boolean);
  return names.length ? `${path}?${names.join('&')}` : path;
}

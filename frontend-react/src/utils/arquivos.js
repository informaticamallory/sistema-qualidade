/* Endereço das fotos de evidência.

   As imagens deixaram de ser gravadas em base64 dentro do registro e passaram
   a ir para disco, no volume do servidor. O que chega da API agora é um
   caminho como `uploads/fotos/injecao/2026-10/abc.jpg`, e quem monta a URL
   completa é aqui.

   A base é a mesma do restante das chamadas: o front é publicado num domínio
   e a API em outro, então caminho relativo apontaria para o lugar errado.
   Montar a URL no backend seria pior — sem ProxyFix, `request.host_url`
   devolve http atrás do proxy do EasyPanel, e o navegador bloqueia imagem
   insegura numa página https. */

const baseApi = import.meta.env.VITE_API_URL || '/api';

export const urlArquivo = (valor) => {
    const caminho = String(valor || '').trim();
    if (!caminho) return '';

    /* Registro antigo, ainda em base64, e endereço absoluto do R2 continuam
       funcionando como estão — a migração não precisa ter terminado para a
       tela abrir. */
    if (caminho.startsWith('data:') || caminho.startsWith('http://') || caminho.startsWith('https://')) {
        return caminho;
    }

    const relativo = caminho.startsWith('uploads/') ? caminho.slice('uploads/'.length) : caminho;
    return `${baseApi.replace(/\/$/, '')}/arquivos/${relativo}`;
};

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* Caminho da aplicação a partir da raiz do SITE — não da pasta no servidor.

   É `/` porque o subdomínio cqm.malloryapp.com.br aponta direto para
   `public_html/sistema-qualidade`: aquela pasta é a raiz do site, e a URL
   publicada não tem prefixo nenhum.

   O que engana aqui é que a pasta no servidor tem nome. Usar
   `/sistema-qualidade/` fez o HTML pedir `/sistema-qualidade/assets/...`, o
   servidor procurar em `sistema-qualidade/sistema-qualidade/assets/...`, não
   achar, e o `.htaccess` devolver o `index.html` — o navegador então recusa
   o módulo por MIME `text/html`, e a página fica com a `<div id="root">`
   vazia. O valor certo é o que aparece na barra de endereços, não o caminho
   no FTP.

   Só mudar daqui se a aplicação passar a ser servida dentro de um caminho,
   por exemplo `https://dominio.com/sistema-qualidade/`. O `basename` do
   React Router acompanha sozinho, via `import.meta.env.BASE_URL`. */
const BASE_PUBLICACAO = '/';

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  /* Só no build: no `npm run dev` a base fica em `/`, senão o servidor local
     passaria a responder em http://localhost:5173/sistema-qualidade/. */
  base: command === 'build' ? BASE_PUBLICACAO : '/',
  plugins: [react()],
  test: {
    environment: 'node',
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
}))

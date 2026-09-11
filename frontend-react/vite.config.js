import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* Pasta em que a aplicação é publicada, contada a partir da raiz do domínio.

   Sem isto o Vite escreve no index.html caminhos absolutos da raiz
   (`/assets/index-*.css`), que só funcionam se a pasta publicada FOR a raiz.
   Publicada em `public_html/sistema-qualidade`, o navegador pedia
   `https://dominio/assets/...` em vez de `https://dominio/sistema-qualidade/assets/...`
   e não achava nem o CSS nem o JS — a página ficava com a `<div id="root">`
   vazia, sem estilo e sem aplicação.

   Se a pasta mudar de lugar, ou se o domínio/subdomínio passar a apontar
   direto para ela, é esta linha que muda (`/` para raiz). O `basename` do
   React Router acompanha sozinho, via `import.meta.env.BASE_URL`. */
const BASE_PUBLICACAO = '/sistema-qualidade/';

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

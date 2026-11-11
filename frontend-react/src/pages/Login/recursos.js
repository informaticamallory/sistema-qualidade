/* Arquivos de imagem da tela de login.

   Dois recursos da referência visual não existem no repositório:

     1. O logotipo MALLORY por extenso. O projeto só tem o símbolo "M"
        (public/M.svg) e o selo de 50 anos (assets/imgem/ML-50-ANOS-LR.svg),
        que não é o wordmark.
     2. A fotografia industrial do painel esquerdo (prancheta, checklist,
        mão conferindo).

   Enquanto não chegarem, a tela funciona inteira: o wordmark é composto com
   a Sora, que é a fonte de título que o sistema já carrega, e o painel usa
   só gradiente, curvas e o selo desenhado em SVG.

   PARA TROCAR PELOS ARQUIVOS DE VERDADE
   -------------------------------------
   Coloque os arquivos nesta mesma pasta e troque os dois nulos abaixo pelos
   imports. Nada mais muda — o layout já está montado para os dois estados.

       import logo from './mallory-logo.svg';
       import foto from './chao-de-fabrica.webp';

       export const logoMallory = logo;
       export const fotoIndustrial = foto;

   Sobre os formatos:
     - logotipo: SVG de preferência (escala sem perda e pesa pouco). PNG com
       fundo transparente serve, de 600px de largura para cima.
     - fotografia: WebP ou JPG, 1600×1200 no mínimo, orientação retrato ou
       quadrada. Ela é coberta por um véu escuro, então imagem clara e com
       bastante contraste rende melhor. Acima de 400 KB vale comprimir antes:
       é o primeiro arquivo que todo usuário baixa, toda manhã. */

export const logoMallory = null;
export const fotoIndustrial = null;
